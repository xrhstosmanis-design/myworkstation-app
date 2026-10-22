import UIKit
// Covers the entire window, including presented camera/picker/preview controllers, before app-switch snapshots.
@MainActor final class PrivacyShield {
    static let shared = PrivacyShield()
    private let tag = 0x4D575343
    private var tokens: [NSObjectProtocol] = []
    private init() {}
    func start() {
        guard tokens.isEmpty else { return }
        let center = NotificationCenter.default
        for name in [UIApplication.willResignActiveNotification, UIApplication.didBecomeActiveNotification, UIScreen.capturedDidChangeNotification] {
            tokens.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] notification in
                MainActor.assumeIsolated { self?.update(force: notification.name == UIApplication.willResignActiveNotification) }
            })
        }
        update(force: false)
    }
    func update(force: Bool) {
        for scene in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }) {
            let hidden = force || scene.activationState != .foregroundActive || scene.screen.isCaptured
            for window in scene.windows {
                if hidden {
                    if let existing = window.viewWithTag(tag) { window.bringSubviewToFront(existing); continue }
                    let cover = UIView(frame: window.bounds); cover.tag = tag; cover.backgroundColor = UIColor(red: 0.16, green: 0.10, blue: 0.25, alpha: 1); cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]; cover.accessibilityLabel = "MyWorkStation · Προστατευμένο περιεχόμενο"; cover.isAccessibilityElement = true; window.addSubview(cover); window.bringSubviewToFront(cover)
                } else { window.viewWithTag(tag)?.removeFromSuperview() }
            }
        }
    }
}
