import UIKit
import XCTest

// ../scenario-tests/views (see its README), against FFFastImageView in a
// window, with no React Native. The window's layer is paused, so animations
// only move when a step moves its timeOffset.
final class ScenarioTests: XCTestCase {
    static let repository = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    static let images = repository.appendingPathComponent("ReactNativeFastImageExampleServer/images")

    func testFade() throws {
        try run("views/fade.json")
    }

    private func run(_ file: String) throws {
        let url = Self.repository.appendingPathComponent("scenario-tests").appendingPathComponent(file)
        let json = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: Any]
        let repeats = Int(ProcessInfo.processInfo.environment["SCENARIO_REPEATS"] ?? "") ?? 1
        var ran = 0
        let start = Date()
        for scenario in json["scenarios"] as! [[String: Any]] {
            if let only = scenario["only"] as? String, only != "ios" { continue }
            let name = scenario["name"] as! String
            for time in 0..<repeats {
                try ViewScenario(name: repeats > 1 ? "\(name) (\(time + 1))" : name).run(scenario["steps"] as! [[String: Any]])
                ran += 1
            }
        }
        print("scenarios: \(ran) runs of \(file) in \(Int(Date().timeIntervalSince(start) * 1000)) ms")
    }
}

private func spin(until done: () -> Bool, timeout: TimeInterval) -> Bool {
    let deadline = Date(timeIntervalSinceNow: timeout)
    while !done() && Date() < deadline { RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.002)) }
    return done()
}

private final class ViewScenario {
    final class Shown {
        let view = FFFastImageView()
        // The view's parent, which React Native's opacity applies to.
        let parent = UIView()
        var frame = CGRect.zero
        var sample: CGPoint?
        var loads = 0
        var error: String?
    }

    let name: String
    var window: UIWindow!
    var server: TestServer!
    var shown: [String: Shown] = [:]

    init(name: String) {
        self.name = name
    }

    func run(_ steps: [[String: Any]]) throws {
        server = try TestServer(images: ScenarioTests.images)
        let cleared = clearCaches()
        XCTAssertTrue(spin(until: cleared, timeout: 10), "\(name): caches not cleared")
        window = try makeWindow()
        defer {
            for item in shown.values { item.view.stop() }
            window.layer.speed = 1
            window.isHidden = true
            window = nil
            server.stop()
        }
        window.layer.speed = 0
        window.layer.timeOffset = 0
        for (index, step) in steps.enumerated() {
            try perform(step, "\(name), step \(index)")
        }
    }

    private func clearCaches() -> () -> Bool {
        SDImageCache.shared.clearMemory()
        var done = false
        SDImageCache.shared.clearDisk { done = true }
        URLCache.shared.removeAllCachedResponses()
        return { done }
    }

    private func makeWindow() throws -> UIWindow {
        var scene: UIWindowScene?
        _ = spin(until: {
            scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
            return scene != nil
        }, timeout: 10)
        let window = UIWindow(windowScene: try XCTUnwrap(scene))
        window.frame = CGRect(x: 0, y: 0, width: 300, height: 300)
        window.backgroundColor = .black
        window.rootViewController = UIViewController()
        window.rootViewController!.view.backgroundColor = .black
        window.makeKeyAndVisible()
        return window
    }

    private func perform(_ step: [String: Any], _ label: String) throws {
        if let name = step["view"] as? String {
            let item = Shown()
            shown[name] = item
            let size = step["size"] as! [CGFloat]
            let at = step["at"] as? [CGFloat] ?? [0, 0]
            item.frame = CGRect(x: at[0], y: at[1], width: size[0], height: size[1])
            if let sample = step["sample"] as? [CGFloat] { item.sample = CGPoint(x: sample[0], y: sample[1]) }
            item.parent.frame = item.frame
            item.view.frame = item.parent.bounds
            item.parent.addSubview(item.view)
            window.rootViewController!.view.addSubview(item.parent)
            item.view.onFastImageLoad = { _ in item.loads += 1 }
            item.view.onFastImageError = { body in item.error = "\(body)" }
            apply(step, to: item)
        } else if let name = step["set"] as? String {
            apply(step, to: shown[name]!)
        } else if let name = step["remove"] as? String {
            let item = shown.removeValue(forKey: name)!
            item.view.stop()
            item.parent.removeFromSuperview()
        } else if let path = step["hold"] as? String {
            server.hold(path)
        } else if let path = step["release"] as? String {
            server.release(path)
        } else if let path = step["respond"] as? String {
            let body = try Data(contentsOf: ScenarioTests.images.appendingPathComponent(step["fixture"] as! String))
            server.respond(path, TestServer.Response(body: body, headers: step["headers"] as? [String: String] ?? [:]))
        } else if step["clearMemoryCache"] != nil {
            SDImageCache.shared.clearMemory()
        } else if let ms = step["advance"] as? Double {
            advance(ms)
        } else if let wait = step["waitFor"] as? [String: Any] {
            if let name = wait["fadeStarted"] as? String {
                let item = shown[name]!
                XCTAssertTrue(spin(until: { item.view.layer.animation(forKey: "FFFFadeIn") != nil }, timeout: 15), "\(label): \(name) never faded")
            }
            for name in wait["loaded"] as? [String] ?? [] {
                let item = shown[name]!
                let done = spin(until: { item.loads > 0 || item.error != nil }, timeout: 15)
                XCTAssertTrue(done, "\(label): \(name) never loaded")
                XCTAssertNil(item.error, "\(label): \(name)")
            }
            CATransaction.flush()
        } else if let name = step["fade"] as? String {
            let duration = step["duration"] as! Double
            let colors = step["expect"] as! [String]
            for (index, color) in colors.enumerated() {
                if index > 0 { advance(duration / Double(colors.count - 1)) }
                check(name, color, "\(label), point \(index)")
            }
            // Past its end, so nothing of it is left.
            advance(100)
        } else if let expect = step["expect"] as? [String: Any] {
            for (name, color) in expect["colors"] as! [String: String] {
                check(name, color, label)
            }
        }
    }

