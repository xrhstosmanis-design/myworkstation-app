import XCTest
import UIKit
import MWSChatCore
@testable import MWChat
final class ControlledTransport: ChatTransport {
    var paths: [(String, String)] = []
    var response: [String: Any] = [:]
    var fail = false, delay = false, cancelled = 0
    var responder: ((String, String) -> [String: Any])?
    var continuation: CheckedContinuation<Data, Error>?
    func cancel() { cancelled += 1 }
    func request(_ path: String, method: String, body: [String: Any]?, token: String, max: Int) async throws -> Data {
        paths.append((path, method)); if fail { throw ChatError.unavailable }
        if delay { return try await withCheckedThrowingContinuation { continuation = $0 } }
        return try JSONSerialization.data(withJSONObject: responder?(path, method) ?? response)
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
    func testForegroundRefreshPreservesDraftAndNeverBlocksComposer() async {
        let api = ControlledTransport(), m = model(api); m.draft = "keep draft"; api.response = ["store": ["id": "s", "companyId": "c", "name": "Authorized store name"], "rows": [["id": "new", "body": "new message"]]]
        await m.poll(); XCTAssertFalse(m.busy); XCTAssertEqual(m.draft, "keep draft"); XCTAssertEqual(m.messages.first?.id, "new"); XCTAssertEqual(m.selected?.name, "Authorized store name"); XCTAssertEqual(api.paths.filter { $0.1 == "POST" }.count, 0)
    }
    func testOldForegroundRefreshCannotOverwriteHistoryAfterSend() async throws {
        let api = ControlledTransport(), m = model(api); api.delay = true; let old = Task { await m.poll() }
        while api.continuation == nil { await Task.yield() }
        api.delay = false; api.responder = { _, method in method == "POST" ? ["ok": true, "id": "sent"] : ["store": ["id": "s", "companyId": "c"], "rows": [["id": "current", "body": "new snapshot"]]] }; m.draft = "synthetic"; await m.send(); XCTAssertEqual(m.messages.first?.id, "current")
        let stale: [String: Any] = ["store": ["id": "s", "companyId": "c"], "rows": [["id": "stale", "body": "old snapshot"]]]
        api.continuation?.resume(returning: try JSONSerialization.data(withJSONObject: stale)); await old.value
        XCTAssertEqual(m.messages.first?.id, "current"); XCTAssertFalse(m.messages.contains { $0.id == "stale" }); XCTAssertEqual(api.paths.filter { $0.1 == "POST" }.count, 1)
    }
    func testClosedCaptureCannotRestartAfterPermissionOrViewCancellation() async {
        let state = CaptureState(); state.cleanup(); await state.prepare("video"); state.start("voice"); state.takePhoto()
        XCTAssertFalse(state.recording); XCTAssertNil(state.draft); XCTAssertFalse(state.camera.session.isRunning)
    }
    func testPrivateComposerDoesNotRetainUndoOrOfferCopyCutExport() {
        let view = PrivateComposer.Field(); view.text = "synthetic private draft"
        XCTAssertNil(view.undoManager)
        XCTAssertFalse(view.canPerformAction(#selector(UIResponderStandardEditActions.copy(_:)), withSender: nil))
        XCTAssertFalse(view.canPerformAction(#selector(UIResponderStandardEditActions.cut(_:)), withSender: nil))
    }
    func testPhotoConversionProducesBoundedInMemoryJPEG() throws {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 64, height: 96))
        let image = renderer.image { context in UIColor.purple.setFill(); context.fill(CGRect(x: 0, y: 0, width: 64, height: 96)) }
        let bytes = try XCTUnwrap(image.jpegData(compressionQuality: 0.9)); let result = try MediaPicker.Coordinator.photo(bytes)
        XCTAssertEqual(result.mime, "image/jpeg"); XCTAssertLessThan(result.bytes.count, MediaPolicy.imageMax); XCTAssertNotNil(UIImage(data: result.bytes))
        XCTAssertThrowsError(try MediaPicker.Coordinator.photo(Data([1,2,3])))
    }
    func testOldPickerCannotReplaceNewImportOrCrossSelectedStore() throws {
        let api = ControlledTransport(), m = model(api); m.photosEnabled = true
        let old = try XCTUnwrap(m.beginImport()); m.background(); m.active = true; m.selected = Store(["id": "new-store", "companyId": "c"])
        let current = try XCTUnwrap(m.beginImport()); XCTAssertTrue(old.isCancelled)
        m.finishImport(old, media: [DraftMedia(bytes: Data([1]), mime: "image/jpeg", name: "stale.jpg")], error: nil)
        XCTAssertTrue(m.importing); XCTAssertTrue(m.mediaLease === current); XCTAssertTrue(m.media.isEmpty)
        m.finishImport(current, media: [DraftMedia(bytes: Data([2]), mime: "image/jpeg", name: "current.jpg")], error: nil)
        XCTAssertFalse(m.importing); XCTAssertEqual(m.media.first?.name, "current.jpg")
    }
    func testPermissionForegroundDoesNotInvalidateImportAndSendWaitsForIt() async throws {
        let api = ControlledTransport(), m = model(api); let claims = try JSONSerialization.data(withJSONObject: ["tokenType": "BACKOFFICE_USER", "exp": Date().addingTimeInterval(600).timeIntervalSince1970])
        m.token = "fixture." + claims.base64EncodedString().replacingOccurrences(of: "=", with: "").replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_") + ".synthetic"
        let lease = try XCTUnwrap(m.beginImport()); m.draft = "pending photo"
        await m.foreground(); await m.send(); XCTAssertTrue(api.paths.isEmpty); XCTAssertTrue(m.mediaLease === lease)
        m.background(); XCTAssertTrue(lease.isCancelled); XCTAssertFalse(m.importing)
    }
    func testExpiredForegroundCancelsImportAndClearsSession() async throws {
        let api = ControlledTransport(), m = model(api); let lease = try XCTUnwrap(m.beginImport())
        await m.foreground(); XCTAssertTrue(lease.isCancelled); XCTAssertTrue(m.token.isEmpty); XCTAssertNil(m.selected); XCTAssertFalse(m.importing); XCTAssertTrue(api.paths.isEmpty)
    }
    func testCancelledProviderContinuationResumesOnlyOnce() async throws {
        let lease = MediaLease(epoch: 1, scope: Scope(company: "c", store: "s")); var gate: MediaReadGate?
        let task = Task<Data, Error> { try await withCheckedThrowingContinuation { continuation in let g = MediaReadGate(continuation); gate = g; lease.onCancel { g.finish(.failure(CancellationError())) } } }
        while gate == nil { await Task.yield() }
        let progress = Progress(totalUnitCount: 1); lease.attach(progress); lease.cancel(); XCTAssertTrue(progress.isCancelled)
        do { _ = try await task.value; XCTFail("cancel expected") } catch is CancellationError {} catch { XCTFail("unexpected failure") }
        gate?.finish(.success(Data([1,2,3]))) // Late provider completion cannot resume twice.
    }
}
