import Foundation
import SwiftUI
import MWSChatCore
struct Store: Identifiable, Equatable {
    let id: String, companyId: String, name: String, companyName: String
    let unread: Int
    var scope: Scope { Scope(company: companyId, store: id) }
    init(_ j: [String: Any]) { id = j["id"] as? String ?? ""; companyId = j["companyId"] as? String ?? ""; name = j["name"] as? String ?? "Το κατάστημά μου"; companyName = j["companyName"] as? String ?? ""; unread = j["unread"] as? Int ?? 0 }
}
struct Message: Identifiable {
    let id: String, body: String, senderId: String, senderName: String, createdAt: String, mime: String
    let attachment: Bool, read: Bool
    init(_ j: [String: Any]) { id = j["id"] as? String ?? ""; body = j["body"] as? String ?? ""; senderId = j["senderId"] as? String ?? ""; senderName = j["senderName"] as? String ?? ""; createdAt = j["createdAt"] as? String ?? ""; mime = j["attachmentMimeType"] as? String ?? ""; attachment = j["hasAttachment"] as? Bool ?? false; read = j["readByMe"] as? Bool ?? false }
}
struct DraftMedia: Identifiable {
    let id = UUID()
    var bytes: Data
    let mime: String, name: String
}
@MainActor final class ChatModel: ObservableObject {
    enum Screen { case login, operatorLink, operatorPin, stores, conversation }
    @Published var screen: Screen = .login
    @Published var stores: [Store] = []
    @Published var selected: Store?
    @Published var messages: [Message] = []
    @Published var challenge = ""
    @Published var status = ""
    @Published var busy = false
    @Published var active = true
    @Published var draft = ""
    @Published var media: [DraftMedia] = []
    @Published var ai = false
    @Published var aiReady = false
    @Published var photosEnabled = false
    @Published var voiceAvailable = false
    @Published var videoAvailable = false
    @Published var aiRows: [(String, Bool)] = []
    @Published var evidence = ""
    @Published var operators: [(String, String)] = []
    @Published var operatorStore = ""
    @Published var uncertainStore = ""
    @Published var preview: DraftMedia?
    var token = "", identity: [String: Any] = [:], history: [[String: String]] = []
    let api: ChatTransport
    private let vault = TokenVault()
    private var fence = RequestFence()
    var onClear: (() -> Void)?
    var platform: Bool { TokenClaims.platform(identity) }
    var staff: Bool { identity["tokenType"] as? String == "STORE_CHAT_OPERATOR" }
    var canAI: Bool { !staff && (platform || identity["role"] as? String == "OWNER") }
    var base: String { "/api/store-chat/stores/" + ChatPolicy.component(selected?.id ?? "") }
    var assistant: String { platform ? "/api/platform/ai-command-center" : "/api/owner-assistant/stores/" + ChatPolicy.component(selected?.id ?? "") }
    init(api: ChatTransport = ChatHTTP(), restore: Bool = true) {
        self.api = api
        if restore {
            let saved = vault.read("token")
            if TokenClaims.usable(saved), let j = TokenClaims.decode(saved) { token = saved; identity = j; screen = .stores }
            else { vault.remove("token") }
            let c = vault.read("challenge"); if TokenClaims.usable(c, challenge: true) { challenge = c } else { vault.remove("challenge") }
        }
    }
    func clearContent() {
        fence.invalidate(); api.cancel(); busy = false; draft = ""; media.removeAll(); messages.removeAll(); aiRows.removeAll(); history.removeAll(); preview = nil; evidence = ""; status = ""; onClear?()
    }
    func background() { active = false; clearContent() }
    func foreground() async { active = true; if !challenge.isEmpty && !TokenClaims.usable(challenge, challenge: true) { clearChallenge() }; if !token.isEmpty && !TokenClaims.usable(token) { clearSession(); status = ChatError.expired.localizedDescription }; if !token.isEmpty { if selected != nil { await reload() } else { await loadStores() } } }
    func clearChallenge() { challenge = ""; vault.remove("challenge") }
    func clearSession() { clearContent(); token = ""; identity = [:]; selected = nil; stores = []; operators = []; operatorStore = ""; uncertainStore = ""; clearChallenge(); vault.remove("token"); screen = .login; PushManager.shared.clear() }
    @discardableResult func call(_ path: String, method: String = "GET", body: [String: Any]? = nil, anonymous: Bool = false) async -> [String: Any]? {
        guard !busy, active else { return nil }; busy = true; status = method == "GET" ? "Ανανέωση…" : "Παρακαλώ περίμενε…"
        let epoch = fence.epoch, captured = token, scope = selected?.scope
        do {
            let j = try await api.json(path, method: method, body: body, token: anonymous ? "" : captured)
            guard fence.accepts(epoch, capturedScope: scope, currentScope: selected?.scope, capturedToken: captured, currentToken: token, active: active) else { return nil }
            busy = false; status = ""; return j
        } catch {
            guard fence.accepts(epoch, capturedScope: scope, currentScope: selected?.scope, capturedToken: captured, currentToken: token, active: active) else { return nil }
            busy = false
            if !anonymous, case ChatError.expired = error { clearSession() }
            status = error.localizedDescription; return nil
        }
    }
    func login(email: String, password: String) async {
        if !challenge.isEmpty && !TokenClaims.usable(challenge, challenge: true) { clearChallenge(); status = "Η επιβεβαίωση 2FA έληξε. Συνδέσου ξανά."; return }
        let body: [String: Any] = challenge.isEmpty ? ["email": email.trimmingCharacters(in: .whitespacesAndNewlines), "password": password, "deviceName": "MW Chat iOS"] : ["challengeToken": challenge, "code": password, "deviceName": "MW Chat iOS"]
        if let j = await call(challenge.isEmpty ? "/api/auth/login" : "/api/auth/2fa/verify", method: "POST", body: body, anonymous: true) { await accept(j) }
    }
    func accept(_ j: [String: Any]) async {
        if j["setupRequired"] as? Bool == true { status = "Ολοκλήρωσε πρώτα το 2FA από τη συνήθη είσοδο Backoffice."; return }
        if j["mfaRequired"] as? Bool == true {
            guard let c = j["challengeToken"] as? String, TokenClaims.usable(c, challenge: true) else { status = ChatError.invalid.localizedDescription; return }
            do { try vault.save(c, key: "challenge"); challenge = c } catch { status = "Δεν αποθηκεύτηκε ασφαλώς η επιβεβαίωση." }; return
        }
        guard let user = j["user"] as? [String: Any], user["mustChangePassword"] as? Bool != true, let t = j["token"] as? String, TokenClaims.usable(t), let claims = TokenClaims.decode(t) else { status = "Έλεγξε τη σύνδεση ή ολοκλήρωσε την αλλαγή κωδικού στο Backoffice."; return }
        do { try vault.save(t, key: "token") } catch { status = "Δεν αποθηκεύτηκε ασφαλώς η σύνδεση."; return }
        clearContent(); clearChallenge(); PushManager.shared.clear(); token = t; identity = claims; selected = nil; screen = .stores; await loadStores()
    }
    func directory(link: String) async {
        do {
            let id = try ChatPolicy.storeLink(link)
            guard let j = await call("/api/operators/stores/" + ChatPolicy.component(id) + "/directory", anonymous: true) else { return }
            operators = ((j["operators"] ?? j["rows"]) as? [[String: Any]] ?? []).filter { $0["hasPin"] as? Bool == true }.compactMap { row in guard let id = row["employeeId"] as? String, let name = row["displayName"] as? String else { return nil }; return (id, name) }
            guard !operators.isEmpty else { status = "Δεν υπάρχουν διαθέσιμοι εργαζόμενοι με PIN."; return }; operatorStore = id; screen = .operatorPin
        } catch { status = "Χρειάζεται ο ακριβής σύνδεσμος Chat καταστήματος." }
    }
    func operatorLogin(employee: String, pin: String) async {
        guard operators.contains(where: { $0.0 == employee }) else { return }
        if let j = await call("/api/operators/login/chat-pin", method: "POST", body: ["storeId": operatorStore, "employeeId": employee, "pin": pin], anonymous: true) { await accept(j) }
    }
    func loadStores() async {
        guard !token.isEmpty else { return }
        if staff { let s = Store(["id": identity["storeId"] ?? "", "companyId": identity["companyId"] ?? "", "name": "Το κατάστημά μου"]); stores = s.scope.valid ? [s] : []; return }
        if let j = await call("/api/store-chat/mobile/stores"), let rows = j["stores"] as? [[String: Any]] { stores = rows.map(Store.init).filter { $0.scope.valid }; if stores.isEmpty { status = "Δεν υπάρχουν διαθέσιμα καταστήματα Chat." } }
    }
    func choose(_ store: Store) async {
        guard !busy, stores.contains(store), store.scope.valid else { return }; clearContent(); selected = nil
        if TokenClaims.switchCompany(identity, company: store.companyId) {
            guard let j = await call("/api/auth/owner-companies/select", method: "POST", body: ["companyId": store.companyId]), let t = j["token"] as? String, TokenClaims.usable(t), let claims = TokenClaims.decode(t), claims["companyId"] as? String == store.companyId else { return }
            do { try vault.save(t, key: "token") } catch { status = ChatError.unavailable.localizedDescription; return }; token = t; identity = claims; PushManager.shared.clearDelivered()
        }
        selected = store; ai = false; aiReady = false; screen = .conversation; await reload(); PushManager.shared.resume()
    }
    func back() async { guard !busy else { return }; clearContent(); selected = nil; ai = false; screen = .stores; await loadStores() }
    func toggleAI() async { guard !busy, selected != nil else { return }; clearContent(); ai.toggle(); aiReady = false; await reload() }
    func reload() async {
        guard let scope = selected?.scope, scope.valid else { return }
        if ai {
            guard canAI else { status = ChatError.denied.localizedDescription; return }
            let query = "?readScope=selected_store" + (platform ? "&companyId=" + ChatPolicy.component(scope.company) + "&storeId=" + ChatPolicy.component(scope.store) : "")
            if let j = await call(assistant + "/status" + query) { aiReady = j["available"] as? Bool == true && scope.matches(j["scope"] as? [String: Any]); if !aiReady { status = "Ο βοηθός δεν είναι διαθέσιμος για αυτό το κατάστημα." } }
        } else if let j = await call(base + "/messages?limit=100") {
            guard let s = j["store"] as? [String: Any], s["id"] as? String == scope.store, s["companyId"] as? String == scope.company, let rows = j["rows"] as? [[String: Any]] else { status = ChatError.invalid.localizedDescription; return }
            messages = rows.map(Message.init).filter { !$0.id.isEmpty }.sorted { $0.createdAt < $1.createdAt }
            photosEnabled = (j["settings"] as? [String: Any])?["photosEnabled"] as? Bool ?? true; voiceAvailable = j["voiceMessagesAvailable"] as? Bool ?? false; videoAvailable = j["videoMessagesAvailable"] as? Bool ?? false
        }
    }
    func send() async {
        guard !busy, let scope = selected?.scope, active else { return }
        let value = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        if ai { await ask(value); return }
        guard uncertainStore != scope.store else { status = ChatError.uncertain.localizedDescription; return }
        guard value.utf16.count <= 5000, !value.isEmpty || !media.isEmpty else { return }
        if media.contains(where: { $0.mime.hasPrefix("image/") }) && !photosEnabled { status = ChatError.denied.localizedDescription; return }
        repeat {
            let first = media.first; var body: [String: Any] = ["body": draft.trimmingCharacters(in: .whitespacesAndNewlines), "category": "GENERAL"]
            var suffix = "/messages"
            if let first {
                if first.mime == "audio/wav" { guard voiceAvailable else { return }; suffix = "/voice-messages" }
                if first.mime == "video/mp4" { guard videoAvailable else { return }; suffix = "/video-messages" }
                body["attachment"] = ["name": first.name, "mimeType": first.mime, "dataUrl": "data:" + first.mime + ";base64," + first.bytes.base64EncodedString()]
            }
            uncertainStore = scope.store
            guard let j = await call(base + suffix, method: "POST", body: body), j["ok"] as? Bool == true, !(j["id"] as? String ?? "").isEmpty else { if active && selected?.scope == scope { status = ChatError.uncertain.localizedDescription }; return }
            guard selected?.scope == scope, active else { return }; uncertainStore = ""; draft = ""
            if let first, media.first?.id == first.id { media.removeFirst() }
        } while !media.isEmpty && active && selected?.scope == scope
        await reload()
    }
    func discardUncertain() async { guard !busy else { return }; draft = ""; media.removeAll(); uncertainStore = ""; await reload() }
    func ask(_ question: String) async {
        guard aiReady, canAI, question.count >= 3, question.count <= 600, let scope = selected?.scope else { return }
        var body: [String: Any] = ["question": question, "inputChannel": "text", "readScope": "selected_store", "history": Array(history.suffix(10))]
        if platform { body["selection"] = ["companyId": scope.company, "storeId": scope.store]; body["snapshot"] = NSNull() }
        guard let j = await call(assistant + "/ask", method: "POST", body: body), scope.evidence(j, platform: platform), let answer = j["answer"] as? String else { return }
        aiRows.append((question, true)); aiRows.append((answer + ((j["limitations"] as? String).map { "\n\n" + $0 } ?? ""), false)); draft = ""
        history.append(["role": "user", "content": question]); history.append(["role": "assistant", "content": String(answer.prefix(2000))]); history = Array(history.suffix(10))
        if let rows = j["evidence"], let data = try? JSONSerialization.data(withJSONObject: rows, options: [.prettyPrinted, .sortedKeys]) { evidence = String(data: data, encoding: .utf8) ?? "" }
    }
    func markRead(_ message: Message) async { if await call(base + "/messages/" + ChatPolicy.component(message.id) + "/read", method: "POST", body: [:]) != nil { await reload() } }
    func attachment(_ message: Message) async {
        guard !busy, let scope = selected?.scope, message.attachment, messages.contains(where: { $0.id == message.id }) else { return }
        let max = message.mime == "video/mp4" ? MediaPolicy.videoMax : message.mime == "audio/wav" ? MediaPolicy.voiceMax : MediaPolicy.imageMax
        guard ["image/jpeg", "image/png", "image/webp", "video/mp4", "audio/wav"].contains(message.mime) else { status = "Η λήψη αρχείων δεν υποστηρίζεται."; return }
        let generation = fence.epoch, captured = token; busy = true
        do {
            let data = try await api.request(base + "/messages/" + ChatPolicy.component(message.id) + "/attachment", method: "GET", body: nil, token: captured, max: max)
            guard fence.accepts(generation, capturedScope: scope, currentScope: selected?.scope, capturedToken: captured, currentToken: token, active: active) else { return }; busy = false; preview = DraftMedia(bytes: data, mime: message.mime, name: "Συνημμένο")
        } catch { guard fence.epoch == generation else { return }; busy = false; if case ChatError.expired = error { clearSession() }; status = error.localizedDescription }
    }
    func addMedia(_ next: [DraftMedia], epoch: UInt64, scope: Scope?) {
        guard active, !busy, fence.epoch == epoch, selected?.scope == scope, scope?.valid == true, !ai, uncertainStore != scope?.store else { return }
        let images = next.allSatisfy { $0.mime.hasPrefix("image/") }
        if images { guard photosEnabled, media.allSatisfy({ $0.mime.hasPrefix("image/") }), MediaPolicy.photoBatch((media + next).map(\.bytes)) else { status = ChatError.tooLarge.localizedDescription; return }; media += next }
        else { guard media.isEmpty, next.count == 1, let first = next.first, first.mime == "video/mp4" && videoAvailable && first.bytes.count <= MediaPolicy.videoMax || first.mime == "audio/wav" && voiceAvailable && first.bytes.count <= MediaPolicy.voiceMax else { status = "Αφαίρεσε πρώτα τα παλιά συνημμένα."; return }; media = next }
    }
    var generation: UInt64 { fence.epoch }
    func logout() async {
        let old = token, path = staff ? baseForStaffLogout() : "/api/auth/logout"
        clearSession(); do { _ = try await api.json(path, method: "POST", body: [:], token: old) } catch { /* Local clearing never depends on network or retries. */ }
    }
    private func baseForStaffLogout() -> String { "/api/store-chat/stores/" + ChatPolicy.component(identity["storeId"] as? String ?? "") + "/mobile-logout" }
}
