import Foundation
public protocol ChatTransport: AnyObject {
    func request(_ path: String, method: String, body: [String: Any]?, token: String, max: Int) async throws -> Data
    func cancel()
}
public extension ChatTransport {
    func json(_ path: String, method: String = "GET", body: [String: Any]? = nil, token: String = "") async throws -> [String: Any] {
        let data = try await request(path, method: method, body: body, token: token, max: 12 * 1024 * 1024)
        guard let j = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw ChatError.invalid }; return j
    }
}
public final class ChatHTTP: NSObject, ChatTransport, URLSessionTaskDelegate, @unchecked Sendable {
    private let lock = NSLock()
    private var tasks: [UUID: Task<Data, Error>] = [:]
    private var session: URLSession!
    public init(protocolClasses: [AnyClass]? = nil) {
        super.init()
        let c = URLSessionConfiguration.ephemeral
        c.urlCache = nil; c.httpCookieStorage = nil; c.urlCredentialStorage = nil
        c.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        c.httpShouldSetCookies = false; c.timeoutIntervalForRequest = 20; c.timeoutIntervalForResource = 80
        if let protocolClasses { c.protocolClasses = protocolClasses }
        session = URLSession(configuration: c, delegate: self, delegateQueue: nil)
    }
    public func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    public func request(_ path: String, method: String, body: [String: Any]?, token: String, max: Int) async throws -> Data {
        guard ["GET", "POST", "DELETE"].contains(method), max > 0, max <= 17 * 1024 * 1024 else { throw ChatError.invalid }
        var r = URLRequest(url: try ChatPolicy.url(path)); r.httpMethod = method
        r.setValue("no-store", forHTTPHeaderField: "Cache-Control"); r.setValue("no-cache", forHTTPHeaderField: "Pragma"); r.setValue("application/json", forHTTPHeaderField: "Accept")
        if !token.isEmpty { r.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        if let body { let b = try JSONSerialization.data(withJSONObject: body); guard b.count <= 17 * 1024 * 1024 else { throw ChatError.tooLarge }; r.httpBody = b; r.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let id = UUID(), request = r, session = self.session
        let task = Task<Data, Error> {
            let (stream, response) = try await session.bytes(for: request)
            guard let h = response as? HTTPURLResponse else { throw ChatError.unavailable }
            guard (200..<300).contains(h.statusCode) else { throw h.statusCode == 401 ? ChatError.expired : h.statusCode == 403 ? ChatError.denied : ChatError.unavailable }
            guard response.expectedContentLength <= max else { throw ChatError.tooLarge }
            var bytes = Data(); bytes.reserveCapacity(min(max, 65536))
            for try await byte in stream { try Task.checkCancellation(); guard bytes.count < max else { throw ChatError.tooLarge }; bytes.append(byte) }
            return bytes
        }
        track(id, task); defer { untrack(id) }
        return try await withTaskCancellationHandler(operation: { try await task.value }, onCancel: { task.cancel() })
    }
    private func track(_ id: UUID, _ task: Task<Data, Error>) { lock.lock(); tasks[id] = task; lock.unlock() }
    private func untrack(_ id: UUID) { lock.lock(); tasks.removeValue(forKey: id); lock.unlock() }
    public func cancel() { lock.lock(); let running = Array(tasks.values); tasks.removeAll(); lock.unlock(); running.forEach { $0.cancel() } }
    deinit { session.invalidateAndCancel() }
}
