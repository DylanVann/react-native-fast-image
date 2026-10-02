// Records the screen of an iOS device connected over USB to QuickTime
// movies, as QuickTime Player's "New Movie Recording" does: macOS offers the
// device's screen as a capture device once screen capture devices are allowed
// (CoreMediaIO). Nothing runs on the device.
//
//   capture <device name or udid fragment>
//
// One process records every movie of a benchmark run, taking commands on
// stdin: a new process right after the last one exited often didn't find the
// device (macOS was still taking it down, and didn't offer it again).
//
//   start <out.mov>   records from the next frame; prints "recording" once
//                     frames are being written
//   stop [<x> <y>]    finishes the movie (with the point at fractions <x>,
//                     <y> of the screen blue, the benchmark's marker at the
//                     run's end: once a frame like that has arrived, at most
//                     10 s later, since the device's frames can reach the Mac
//                     late); prints "stopped", or "stopped <error>"
//
// It exits when stdin closes. The device is only captured while recording,
// and only sends a frame when its screen changes. The movies are written from
// the frames received (AVAssetWriter), and finished with every one of them:
// AVCaptureMovieFileOutput fell behind, and dropped the frames it hadn't
// written yet when it stopped. The terminal (or the process running it) needs
// camera access, which macOS asks for once.

import AVFoundation
import CoreMediaIO
import Foundation

let args = CommandLine.arguments
guard args.count == 2 else {
    FileHandle.standardError.write("usage: capture <device>\n".data(using: .utf8)!)
    exit(2)
}
let wanted = args[1].lowercased()

var property = CMIOObjectPropertyAddress(
    mSelector: CMIOObjectPropertySelector(kCMIOHardwarePropertyAllowScreenCaptureDevices),
    mScope: CMIOObjectPropertyScope(kCMIOObjectPropertyScopeGlobal),
    mElement: CMIOObjectPropertyElement(kCMIOObjectPropertyElementMain))
var allow: UInt32 = 1
CMIOObjectSetPropertyData(
    CMIOObjectID(kCMIOObjectSystemObject), &property, 0, nil,
    UInt32(MemoryLayout<UInt32>.size), &allow)

// The device's screen is a muxed (video and audio) external device. It shows
// up a moment after screen capture devices are allowed, on the main run loop.
func findDevice() -> AVCaptureDevice? {
    AVCaptureDevice.DiscoverySession(
        deviceTypes: [.external], mediaType: .muxed, position: .unspecified
    ).devices.first {
        wanted.isEmpty || $0.localizedName.lowercased().contains(wanted)
            || $0.uniqueID.lowercased().contains(wanted)
    }
}
var device: AVCaptureDevice?
for _ in 0..<40 {
    device = findDevice()
    if device != nil { break }
    RunLoop.current.run(until: Date().addingTimeInterval(0.25))
}
guard let device else {
    FileHandle.standardError.write("no screen capture device matching \(args[1])\n".data(using: .utf8)!)
    exit(1)
}

func say(_ line: String) {
    print(line)
    fflush(stdout)
}

// One movie: the frames it's given, until finish().
final class Movie {
    private let output: URL
    private var writer: AVAssetWriter?
    private var input: AVAssetWriterInput?
    private var written = 0
    private(set) var dropped = 0

    init(_ output: URL) { self.output = output }

    // Returns whether the frame is the movie's third (it's recording).
    func append(_ sampleBuffer: CMSampleBuffer, _ buffer: CVPixelBuffer) throws -> Bool {
        if writer == nil {
            try? FileManager.default.removeItem(at: output)
            let writer = try AVAssetWriter(outputURL: output, fileType: .mov)
            let input = AVAssetWriterInput(
                mediaType: .video,
                outputSettings: [
                    AVVideoCodecKey: AVVideoCodecType.h264,
                    AVVideoWidthKey: CVPixelBufferGetWidth(buffer),
                    AVVideoHeightKey: CVPixelBufferGetHeight(buffer),
                    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 20_000_000],
                ])
            input.expectsMediaDataInRealTime = true
            writer.add(input)
            guard writer.startWriting() else { throw writer.error ?? CaptureError("couldn't start writing") }
            writer.startSession(atSourceTime: CMSampleBufferGetPresentationTimeStamp(sampleBuffer))
            self.writer = writer
            self.input = input
        }
        guard let input else { return false }
        // The encoder can be briefly busy: wait for it (the capture keeps the
        // frames that arrive meanwhile) rather than drop the frame.
        let deadline = Date().addingTimeInterval(0.5)
        while !input.isReadyForMoreMediaData, Date() < deadline { usleep(1000) }
        guard input.isReadyForMoreMediaData, input.append(sampleBuffer) else {
            dropped += 1
            return false
        }
        written += 1
        return written == 3
    }

    // Finishes the file with every frame appended; returns an error, if any.
    func finish() -> String? {
        guard let writer, let input else { return "no frames" }
        input.markAsFinished()
        let done = DispatchSemaphore(value: 0)
        writer.finishWriting { done.signal() }
        done.wait()
        if let error = writer.error { return "\(error)" }
        return dropped > 0 ? "couldn't write \(dropped) frames in time" : nil
    }
}

