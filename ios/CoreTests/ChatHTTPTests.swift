import XCTest
@testable import MWSChatCore
final class StubURLProtocol: URLProtocol {
    static var handler: ((URLRequest) throws -> (Int, Data))?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do { guard let handler = Self.handler else { throw ChatError.denied }; let (code, body) = try handler(request); let response = HTTPURLResponse(url: request.url!, statusCode: code, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json", "Content-Length": String(body.count)])!; client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed); client?.urlProtocol(self, didLoad: body); client?.urlProtocolDidFinishLoading(self) } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}
final class ChatHTTPTests: XCTestCase {
    override func tearDown() { StubURLProtocol.handler = nil }
    func testTransportDoesNotRetainItselfThroughSessionDelegate() {
        weak var reference: ChatHTTP?
        do { let api = ChatHTTP(protocolClasses: [StubURLProtocol.self]); reference = api; XCTAssertNotNil(reference) }
        XCTAssertNil(reference)
    }
    func testBoundedFixedOriginAuthAndNoAutomaticPostReplay() async throws {
        var count = 0
        StubURLProtocol.handler = { r in count += 1; XCTAssertEqual(r.url?.host, "myworkstation-app.onrender.com"); XCTAssertEqual(r.httpMethod, "POST"); XCTAssertEqual(r.value(forHTTPHeaderField: "Authorization"), "Bearer fixture"); XCTAssertEqual(r.value(forHTTPHeaderField: "Cache-Control"), "no-store"); return (503, Data("{}".utf8)) }
        let api = ChatHTTP(protocolClasses: [StubURLProtocol.self])
        do { _ = try await api.json("/api/fixture", method: "POST", body: ["body": "synthetic"], token: "fixture"); XCTFail("expected rejection") } catch {}
        XCTAssertEqual(count, 1)
    }
    func testOversizedResponseAnd401FailClosed() async throws {
        let api = ChatHTTP(protocolClasses: [StubURLProtocol.self])
        StubURLProtocol.handler = { _ in (200, Data(count: 1025)) }
        do { _ = try await api.request("/api/fixture", method: "GET", body: nil, token: "", max: 1024); XCTFail("oversize accepted") } catch { XCTAssertTrue(error is ChatError) }
        StubURLProtocol.handler = { _ in (401, Data("{}".utf8)) }
        do { _ = try await api.json("/api/fixture"); XCTFail("401 accepted") } catch ChatError.expired {} catch { XCTFail("wrong error") }
    }
}
