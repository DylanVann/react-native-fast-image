// Records the screen of an iOS device connected over USB to a QuickTime
// movie, as QuickTime Player's "New Movie Recording" does: macOS offers the
// device's screen as a capture device once screen capture devices are allowed
// (CoreMediaIO). Nothing runs on the device.
//
//   capture <device name or udid fragment> <out.mov>
//
// Prints "recording" once the device's frames are arriving (the file starts
// before them: the device takes a moment to send its first frames), and
// stops (finishing the file) on SIGINT/SIGTERM or when stdin closes. The
// device only sends a frame when its screen changes. The terminal (or the
// process running it) needs camera access, which macOS asks for once.

import AVFoundation
import CoreMediaIO
import Foundation

let args = CommandLine.arguments
guard args.count == 3 else {
    FileHandle.standardError.write("usage: capture <device> <out.mov>\n".data(using: .utf8)!)
    exit(2)
}
let wanted = args[1].lowercased()
let output = URL(fileURLWithPath: args[2])

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

final class Recorder: NSObject, AVCaptureFileOutputRecordingDelegate, AVCaptureVideoDataOutputSampleBufferDelegate {
    var finished = false
    var started = false
    var frames = 0
    var announced = false
    func fileOutput(_ output: AVCaptureFileOutput, didStartRecordingTo url: URL, from connections: [AVCaptureConnection]) {
        DispatchQueue.main.async { self.started = true }
    }
    // A few frames after the file has started: frames are being recorded.
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        DispatchQueue.main.async {
            guard self.started, !self.announced else { return }
            self.frames += 1
            if self.frames >= 3 {
                self.announced = true
                print("recording")
                fflush(stdout)
            }
        }
    }
    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo url: URL, from connections: [AVCaptureConnection], error: Error?) {
        if let error { FileHandle.standardError.write("\(error)\n".data(using: .utf8)!) }
        finished = true
    }
}

let session = AVCaptureSession()
do {
    session.addInput(try AVCaptureDeviceInput(device: device))
} catch {
    FileHandle.standardError.write("\(error)\n".data(using: .utf8)!)
    exit(1)
}
let movie = AVCaptureMovieFileOutput()
session.addOutput(movie)
let recorder = Recorder()
// Only to see frames arrive (see Recorder).
let frames = AVCaptureVideoDataOutput()
frames.alwaysDiscardsLateVideoFrames = true
frames.setSampleBufferDelegate(recorder, queue: DispatchQueue(label: "frames"))
if session.canAddOutput(frames) { session.addOutput(frames) }
session.startRunning()
try? FileManager.default.removeItem(at: output)
movie.startRecording(to: output, recordingDelegate: recorder)

var stopping = false
let stop = { stopping = true }
signal(SIGINT, SIG_IGN)
signal(SIGTERM, SIG_IGN)
let sources = [SIGINT, SIGTERM].map { sig -> DispatchSourceSignal in
    let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
    source.setEventHandler(handler: stop)
    source.resume()
    return source
}
FileHandle.standardInput.readabilityHandler = { handle in
    if handle.availableData.isEmpty { DispatchQueue.main.async(execute: stop) }
}
while !stopping { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
movie.stopRecording()
while !recorder.finished { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
session.stopRunning()
_ = sources
