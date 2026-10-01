// swift-tools-version:5.9
// Records an iOS device's screen, connected over USB, to a movie: see
// Sources/capture/main.swift.
import PackageDescription

let package = Package(
    name: "capture",
    platforms: [.macOS(.v14)],
    targets: [.executableTarget(name: "capture")]
)
