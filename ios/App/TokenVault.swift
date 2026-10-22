import Foundation
import Security
final class TokenVault {
    private let service = "gr.myworkstation.chat.ios.preview.connection"
    func read(_ key: String) -> String {
        var q = query(key); q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?; guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return "" }; return String(data: data, encoding: .utf8) ?? ""
    }
    func save(_ value: String, key: String) throws {
        remove(key); guard !value.isEmpty else { return }
        var q = query(key); q[kSecValueData as String] = Data(value.utf8); q[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        guard SecItemAdd(q as CFDictionary, nil) == errSecSuccess else { throw NSError(domain: "TokenVault", code: 1) }
    }
    func remove(_ key: String) { SecItemDelete(query(key) as CFDictionary) }
    private func query(_ key: String) -> [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key, kSecAttrSynchronizable as String: false] }
}
