#if DEBUG
import Foundation
import MWSChatCore
// Disposable UI-test content; excluded from Release. No network or production session.
final class FixtureTransport: ChatTransport {
    var requests: [(String, String)] = []
    func cancel() {}
    func request(_ path: String, method: String, body: [String: Any]?, token: String, max: Int) async throws -> Data {
        requests.append((path, method))
        let value: [String: Any]
        if path == "/api/store-chat/mobile/stores" { value = ["stores": [["id": "fixture-store", "companyId": "fixture-company", "name": "ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ", "companyName": "Συνθετική δοκιμή", "unread": 2]]] }
        else if path.hasSuffix("/messages?limit=100") { value = ["store": ["id": "fixture-store", "companyId": "fixture-company"], "settings": ["photosEnabled": true], "voiceMessagesAvailable": true, "videoMessagesAvailable": true, "rows": [["id": "m1", "body": "Δοκιμή εμφάνισης συνομιλίας", "senderId": "other", "senderName": "Εργαστήριο", "createdAt": "2026-10-22T12:00:00Z", "readByMe": true], ["id": "m2", "body": "Το έλαβα, ευχαριστώ.", "senderId": "fixture-user", "senderName": "Εσύ", "createdAt": "2026-10-22T12:01:00Z", "readByMe": true]]] }
        else if path.hasSuffix("/messages") && method == "POST" { value = ["ok": true, "id": "synthetic-send"] }
        else { throw ChatError.denied }
        return try JSONSerialization.data(withJSONObject: value)
    }
    @MainActor static func makeModel() -> ChatModel {
        let m = ChatModel(api: FixtureTransport(), restore: false)
        let claims: [String: Any] = ["id": "fixture-user", "tokenType": "BACKOFFICE_USER", "role": "OWNER", "companyId": "fixture-company", "exp": Date().timeIntervalSince1970 + 3600]
        let body = (try! JSONSerialization.data(withJSONObject: claims)).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        m.token = "fixture." + body + ".not-a-server-signature"; m.identity = claims; m.screen = .stores; return m
    }
}
#endif