final class Recorder: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    let queue = DispatchQueue(label: "frames")
    // On `queue`: the movie being recorded, the point to wait for (see
    // "stop"), and whether a frame has shown it blue.
    var movie: Movie?
    var until: (x: Double, y: Double)?
    var sawUntil = false

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let movie, let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        do {
            if try movie.append(sampleBuffer, buffer) { say("recording") }
        } catch {
            FileHandle.standardError.write("\(error)\n".data(using: .utf8)!)
            exit(1)
        }
        if let until, let (r, g, b) = Self.pixel(buffer, until.x, until.y), b > 200, r < 60, g < 60 {
            sawUntil = true
        }
    }

    // A pixel's color (BGRA), at fractions of the frame's width and height.
    static func pixel(_ buffer: CVPixelBuffer, _ fx: Double, _ fy: Double) -> (Int, Int, Int)? {
        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        let x = Int(fx * Double(CVPixelBufferGetWidth(buffer)))
        let y = Int(fy * Double(CVPixelBufferGetHeight(buffer)))
        guard x >= 0, y >= 0, x < CVPixelBufferGetWidth(buffer), y < CVPixelBufferGetHeight(buffer),
            let base = CVPixelBufferGetBaseAddress(buffer)
        else { return nil }
        let p = base.advanced(by: y * CVPixelBufferGetBytesPerRow(buffer) + x * 4)
            .assumingMemoryBound(to: UInt8.self)
        return (Int(p[2]), Int(p[1]), Int(p[0]))
    }
}

struct CaptureError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

let session = AVCaptureSession()
do {
    session.addInput(try AVCaptureDeviceInput(device: device))
} catch {
    FileHandle.standardError.write("\(error)\n".data(using: .utf8)!)
    exit(1)
}
let recorder = Recorder()
let frames = AVCaptureVideoDataOutput()
frames.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
// Late frames wait for the writer rather than being dropped.
frames.alwaysDiscardsLateVideoFrames = false
frames.setSampleBufferDelegate(recorder, queue: recorder.queue)
guard session.canAddOutput(frames) else {
    FileHandle.standardError.write("can't take the device's frames\n".data(using: .utf8)!)
    exit(1)
}
session.addOutput(frames)
say("ready")

// Commands, one at a time, off the main thread (which runs the capture).
Thread.detachNewThread {
    while let line = readLine() {
        let words = line.split(separator: " ").map(String.init)
        switch words.first {
        case "start" where words.count == 2:
            recorder.queue.sync {
                recorder.movie = Movie(URL(fileURLWithPath: words[1]))
                recorder.until = nil
                recorder.sawUntil = false
            }
            session.startRunning()
        case "stop":
            if words.count == 3, let x = Double(words[1]), let y = Double(words[2]) {
                recorder.queue.sync { recorder.until = (x, y) }
                let deadline = Date().addingTimeInterval(10)
                while !recorder.queue.sync(execute: { recorder.sawUntil }), Date() < deadline {
                    usleep(20_000)
                }
            }
            let movie = recorder.queue.sync { () -> Movie? in
                defer { recorder.movie = nil }
                return recorder.movie
            }
            session.stopRunning()
            var errors = [String]()
            if words.count == 3, !recorder.queue.sync(execute: { recorder.sawUntil }) {
                errors.append("no frame with the end marker")
            }
            if let error = movie?.finish() { errors.append(error) }
            say(errors.isEmpty ? "stopped" : "stopped \(errors.joined(separator: "; "))")
        default:
            FileHandle.standardError.write("unknown command: \(line)\n".data(using: .utf8)!)
        }
    }
    if session.isRunning { session.stopRunning() }
    exit(0)
}
signal(SIGINT, SIG_DFL)
RunLoop.main.run()
