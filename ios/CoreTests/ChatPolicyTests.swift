import XCTest
@testable import MWSChatCore
final class ChatPolicyTests: XCTestCase {
    private func token(_ claims: [String: Any]) -> String { "header." + (try! JSONSerialization.data(withJSONObject: claims)).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") + ".signature" }
    func testTokenRestoreAndBoundedTwoFactor() {
        let now = Date(timeIntervalSince1970: 1000)
        XCTAssertTrue(TokenClaims.usable(token(["tokenType": "BACKOFFICE_USER", "exp": 1100]), now: now))
        XCTAssertFalse(TokenClaims.usable(token(["tokenType": "POS_OPERATOR", "exp": 1100]), now: now))
        XCTAssertFalse(TokenClaims.usable(token(["tokenType": "BACKOFFICE_USER", "exp": 999]), now: now))
        XCTAssertTrue(TokenClaims.usable(token(["purpose": "TOTP_CHALLENGE", "id": "user", "exp": 1300]), challenge: true, now: now))
        for extra in [0, 331, -1] { XCTAssertFalse(TokenClaims.usable(token(["purpose": "TOTP_CHALLENGE", "id": "user", "exp": 1000+extra]), challenge: true, now: now)) }
        XCTAssertFalse(TokenClaims.usable(token(["purpose": "PASSWORD_RESET", "id": "user", "exp": 1100]), challenge: true, now: now))
        for malformed in ["", "a.b.c", "a..c", String(repeating: "a", count: 20000)] { XCTAssertNil(TokenClaims.decode(malformed)) }
    }
    func testStoreLinkAndFixedOrigin() throws {
        XCTAssertEqual(try ChatPolicy.storeLink("https://myworkstation-app.onrender.com/chat/store-1"), "store-1")
        for link in ["https://evil.example/chat/store", "http://myworkstation-app.onrender.com/chat/store", "https://myworkstation-app.onrender.com:443/chat/store", "https://user@myworkstation-app.onrender.com/chat/store", "https://myworkstation-app.onrender.com/chat/store?q=1", "https://myworkstation-app.onrender.com/chat/store#x", "https://myworkstation-app.onrender.com/chat/a/b", "https://myworkstation-app.onrender.com/chat/"] { XCTAssertThrowsError(try ChatPolicy.storeLink(link)) }
        for path in ["https://evil.example/api/x", "//evil.example/api/x", "/api/x\r\nX: y", "/api/x\r", "/api/x\n", "/api/x\u{0}", "/api/x\u{2028}", "/api/x\\x", "/api/x#f"] { XCTAssertThrowsError(try ChatPolicy.url(path), path.debugDescription) }
        XCTAssertEqual(try ChatPolicy.url("/api/store-chat/mobile/stores").host, "myworkstation-app.onrender.com")
        XCTAssertEqual(ChatPolicy.component("a/b?c"), "a%2Fb%3Fc")
    }
    func testEvidenceCannotCrossStoreOrCompanyOrBecomeAllStores() {
        let s = Scope(company: "c", store: "s"), row: [String: Any] = ["companyId": "c", "storeId": "s", "scope": "OWNER_SELECTED_STORE"]
        XCTAssertTrue(s.evidence(["scope": ["companyId": "c", "storeId": "s"], "evidence": [row]], platform: false))
        XCTAssertFalse(s.evidence(["scope": ["companyId": "c", "storeId": "other"], "evidence": [row]], platform: false))
        XCTAssertFalse(s.evidence(["scope": ["companyId": "c", "storeId": "s"], "evidence": [["scope": "OWNER_SELECTED_STORE", "kind": "sales_by_store", "stores": [["companyId": "c", "storeId": "other"]]]]], platform: false))
        XCTAssertFalse(s.evidence(["scope": ["companyId": "c", "storeId": "s"], "evidence": [row]], platform: true))
        XCTAssertFalse(Scope(company: "", store: "").matches([:]))
        XCTAssertTrue(TokenClaims.switchCompany(["tokenType": "BACKOFFICE_USER", "role": "OWNER", "companyId": "one"], company: "two"))
        XCTAssertFalse(TokenClaims.switchCompany(["tokenType": "BACKOFFICE_USER", "role": "OWNER", "supportContext": true, "companyId": "one"], company: "two"))
    }
    func testLateCallbacksAreRejectedOnEveryScopeBoundary() {
        var f = RequestFence(); let epoch = f.epoch, a = Scope(company: "c", store: "a"), b = Scope(company: "c", store: "b")
        XCTAssertTrue(f.accepts(epoch, capturedScope: a, currentScope: a, capturedToken: "t", currentToken: "t", active: true))
        XCTAssertFalse(f.accepts(epoch, capturedScope: a, currentScope: b, capturedToken: "t", currentToken: "t", active: true))
        XCTAssertFalse(f.accepts(epoch, capturedScope: a, currentScope: a, capturedToken: "t", currentToken: "other", active: true))
        XCTAssertFalse(f.accepts(epoch, capturedScope: a, currentScope: a, capturedToken: "t", currentToken: "t", active: false))
        f.invalidate(); XCTAssertFalse(f.accepts(epoch, capturedScope: a, currentScope: a, capturedToken: "t", currentToken: "t", active: true))
    }
    func testQuickRepliesNeverSendAndPreserveDraftUntilExplicitChoice() throws {
        XCTAssertEqual(try ChatPolicy.reply(ChatPolicy.replies[0], draft: "Πρόχειρο", append: true), "Πρόχειρο\nΤο έλαβα, ευχαριστώ.")
        XCTAssertEqual(try ChatPolicy.reply(ChatPolicy.replies[0], draft: "Πρόχειρο", append: false), ChatPolicy.replies[0])
        XCTAssertThrowsError(try ChatPolicy.reply("arbitrary", draft: "", append: false))
        XCTAssertThrowsError(try ChatPolicy.reply(ChatPolicy.replies[0], draft: String(repeating: "x", count: 5000), append: true))
    }
    func testMessageTimeUsesDeviceZoneWithoutChangingSourceTimestamp() {
        let zone = TimeZone(secondsFromGMT: 10800)!
        XCTAssertEqual(ChatPolicy.displayTime("2026-10-22T12:00:00.000Z", zone: zone), "22/10 15:00")
        XCTAssertEqual(ChatPolicy.displayTime("2026-10-22T12:00:00Z", zone: zone), "22/10 15:00")
        XCTAssertEqual(ChatPolicy.displayTime("invalid", zone: zone), "")
    }
    func testMediaLimitsAndCanonicalWav() throws {
        XCTAssertTrue(MediaPolicy.photoBatch([Data([1]), Data([2])]))
        XCTAssertFalse(MediaPolicy.photoBatch(Array(repeating: Data([1]), count: 6)))
        XCTAssertFalse(MediaPolicy.photoBatch([Data(count: MediaPolicy.imageMax+1)]))
        XCTAssertFalse(MediaPolicy.photoBatch(Array(repeating: Data(count: 6*1024*1024), count: 3)))
        let wav = try MediaPolicy.wav(Data(count: 32000)); XCTAssertEqual(wav.count, 32044); XCTAssertEqual(String(data: wav.prefix(4), encoding: .ascii), "RIFF"); XCTAssertEqual(String(data: wav[8..<12], encoding: .ascii), "WAVE"); XCTAssertEqual(wav[22], 1); XCTAssertEqual(wav[34], 16)
        XCTAssertThrowsError(try MediaPolicy.wav(Data())); XCTAssertThrowsError(try MediaPolicy.wav(Data(count: 3))); XCTAssertThrowsError(try MediaPolicy.wav(Data(count: MediaPolicy.voiceMax)))
    }
    func testFragmentedRemuxRejectsMalformedAndNeverLeavesMoofInOutput() throws {
        for bytes in [Data(), Data(repeating: 0, count: 64), MP4.atom("moov", Data()), MP4.atom("ftyp", Data("isom0000".utf8))] { XCTAssertThrowsError(try MP4.flatten(bytes)) }
        let fullHeader = Data(repeating: 0, count: 100)
        var mvhd = fullHeader; mvhd.replaceSubrange(12..<16, with: MP4.be(1000))
        var tkhd = fullHeader; tkhd.replaceSubrange(12..<16, with: MP4.be(1))
        var mdhd = Data(repeating: 0, count: 24); mdhd.replaceSubrange(12..<16, with: MP4.be(1000))
        let stbl = MP4.atom("stbl", MP4.full("stsd", MP4.be(0)))
        let trak = MP4.atom("trak", MP4.atom("tkhd", tkhd) + MP4.atom("mdia", MP4.atom("mdhd", mdhd) + MP4.atom("minf", stbl)))
        let initial = MP4.atom("ftyp", Data("isom0000".utf8)) + MP4.atom("moov", MP4.atom("mvhd", mvhd) + trak)
        let tfhd = MP4.atom("tfhd", MP4.be(0x020000) + MP4.be(1))
        func fragment(_ offset: UInt32) -> Data { MP4.atom("moof", MP4.atom("traf", tfhd + MP4.atom("trun", MP4.be(0x301) + MP4.be(1) + MP4.be(offset) + MP4.be(1000) + MP4.be(4)))) }
        let moof = fragment(UInt32(fragment(0).count+8)), bytes = initial + moof + MP4.atom("mdat", Data([1,2,3,4]))
        let flat = try MP4.flatten(bytes); XCTAssertTrue(MP4.validEnvelope(flat)); XCTAssertFalse(try MP4.boxes(flat).contains { $0.kind == "moof" }); XCTAssertEqual(try MP4.boxes(flat).map(\.kind), ["ftyp", "mdat", "moov"])
        XCTAssertThrowsError(try MP4.flatten(initial + fragment(0) + MP4.atom("mdat", Data([1,2,3,4]))))
        XCTAssertFalse(MP4.selfContained(flat), "An envelope without an explicit self-contained track data reference cannot reach AVFoundation")
    }
}
