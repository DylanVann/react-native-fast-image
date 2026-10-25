// The phone's free memory while a measurement runs (the median of samples
// every 100 ms): a library pressing on the phone's memory shows as little
// left, as iOS frees it by closing other apps. It's noisy (it depends on what
// else the phone runs, and iOS keeps little memory free), so it's in the
// result bundle as a check, not in the summary: TotalMemoryMetric measures
// the app's own memory.
import XCTest

final class DeviceMemoryMetric: NSObject, XCTMetric {
    private let lock = NSLock()
    private var samples: [UInt64] = []
    private var timer: DispatchSourceTimer?

    func copy(with zone: NSZone? = nil) -> Any { DeviceMemoryMetric() }

    func willBeginMeasuring() {
        let timer = DispatchSource.makeTimerSource(queue: .global(qos: .utility))
        timer.schedule(deadline: .now(), repeating: .milliseconds(100))
        timer.setEventHandler { [weak self] in
            guard let self, let free = Self.freeBytes() else { return }
            lock.lock()
            samples.append(free)
            lock.unlock()
        }
        timer.resume()
        self.timer = timer
    }

    func didStopMeasuring() {
        timer?.cancel()
        timer = nil
    }

    func reportMeasurements(
        from startTime: XCTPerformanceMeasurementTimestamp, to endTime: XCTPerformanceMeasurementTimestamp
    ) throws -> [XCTPerformanceMeasurement] {
        lock.lock()
        let sorted = samples.sorted()
        lock.unlock()
        guard !sorted.isEmpty else { return [] }
        return [
            XCTPerformanceMeasurement(
                identifier: "com.dylanvann.rnfibenchmark.device-free-memory",
                displayName: "Device Free Memory",
                doubleValue: Double(sorted[(sorted.count - 1) / 2]) / 1024,
                unitSymbol: "kB")
        ]
    }

    private static func freeBytes() -> UInt64? {
        var stats = vm_statistics64_data_t()
        var count = mach_msg_type_number_t(
            MemoryLayout<vm_statistics64_data_t>.size / MemoryLayout<integer_t>.size)
        let result = withUnsafeMutablePointer(to: &stats) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics64(mach_host_self(), HOST_VM_INFO64, $0, &count)
            }
        }
        guard result == KERN_SUCCESS else { return nil }
        return UInt64(stats.free_count) * UInt64(vm_kernel_page_size)
    }
}
