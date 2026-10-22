import Foundation
public enum ChatError: Error, LocalizedError {
    case invalid, denied, expired, tooLarge, uncertain, unavailable
    public var errorDescription: String? {
        switch self {
        case .invalid: return "Δεν επιβεβαιώθηκαν τα στοιχεία. Έλεγξε την επιλογή σου."
        case .denied: return "Δεν υπάρχει δικαίωμα για αυτή τη λειτουργία."
        case .expired: return "Η σύνδεση έληξε. Συνδέσου ξανά."
        case .tooLarge: return "Το αρχείο ξεπερνά το επιτρεπόμενο όριο."
        case .uncertain: return "Η αποστολή μπορεί να ολοκληρώθηκε. Έλεγξε το ιστορικό πριν νέα αποστολή."
        case .unavailable: return "Δεν ολοκληρώθηκε η σύνδεση. Ανανέωσε και έλεγξε πριν ξαναστείλεις."
        }
    }
}
public struct Scope: Equatable, Sendable {
    public let company: String
    public let store: String
    public init(company: String, store: String) { self.company = company; self.store = store }
    public var valid: Bool { !company.isEmpty && !store.isEmpty && company.count <= 200 && store.count <= 200 }
    public func matches(_ json: [String: Any]?) -> Bool { valid && json?["companyId"] as? String == company && json?["storeId"] as? String == store }
    public func evidence(_ answer: [String: Any], platform: Bool) -> Bool {
        guard matches(answer["scope"] as? [String: Any]) else { return false }
        guard let value = answer["evidence"] else { return true }
        guard let rows = value as? [[String: Any]] else { return false }
        return rows.allSatisfy { row in
            guard row["scope"] as? String == (platform ? "PLATFORM_SELECTED_STORE" : "OWNER_SELECTED_STORE") else { return false }
            if row["kind"] as? String == "sales_by_store" { return (row["stores"] as? [[String: Any]])?.allSatisfy { matches($0) } == true }
            return matches(row)
        }
    }
}
public enum TokenClaims {
    // Routing/restore eligibility only: every real request is authorized by the server.
    public static func decode(_ value: String) -> [String: Any]? {
        let parts = value.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3, parts.allSatisfy({ !$0.isEmpty }), value.utf8.count <= 16384 else { return nil }
        var body = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        body += String(repeating: "=", count: (4 - body.count % 4) % 4)
        guard let data = Data(base64Encoded: body) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }
    public static func usable(_ token: String, challenge: Bool = false, now: Date = Date()) -> Bool {
        guard let j = decode(token), let expiry = j["exp"] as? Double, expiry.isFinite else { return false }
        let remaining = expiry - now.timeIntervalSince1970
        if challenge { return j["purpose"] as? String == "TOTP_CHALLENGE" && !(j["id"] as? String ?? "").isEmpty && remaining > 0 && remaining <= 330 }
        return remaining > 0 && ["BACKOFFICE_USER", "STORE_CHAT_OPERATOR"].contains(j["tokenType"] as? String ?? "")
    }
    public static func platform(_ j: [String: Any]) -> Bool { j["role"] as? String == "SUPER_ADMIN" || j["platformRole"] as? String == "SUPER_ADMIN" || j["isSuperAdmin"] as? Bool == true }
    public static func switchCompany(_ j: [String: Any], company: String) -> Bool {
        j["tokenType"] as? String == "BACKOFFICE_USER" && j["role"] as? String == "OWNER" && !platform(j) && !(j["supportContext"] as? Bool ?? false) && !company.isEmpty && company != j["companyId"] as? String
    }
}
public enum ChatPolicy {
    public static let origin = URL(string: "https://myworkstation-app.onrender.com")!
    public static let replies = ["Το έλαβα, ευχαριστώ.", "Το ελέγχω και θα απαντήσω.", "Ολοκληρώθηκε.", "Χρειάζομαι περισσότερες πληροφορίες.", "Παρακαλώ στείλε μία φωτογραφία."]
    public static func component(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))) ?? "" }
    public static func url(_ path: String) throws -> URL {
        // CRLF is a single Swift Character; reject scalars rather than searching for an isolated CR/LF grapheme.
        let forbidden = path.unicodeScalars.contains { CharacterSet.controlCharacters.contains($0) || CharacterSet.newlines.contains($0) || $0.value == 92 || $0.value == 35 }
        guard path.hasPrefix("/api/"), !forbidden, let u = URL(string: origin.absoluteString + path), u.scheme == "https", u.host == origin.host, u.port == nil, u.user == nil, u.password == nil else { throw ChatError.invalid }
        return u
    }
    public static func storeLink(_ value: String) throws -> String {
        guard let c = URLComponents(string: value), c.scheme == "https", c.host == origin.host, c.port == nil, c.user == nil, c.password == nil, c.query == nil, c.fragment == nil else { throw ChatError.invalid }
        let p = c.path.split(separator: "/", omittingEmptySubsequences: false)
        guard p.count == 3, p[0].isEmpty, p[1] == "chat", !p[2].isEmpty, p[2].count <= 200 else { throw ChatError.invalid }
        return String(p[2])
    }
    public static func displayTime(_ value: String, zone: TimeZone = .current) -> String {
        let parser = ISO8601DateFormatter(); parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var date = parser.date(from: value); if date == nil { parser.formatOptions = [.withInternetDateTime]; date = parser.date(from: value) }
        guard let date else { return "" }; let f = DateFormatter(); f.locale = Locale(identifier: "el_GR"); f.timeZone = zone; f.dateFormat = "dd/MM HH:mm"; return f.string(from: date)
    }
    public static func reply(_ reply: String, draft: String, append: Bool) throws -> String {
        guard replies.contains(reply) else { throw ChatError.invalid }
        let next = append && !draft.isEmpty ? draft + "\n" + reply : reply
        guard next.utf16.count <= 5000 else { throw ChatError.tooLarge }; return next
    }
}
public struct RequestFence: Sendable {
    public private(set) var epoch: UInt64 = 0
    public mutating func invalidate() { epoch &+= 1 }
    public init() {}
    public func accepts(_ captured: UInt64, capturedScope: Scope?, currentScope: Scope?, capturedToken: String, currentToken: String, active: Bool) -> Bool {
        active && epoch == captured && capturedScope == currentScope && capturedToken == currentToken
    }
}
public enum MediaPolicy {
    public static let imageMax = 7 * 1024 * 1024, totalImagesMax = 14 * 1024 * 1024, videoMax = 12 * 1024 * 1024, voiceMax = 1_920_044
    public static func photoBatch(_ photos: [Data]) -> Bool { !photos.isEmpty && photos.count <= 5 && photos.allSatisfy { !$0.isEmpty && $0.count <= imageMax } && photos.reduce(0) { $0 + $1.count } <= totalImagesMax }
    public static func wav(_ pcm: Data) throws -> Data {
        guard !pcm.isEmpty, pcm.count % 2 == 0, pcm.count <= voiceMax - 44 else { throw ChatError.invalid }
        var d = Data(); func text(_ s: String) { d.append(contentsOf: s.utf8) }; func le(_ n: UInt32, _ width: Int = 4) { for i in 0..<width { d.append(UInt8(truncatingIfNeeded: n >> (i*8))) } }
        text("RIFF"); le(UInt32(pcm.count+36)); text("WAVEfmt "); le(16); le(1,2); le(1,2); le(16000); le(32000); le(2,2); le(16,2); text("data"); le(UInt32(pcm.count)); d.append(pcm); return d
    }
}
