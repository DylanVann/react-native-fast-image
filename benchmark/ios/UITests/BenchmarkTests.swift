// Measures the benchmark app (../../app) on a device, with the images served
// on the phone (ImageServer). scripts/run.ts runs these with `xcodebuild`:
// testServe while it records the timed runs (it launches the app itself),
// then the XCTest metrics for one subject (hitches while scrolling, memory),
// read from the result bundle. Environment (passed as TEST_RUNNER_BENCH_…):
// BENCH_BUNDLE_ID (the subject's app), BENCH_ITERATIONS (how many times each
// metric is measured), BENCH_PORT, BENCH_LATENCY_MS and BENCH_MBPS (the image
// server's).
import XCTest

final class BenchmarkTests: XCTestCase {
    private var environment: [String: String] { ProcessInfo.processInfo.environment }
    private var bundleId: String { environment["BENCH_BUNDLE_ID"] ?? "com.dylanvann.rnfibenchmark.image" }
    private var iterations: Int { Int(environment["BENCH_ITERATIONS"] ?? "") ?? 5 }
    private var server: ImageServer!

    override func setUpWithError() throws {
        continueAfterFailure = false
        let images = try XCTUnwrap(
            Bundle(for: BenchmarkTests.self).url(forResource: "out", withExtension: nil),
            "No images in the test bundle: run make-images.ts in ../images")
        server = ImageServer(
            root: images,
            port: UInt16(environment["BENCH_PORT"] ?? "") ?? 8099,
            latencyMs: Int(environment["BENCH_LATENCY_MS"] ?? "") ?? 40,
            mbps: Double(environment["BENCH_MBPS"] ?? "") ?? 50)
        try server.start()
    }

    override func tearDown() {
        server.stop()
    }

    private func options() -> XCTMeasureOptions {
        let options = XCTMeasureOptions()
        options.iterationCount = iterations
        return options
    }

    // Only serves the images, while scripts/run.ts launches the app on its
    // timed runs and records them, until it stops the test (at most an hour).
    // It prints when the server is ready.
    func testServe() {
        print("BENCH_SERVER_READY \(server.url)")
        Thread.sleep(forTimeInterval: 60 * 60)
    }

    // Launches the app on a scenario with a new run id (so no image comes
    // from an earlier run's caches) and waits for it to be done.
    @discardableResult
    private func launch(_ app: XCUIApplication, scenario: String) -> XCUIApplication {
        app.launchArguments = [
            "-scenario", scenario, "-run", "xctest-\(scenario)-\(UUID().uuidString)", "-server", server.url,
        ]
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
