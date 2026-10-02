// Serves the benchmark's images (../../images/out, in this test bundle) on
// the phone, at http://127.0.0.1:<port>, as the Android tests do
// (ImageServer.kt): GET /<set>/<index>.jpg?run=<id>[&delay=<ms>] and
// /manifest.json, the query ignored for the lookup. The app loads them over
// HTTP with each library's own networking, but every run gets the same
// network: `latencyMs` before each response (and before a new connection's
// first, for its handshake), and `mbps` shared by every response at once, as
// on one real link (0 for no limit). It runs in the test runner's process,
// not the app's.
import Foundation

final class ImageServer {
    let port: UInt16
    private let root: URL
    private let latencyMs: Int
    private let link: Link
    private var listener: Int32 = -1
    private var files: [String: Data] = [:]
    private let filesLock = NSLock()

    var url: String { "http://127.0.0.1:\(port)" }

    init(root: URL, port: UInt16, latencyMs: Int, mbps: Double) {
        self.root = root
        self.port = port
        self.latencyMs = latencyMs
        link = Link(mbps: mbps)
    }

    func start() throws {
        listener = socket(AF_INET, SOCK_STREAM, 0)
        guard listener >= 0 else { throw ServerError("socket: \(errno)") }
        var yes: Int32 = 1
        setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &yes, socklen_t(MemoryLayout<Int32>.size))
        var address = sockaddr_in()
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = port.bigEndian
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        let bound = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                bind(listener, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard bound == 0, listen(listener, 128) == 0 else {
            close(listener)
            throw ServerError("bind or listen on \(port): \(errno)")
        }
        let listener = self.listener
        Thread.detachNewThread { [weak self] in
            while true {
                let client = accept(listener, nil, nil)
                if client < 0 { return }
                Thread.detachNewThread { self?.serve(client) }
            }
        }
    }

    func stop() {
        if listener >= 0 {
            close(listener)
            listener = -1
        }
    }

    // A client can close its connection at any time (e.g. a list cancelling a
    // cell's download): that only ends this connection. SO_NOSIGPIPE: writing
    // to it then fails instead of killing the process.
    private func serve(_ client: Int32) {
        defer { close(client) }
        var yes: Int32 = 1
        setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &yes, socklen_t(MemoryLayout<Int32>.size))
        setsockopt(client, IPPROTO_TCP, TCP_NODELAY, &yes, socklen_t(MemoryLayout<Int32>.size))
        sleep(milliseconds: latencyMs)
        var pending = Data()
        // HTTP/1.1 with keep-alive: requests one after another.
        while let head = readHead(client, &pending) {
            guard let target = head.split(separator: "\r\n").first?.split(separator: " ").dropFirst().first else {
                return
            }
            let parts = target.split(separator: "?", maxSplits: 1)
            let path = String(parts[0].drop(while: { $0 == "/" }))
            let delay = parts.count > 1
                ? parts[1].split(separator: "&").first(where: { $0.hasPrefix("delay=") })
                    .flatMap { Int($0.dropFirst("delay=".count)) } ?? 0
                : 0
            sleep(milliseconds: latencyMs + delay)
            guard let body = file(path) else {
                guard write(client, Data("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n".utf8)) else { return }
                continue
            }
            let type = path.hasSuffix(".json") ? "application/json" : "image/jpeg"
            let headers = "HTTP/1.1 200 OK\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\n"
                + "Cache-Control: public, max-age=31536000, immutable\r\n\r\n"
            guard write(client, Data(headers.utf8)) else { return }
            var offset = 0
            while offset < body.count {
                let count = min(Self.chunk, body.count - offset)
                link.send(count)
                guard write(client, body.subdata(in: offset..<(offset + count))) else { return }
                offset += count
            }
        }
    }

    // A request's line and headers (up to the empty line), or nil when the
    // client closed the connection.
    private func readHead(_ client: Int32, _ pending: inout Data) -> String? {
        let end = Data("\r\n\r\n".utf8)
        var buffer = [UInt8](repeating: 0, count: 4096)
        while pending.range(of: end) == nil {
            let read = recv(client, &buffer, buffer.count, 0)
            if read <= 0 { return nil }
            pending.append(buffer, count: read)
        }
        let range = pending.range(of: end)!
        let head = String(decoding: pending[..<range.lowerBound], as: UTF8.self)
        pending.removeSubrange(..<range.upperBound)
        return head
    }

    private func write(_ client: Int32, _ data: Data) -> Bool {
        data.withUnsafeBytes { bytes in
            var offset = 0
            while offset < data.count {
                let sent = send(client, bytes.baseAddress! + offset, data.count - offset, 0)
                if sent <= 0 { return false }
                offset += sent
            }
            return true
        }
    }

    // The image or the manifest, only by their names (no other path).
    private func file(_ path: String) -> Data? {
        guard path.range(of: #"^(manifest\.json|[a-z]+/\d+\.jpg)$"#, options: .regularExpression) != nil else {
            return nil
        }
        filesLock.lock()
        defer { filesLock.unlock() }
        if let data = files[path] { return data }
        let data = try? Data(contentsOf: root.appendingPathComponent(path))
        files[path] = data
        return data
    }

    private func sleep(milliseconds: Int) {
        if milliseconds > 0 { Thread.sleep(forTimeInterval: Double(milliseconds) / 1000) }
    }

    private static let chunk = 16 * 1024

    // A link's bandwidth, shared by every response: each chunk takes its turn,
    // for as long as its bytes take at `mbps`.
    private final class Link {
        private let nanosPerByte: Double
        private var free: UInt64 = 0
        private let lock = NSLock()

        init(mbps: Double) {
            nanosPerByte = mbps > 0 ? 8_000 / mbps : 0
        }

        func send(_ bytes: Int) {
            guard nanosPerByte > 0 else { return }
            lock.lock()
            let start = max(DispatchTime.now().uptimeNanoseconds, free)
            let done = start + UInt64(Double(bytes) * nanosPerByte)
            free = done
            lock.unlock()
            while true {
                let now = DispatchTime.now().uptimeNanoseconds
                if now >= done { return }
                Thread.sleep(forTimeInterval: Double(done - now) / 1_000_000_000)
            }
        }
    }
}

struct ServerError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}