    private func apply(_ props: [String: Any], to item: Shown) {
        let view = item.view
        if let transition = props["transition"] as? [String: Any] {
            view.transitionDuration = transition["duration"] as! Double
            view.transitionBetweenImages = transition["betweenImages"] as? Bool ?? false
            view.transitionSkipOnCacheHit = transition["skipOnCacheHit"] as? String ?? "memory"
        }
        if let fit = props["objectFit"] as? String {
            view.objectFit = fit == "contain" ? .contain : .cover
        }
        if let radius = props["blurRadius"] as? CGFloat { view.blurRadius = radius }
        if let opacity = props["opacity"] as? CGFloat { item.parent.alpha = opacity }
        if let opacity = props["parentOpacity"] as? CGFloat { item.parent.alpha = opacity }
        if props["defaultSource"] != nil {
            // A solid image of the view's size, which fills it however it's fit.
            let format = UIGraphicsImageRendererFormat()
            format.scale = 1
            view.placeholder = UIGraphicsImageRenderer(size: item.frame.size, format: format).image { context in
                UIColor(red: 1, green: 0, blue: 1, alpha: 1).setFill()
                context.fill(CGRect(origin: .zero, size: item.frame.size))
            }
        }
        if let url = props["url"] as? String {
            let resolved = url.hasPrefix("file:")
                ? ScenarioTests.images.appendingPathComponent(String(url.dropFirst(5)))
                : URL(string: server.url(url))!
            let cache: FFFCacheControl = props["cache"] as? String == "web" ? .web : .immutable
            view.sources = [FFFastImageSource(url: resolved, priority: .normal, headers: nil, cacheControl: cache)]
            item.loads = 0
        }
        view.didSetProps()
    }

    private func advance(_ ms: Double) {
        window.layer.timeOffset += ms / 1000
        CATransaction.flush()
    }

    private func check(_ name: String, _ expected: String, _ label: String) {
        let item = shown[name]!
        let point = item.sample ?? CGPoint(x: item.frame.width / 2, y: item.frame.height / 2)
        let actual = pixel(x: item.frame.minX + point.x, y: item.frame.minY + point.y)
        let wanted = rgb(expected)
        let close = zip(actual, wanted).allSatisfy { abs(Int($0) - Int($1)) <= 3 }
        XCTAssertTrue(close, "\(label): \(name) is \(hex(actual)), expected \(expected)")
    }

    private func pixel(x: CGFloat, y: CGFloat) -> [UInt8] {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        // After the screen's updates: without them the result depends on
        // when the render server last committed.
        let image = UIGraphicsImageRenderer(bounds: window.bounds, format: format).image { _ in
            _ = window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }.cgImage!
        var data = [UInt8](repeating: 0, count: image.width * image.height * 4)
        let context = CGContext(data: &data, width: image.width, height: image.height, bitsPerComponent: 8, bytesPerRow: image.width * 4,
                                space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.draw(image, in: window.bounds)
        let i = (Int(y) * image.width + Int(x)) * 4
        return Array(data[i..<i + 3])
    }

    private func rgb(_ hex: String) -> [UInt8] {
        let value = Int(hex.dropFirst(), radix: 16)!
        return [UInt8(value >> 16 & 255), UInt8(value >> 8 & 255), UInt8(value & 255)]
    }

    private func hex(_ rgb: [UInt8]) -> String {
        "#" + rgb.map { String(format: "%02x", $0) }.joined()
    }
}
