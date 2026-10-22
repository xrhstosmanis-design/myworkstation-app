import UIKit
import UserNotifications
import CryptoKit
import FirebaseCore
import FirebaseMessaging
import MWSChatCore
@MainActor final class PushManager: NSObject, ObservableObject, UNUserNotificationCenterDelegate, MessagingDelegate {
    static let shared = PushManager()
    weak var model: ChatModel?
    private let vault = TokenVault()
    private var generation: UInt64 = 0
    private var enabled = false
    private var deleting = false
    private let api = ChatHTTP()
    override init() { super.init() }
    static func binding(_ token: String) -> String { SHA256.hash(data: Data(token.utf8)).map { String(format: "%02x", $0) }.joined() }
    private func path(_ m: ChatModel) -> String { m.staff ? "/api/store-chat/stores/" + ChatPolicy.component(m.identity["storeId"] as? String ?? "") + "/native-push" : "/api/store-chat/mobile/native-push" }
    func activate() async {
        guard let m = model, m.active, !m.token.isEmpty else { return }
        guard !deleting else { m.status = "Ολοκληρώνεται η προηγούμενη αποσύνδεση. Δοκίμασε ξανά σε λίγο."; return }
        let token = m.token, epoch = generation
        guard let check = try? await api.json(path(m), token: token), epoch == generation, token == m.token, check["configured"] as? Bool == true, check["iosAvailable"] as? Bool == true else { if epoch == generation, token == m.token { m.status = "Ο server δεν έχει ενεργή σύνδεση ειδοποιήσεων iOS." }; return }
        guard let file = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"), let options = FirebaseOptions(contentsOfFile: file), options.projectID == "myworkstation-chat", options.bundleID == Bundle.main.bundleIdentifier else { m.status = "Απαιτείται η ρύθμιση Apple/APNs και της εφαρμογής iOS στο Firebase."; return }
        do {
            let allowed = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
            guard allowed, m.active, epoch == generation, token == m.token else { return }
            if FirebaseApp.app() == nil { FirebaseApp.configure(options: options) }
            Messaging.messaging().delegate = self; Messaging.messaging().isAutoInitEnabled = true
            UNUserNotificationCenter.current().delegate = self; enabled = true
            UIApplication.shared.registerForRemoteNotifications()
            m.status = "Αναμονή εγγραφής συσκευής στο APNs…"
        } catch { m.status = "Δεν ενεργοποιήθηκαν οι ειδοποιήσεις. Το chat παραμένει διαθέσιμο." }
    }
    func apns(_ token: Data) { guard enabled, FirebaseApp.app() != nil else { return }; Messaging.messaging().apnsToken = token; Task { do { let value = try await Messaging.messaging().token(); await register(value) } catch { model?.status = "Δεν ολοκληρώθηκε η εγγραφή APNs/FCM." } } }
    nonisolated func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) { guard let fcmToken else { return }; Task { @MainActor in await self.register(fcmToken) } }
    private func register(_ fcm: String) async {
        guard enabled, let m = model, TokenClaims.usable(m.token), Messaging.messaging().apnsToken != nil else { return }
        let captured = m.token, epoch = generation
        guard let j = try? await api.json(path(m), method: "POST", body: ["token": fcm, "notificationVersion": 2, "platform": "ios"], token: captured), epoch == generation, captured == m.token, j["ok"] as? Bool == true, j["binding"] as? String == Self.binding(captured) else { return }
        do { try vault.save("true", key: "push-opt-in") } catch { clear(); return }; m.status = "Η συσκευή καταχωρίστηκε για ειδοποιήσεις."
    }
    func resume() { guard vault.read("push-opt-in") == "true" else { return }; Task { await activate() } }
    func clearDelivered() { UNUserNotificationCenter.current().removeAllDeliveredNotifications(); UNUserNotificationCenter.current().removeAllPendingNotificationRequests() }
    func clear() {
        generation &+= 1; enabled = false; vault.remove("push-opt-in"); clearDelivered()
        api.cancel()
        UIApplication.shared.unregisterForRemoteNotifications()
        if FirebaseApp.app() != nil { Messaging.messaging().isAutoInitEnabled = false; deleting = true; Messaging.messaging().deleteToken { [weak self] _ in Task { @MainActor in self?.deleting = false } } }
    }
    private func valid(_ info: [AnyHashable: Any], model: ChatModel) -> Bool {
        guard TokenClaims.usable(model.token), info["kind"] as? String == "MWS_CHAT", info["binding"] as? String == Self.binding(model.token), let store = info["storeId"] as? String, let company = info["companyId"] as? String, !store.isEmpty, !company.isEmpty else { return false }
        return !model.staff || (model.identity["storeId"] as? String == store && model.identity["companyId"] as? String == company)
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        Task { @MainActor in guard let m = self.model, self.valid(notification.request.content.userInfo, model: m) else { completionHandler([]); return }; completionHandler([.banner, .sound]) }
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let info = response.notification.request.content.userInfo
        Task { @MainActor in
            defer { completionHandler() }
            guard let m = self.model, self.valid(info, model: m) else { return }
            m.active = true; m.clearContent(); m.selected = nil; m.screen = .stores; await m.loadStores()
            guard self.valid(info, model: m), let s = m.stores.first(where: { $0.id == info["storeId"] as? String && $0.companyId == info["companyId"] as? String }) else { m.status = "Δεν υπάρχει πλέον πρόσβαση στη συνομιλία."; return }
            await m.choose(s)
        }
    }
}
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool { PrivacyShield.shared.start(); return true }
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) { Task { @MainActor in PushManager.shared.apns(deviceToken) } }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) { Task { @MainActor in PushManager.shared.model?.status = "Δεν ολοκληρώθηκε η εγγραφή APNs." } }
}
