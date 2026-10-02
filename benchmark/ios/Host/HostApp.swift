// The UI tests' target app. The tests drive the benchmark app instead.
import SwiftUI

@main
struct HostApp: App {
    var body: some Scene {
        WindowGroup { Text("Benchmark runner") }
    }
}
