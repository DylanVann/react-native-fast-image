// The app's memory as the app measures it (MemorySamples, in
// ../../app/modules/memory-samples), sent to the image server every 250 ms:
// its physical footprint, what XCTMemoryMetric measures, plus the CoreGraphics
// bitmap data iOS leaves out of the footprint (images decoded in software: an
// animation's buffered frames, downsampled images), which still takes the
// phone's memory. The peak while it's measured: the samples' highest, or the
// footprint's own peak if it rose (iOS keeps it between samples too), and the
// last sample. Memory the app makes other processes use isn't in it (e.g. an
// image the system decodes to draw it).
import XCTest

final class TotalMemoryMetric: NSObject, XCTMetric {
    private let server: ImageServer
    private var start = Date.distantPast
    // Taken when the measurement stops: XCTest asks for every iteration's
    // measurements at the end, after the next launches dropped them.
    private var samples: [ImageServer.MemorySample] = []

    init(server: ImageServer) {
        self.server = server
    }

    func copy(with zone: NSZone? = nil) -> Any { TotalMemoryMetric(server: server) }

    func willBeginMeasuring() {
        start = Date()
    }

    func didStopMeasuring() {
        samples = server.memorySamples(from: start, to: Date())
    }

    func reportMeasurements(
        from startTime: XCTPerformanceMeasurementTimestamp, to endTime: XCTPerformanceMeasurementTimestamp
    ) throws -> [XCTPerformanceMeasurement] {
        guard let first = samples.first, let last = samples.last else { return [] }
        var peak = samples.map { $0.footprint + $0.bitmaps }.max()!
        if last.footprintPeak > first.footprintPeak {
            peak = max(peak, last.footprintPeak)
        }
        return [
            XCTPerformanceMeasurement(
                identifier: "com.dylanvann.rnfibenchmark.memory-peak-total", displayName: "Memory Peak Total",
                doubleValue: Double(peak) / 1024, unitSymbol: "kB"),
            XCTPerformanceMeasurement(
                identifier: "com.dylanvann.rnfibenchmark.absolute-memory-total", displayName: "Absolute Memory Total",
                doubleValue: Double(last.footprint + last.bitmaps) / 1024, unitSymbol: "kB"),
        ]
    }
}
