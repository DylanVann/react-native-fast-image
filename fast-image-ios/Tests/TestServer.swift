import Foundation
import Network

// A local HTTP server for the scenarios: serves the fixtures by path (the
// query ignored; 404 without one), and holds or changes responses on request.
// One request per connection.
final class TestServer: @unchecked Sendable {
    struct Response {
        var status = 200
        var body = Data()
        var headers: [String: String] = [:]
    }

    private let images: URL
    private let listener: NWListener
    private let queue = DispatchQueue(label: "TestServer", attributes: .concurrent)
    private let lock = NSLock()
    private var held: [String: DispatchSemaphore] = [:]
    private var responses: [String: Response] = [:]
    private var connections: [NWConnection] = []
    private(set) var port: UInt16 = 0

    init(images: URL) throws {
        self.images = images
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = NWEndpoint.hostPort(host: "127.0.0.1", port: .any)
        listener = try NWListener(using: parameters)
        let ready = DispatchSemaphore(value: 0)
        listener.stateUpdateHandler = { state in
            if case .ready = state { ready.signal() }
        }
        listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
        listener.start(queue: queue)
        // A slow machine can take a while, and without a port every load fails.
        guard ready.wait(timeout: .now() + 30) == .success, let port = listener.port?.rawValue else {
            throw NWError.posix(.ETIMEDOUT)
        }
        self.port = port
    }

    func url(_ path: String) -> String { "http://127.0.0.1:\(port)\(path)" }

    func hold(_ path: String) {
        lock.lock()
        held[path] = DispatchSemaphore(value: 0)
        lock.unlock()
    }

    func release(_ path: String) {
        lock.lock()
        let semaphore = held.removeValue(forKey: path)
        lock.unlock()
        semaphore?.signal()
    }

    func respond(_ path: String, _ response: Response) {
        lock.lock()
        responses[path] = response
        lock.unlock()
    }

    func stop() {
        lock.lock()
        let semaphores = Array(held.values)
        held.removeAll()
        let open = connections
        connections.removeAll()
        lock.unlock()
        for semaphore in semaphores { semaphore.signal() }
        for connection in open { connection.cancel() }
        listener.cancel()
    }

    private func accept(_ connection: NWConnection) {
        lock.lock()
        connections.append(connection)
        lock.unlock()
        connection.start(queue: queue)
        read(connection, Data())
    }

    private func read(_ connection: NWConnection, _ received: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, complete, error in
            guard let self else { return }
            var received = received
            if let data { received.append(data) }
            if let end = received.range(of: Data("\r\n\r\n".utf8)) {
                let head = String(decoding: received[..<end.lowerBound], as: UTF8.self)
                let path = head.split(separator: " ").dropFirst().first.map(String.init) ?? "/"
                self.queue.async { self.answer(connection, path) }
            } else if complete || error != nil {
                connection.cancel()
            } else {
                self.read(connection, received)
            }
        }
    }

    private func answer(_ connection: NWConnection, _ path: String) {
        lock.lock()
        let semaphore = held[path]
        let set = responses[path]
        lock.unlock()
        if let semaphore {
            _ = semaphore.wait(timeout: .now() + 20)
            semaphore.signal()
        }
        let answer = set ?? fixture(path)
        var head = "HTTP/1.1 \(answer.status) \(answer.status == 200 ? "OK" : "Error")\r\n"
        head += "Content-Length: \(answer.body.count)\r\nConnection: close\r\n"
        for (name, value) in answer.headers { head += "\(name): \(value)\r\n" }
        var bytes = Data((head + "\r\n").utf8)
        bytes.append(answer.body)
        connection.send(content: bytes, isComplete: true, completion: .contentProcessed { _ in connection.cancel() })
    }

    private func fixture(_ path: String) -> Response {
        let name = String(path.split(separator: "?", maxSplits: 1).first ?? "").dropFirst()
        guard !name.isEmpty, let data = try? Data(contentsOf: images.appendingPathComponent(String(name))) else {
            return Response(status: 404)
        }
        return Response(body: data)
    }
}
