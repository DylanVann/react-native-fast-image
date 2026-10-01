// Measures the benchmark app (../../app) with XCTest's metrics, on a device:
// hitches while scrolling, and memory. scripts/metrics.ts runs these with
// `xcodebuild test` for one subject and reads the metrics from the result
// bundle. The app is chosen by BENCH_BUNDLE_ID (passed as
// TEST_RUNNER_BENCH_BUNDLE_ID), and BENCH_ITERATIONS sets how many times each
// metric is measured.
import XCTest

final class BenchmarkTests: XCTestCase {
    private var environment: [String: String] { ProcessInfo.processInfo.environment }
    private var bundleId: String { environment["BENCH_BUNDLE_ID"] ?? "com.dylanvann.rnfibenchmark.image" }
    private var iterations: Int { Int(environment["BENCH_ITERATIONS"] ?? "") ?? 5 }

    override func setUp() {
        continueAfterFailure = false
    }

    private func options() -> XCTMeasureOptions {
        let options = XCTMeasureOptions()
        options.iterationCount = iterations
        return options
    }

    // Launches the app on a scenario with a new run id (so no image comes
    // from an earlier run's caches) and waits for it to be done.
    @discardableResult
    private func launch(_ app: XCUIApplication, scenario: String) -> XCUIApplication {
        app.launchArguments = ["-scenario", scenario, "-run", "xctest-\(scenario)-\(UUID().uuidString)"]
        app.launch()
        XCTAssert(app.staticTexts["done"].waitForExistence(timeout: 120), "\(scenario) didn't finish")
        return app
    }

    // The large scenario (20 photos of 4000 × 3000 in small views): memory
    // once they're shown. Each iteration launches the app again.
    func testLargeMemory() {
        let app = XCUIApplication(bundleIdentifier: bundleId)
        measure(metrics: [XCTMemoryMetric(application: app)], options: options()) {
            launch(app, scenario: "large")
        }
        app.terminate()
    }

    // The scroll scenario (500 photos in a FlashList): hitches and memory
    // while scrolling through it and back. A first pass loads the images, so
    // the measured passes are with warm caches, as when a list is scrolled
    // again.
    func testScroll() {
        let app = XCUIApplication(bundleIdentifier: bundleId)
        launch(app, scenario: "scroll")
        let list = app.descendants(matching: .any)["list"]
        XCTAssert(list.waitForExistence(timeout: 10))
        // Each swipe takes about 3 s: XCUITest waits for the app to be idle
        // after it, which includes the scroll's deceleration.
        let pass = {
            for _ in 0..<4 { list.swipeUp(velocity: .fast) }
            for _ in 0..<4 { list.swipeDown(velocity: .fast) }
        }
        pass()
        measure(
            metrics: [XCTOSSignpostMetric.scrollingAndDecelerationMetric, XCTMemoryMetric(application: app)],
            options: options(),
            block: pass)
        app.terminate()
    }
}
