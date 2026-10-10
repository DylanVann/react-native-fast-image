// Serves the benchmark's images (../../images/out, in this test bundle) on
// the phone, at http://127.0.0.1:<port>, as the Android tests do
// (ImageServer.kt): GET /<set>/<index>.jpg?run=<id> and /manifest.json, the
// query ignored for the lookup, and /requests?run=<id>, how many image
// requests it got for that run id (the probe's aren't counted): how many
// downloads a library made, e.g. one per photo shown at two sizes when it
// shares them. The app loads them over HTTP with each
// library's own networking, but every run gets the same network: `latencyMs`
// before each response (and before a new connection's first, for its
// handshake), and `mbps` shared by every response at once, as on one real
// link (0 for no limit). The manifest's and the network probe's (`?…&close`)
// responses close their connection, so no library starts with one open. The
// files are read when it starts, so every run is served from memory. It runs
// in the test runner's process, not the app's.
import Foundation

final class ImageServer {
    let port: UInt16
    private let root: URL
    private let latencyMs: Int
    private let link: Link
    private var listener: Int32 = -1
    // By path under `root`, e.g. "grid/0.jpg"; only read after start().
    private var files: [String: Data] = [:]
    // Image requests by run id.
    private var requests: [String: Int] = [:]
    private let requestsLock = NSLock()

    var url: String { "http://127.0.0.1:\(port)" }

    init(root: URL, port: UInt16, latencyMs: Int, mbps: Double) {
        self.root = root
        self.port = port
        self.latencyMs = latencyMs
        link = Link(mbps: mbps)
    }

    func start() throws {
        let paths = FileManager.default.enumerator(atPath: root.path)?.allObjects as? [String] ?? []
        for path in paths where path.hasSuffix(".jpg") || path.hasSuffix(".json") {
            files[path] = try Data(contentsOf: root.appendingPathComponent(path))
        }
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
                guard let self else {
                    close(client)
                    return
                }
                Thread.detachNewThread { self.serve(client) }
            }
        }
    }

    func stop() {
        if listener >= 0 {
            shutdown(listener, SHUT_RDWR)
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
            let parts = target.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
            let path = String(parts[0].drop(while: { $0 == "/" }))
            let query = parts.count > 1 ? parts[1].split(separator: "&") : []
            let closing = path == "manifest.json" || query.contains("close")
            let run = query.first { $0.hasPrefix("run=") }
                .flatMap { $0.dropFirst(4).removingPercentEncoding }
            if let run, !closing, path.hasSuffix(".jpg") {
                requestsLock.lock()
                requests[run, default: 0] += 1
                requestsLock.unlock()
            }
            sleep(milliseconds: latencyMs)
            if path == "requests" {
                requestsLock.lock()
                let count = run.flatMap { requests[$0] } ?? 0
                requestsLock.unlock()
                let body = Data(String(count).utf8)
                let headers = "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: \(body.count)\r\n\r\n"
                guard write(client, Data(headers.utf8) + body) else { return }
                continue
            }
            guard let body = files[path] else {
                guard write(client, Data("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n".utf8)) else { return }
                continue
            }
            let type = path.hasSuffix(".json") ? "application/json" : "image/jpeg"
            let headers = "HTTP/1.1 200 OK\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\n"
                + "Cache-Control: public, max-age=31536000, immutable\r\n"
                + (closing ? "Connection: close\r\n" : "") + "\r\n"
            guard write(client, Data(headers.utf8)) else { return }
            var offset = 0
            while offset < body.count {
                let count = min(Self.chunk, body.count - offset)
                link.send(count)
                guard write(client, body.subdata(in: offset..<(offset + count))) else { return }
                offset += count
            }
            if closing { return }
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
