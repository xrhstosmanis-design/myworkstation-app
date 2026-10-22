import XCTest
import MWSChatCore
@testable import MWChat
final class ControlledTransport: ChatTransport {
    var paths: [(String, String)] = []
    var response: [String: Any] = [:]
    var fail = false, delay = false, cancelled = 0
    var continuation: CheckedContinuation<Data, Error>?
    func cancel() { cancelled += 1 }
    func request(_ path: String, method: String, body: [String: Any]?, token: String, max: Int) async throws -> Data {
        paths.append((path, method)); if fail { throw ChatError.unavailable }
        if delay { return try await withCheckedThrowingContinuation { continuation = $0 } }
        return try JSONSerialization.data(withJSONObject: response)
    }
}
@MainActor final class ChatModelTests: XCTestCase {
    func model(_ api: ControlledTransport) -> ChatModel {
        let m = ChatModel(api: api, restore: false); m.token = "fixture"; m.identity = ["id": "u", "role": "OWNER", "companyId": "c", "tokenType": "BACKOFFICE_USER"]; let s = Store(["id": "s", "companyId": "c", "name": "LAB"]); m.stores = [s]; m.selected = s; m.screen = .conversation; return m
    }
    func testBackgroundClearsPrivateStateAndRejectsLateResponse() async throws {
        let api = ControlledTransport(), m = model(api); api.delay = true; m.draft = "private draft"; m.media = [DraftMedia(bytes: Data([1]), mime: "image/jpeg", name: "photo")]
        let task = Task { await m.reload() }
        while api.continuation == nil { await Task.yield() }
        m.background(); XCTAssertTrue(m.draft.isEmpty); XCTAssertTrue(m.media.isEmpty); XCTAssertTrue(m.messages.isEmpty); XCTAssertGreaterThan(api.cancelled, 0)
        let value: [String: Any] = ["store": ["id": "s", "companyId": "c"], "rows": [["id": "private", "body": "must not appear"]]]
        api.continuation?.resume(returning: try JSONSerialization.data(withJSONObject: value)); await task.value; XCTAssertTrue(m.messages.isEmpty); XCTAssertFalse(m.busy)
    }
    func testSelectedStoreResponseMustMatchBothIdentifiers() async {
        let api = ControlledTransport(), m = model(api)
        api.response = ["store": ["id": "s", "companyId": "foreign"], "rows": [["id": "x", "body": "foreign"]]]; await m.reload(); XCTAssertTrue(m.messages.isEmpty); XCTAssertFalse(m.status.isEmpty)
    }
    func testUncertainPostCannotBeReplayedAutomaticallyOrBySecondTap() async {
        let api = ControlledTransport(), m = model(api); api.fail = true; m.draft = "synthetic send"
        await m.send(); XCTAssertEqual(api.paths.filter { $0.1 == "POST" }.count, 1); XCTAssertEqual(m.uncertainStore, "s")
        await m.send(); XCTAssertEqual(api.paths.filter { $0.1 == "POST" }.count, 1)
        m.background(); XCTAssertEqual(m.uncertainStore, "s"); XCTAssertTrue(m.draft.isEmpty)
    }
    func testExplicitReceiptAdvancesSinglePhotoOnlyAndUnknownStopsBatch() async {
        let api = ControlledTransport(), m = model(api); m.photosEnabled = true; m.draft = "caption"; m.media = [DraftMedia(bytes: Data([1]), mime: "image/jpeg", name: "one.jpg"), DraftMedia(bytes: Data([2]), mime: "image/jpeg", name: "two.jpg")]
        api.response = ["ok": true] // Missing id is not a receipt.
        await m.send(); XCTAssertEqual(api.paths.count, 1); XCTAssertEqual(m.media.count, 2); XCTAssertEqual(m.uncertainStore, "s")
    }
    func testStalePickerCannotCrossStoreOrBackgroundAndLogoutClearsAll() async {
        let api = ControlledTransport(), m = model(api); m.photosEnabled = true
        let epoch = m.generation, scope = m.selected?.scope; m.background(); m.active = true
        m.addMedia([DraftMedia(bytes: Data([1]), mime: "image/jpeg", name: "stale.jpg")], epoch: epoch, scope: scope); XCTAssertTrue(m.media.isEmpty)
        m.clearSession(); XCTAssertTrue(m.token.isEmpty); XCTAssertNil(m.selected); XCTAssertTrue(m.messages.isEmpty); XCTAssertTrue(m.stores.isEmpty)
    }
    func testStaffCannotAccessAIAndForeignStoreCannotBeChosen() async {
        let api = ControlledTransport(), m = model(api); m.identity = ["tokenType": "STORE_CHAT_OPERATOR", "storeId": "s", "companyId": "c"]; m.ai = true
        await m.reload(); XCTAssertTrue(api.paths.isEmpty); XCTAssertFalse(m.canAI)
        await m.choose(Store(["id": "other", "companyId": "foreign"])); XCTAssertEqual(m.selected?.id, "s")
    }
}
