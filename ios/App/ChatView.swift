import SwiftUI
import AVKit
import MWSChatCore
@main struct MWChatApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @StateObject private var model: ChatModel
    init() {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-fixture") { _model = StateObject(wrappedValue: FixtureTransport.makeModel()); return }
        #endif
        _model = StateObject(wrappedValue: ChatModel())
    }
    var body: some Scene { WindowGroup { RootView(model: model) } }
}
struct RootView: View {
    @ObservedObject var model: ChatModel
    @Environment(\.scenePhase) private var phase
    @State private var captured = UIScreen.main.isCaptured
    @State private var email = ""
    @State private var password = ""
    @State private var link = ""
    @State private var employee = ""
    @State private var picker: String?
    @State private var camera: String?
    @State private var replySheet = false
    @State private var evidenceSheet = false
    @State private var importEpoch: UInt64 = 0
    @State private var importScope: Scope?
    private let purple = Color(red: 0.44, green: 0.28, blue: 0.76)
    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                header
                if !model.status.isEmpty { Text(model.status).font(.subheadline).padding(10).accessibilityIdentifier("status").accessibilityAddTraits(.updatesFrequently) }
                switch model.screen {
                case .login: login
                case .operatorLink: operatorLink
                case .operatorPin: operatorPin
                case .stores: storeList
                case .conversation: conversation
                }
            }.background(Color(red: 0.96, green: 0.95, blue: 0.98)).tint(purple)
            if phase != .active || captured { Color(red: 0.16, green: 0.10, blue: 0.25).ignoresSafeArea().overlay { VStack { Image(systemName: "lock.fill").font(.largeTitle); Text("MyWorkStation Chat"); Text("Το περιεχόμενο προστατεύεται.").font(.subheadline) }.foregroundStyle(.white) }.accessibilityIdentifier("privacy-cover") }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIScreen.capturedDidChangeNotification)) { _ in captured = UIScreen.main.isCaptured; if captured { password = ""; picker = nil; camera = nil; replySheet = false; evidenceSheet = false; model.background() } else { Task { await model.foreground(); await PushManager.shared.openPending() } } }
        .onChange(of: phase) { _, next in
            if next != .active { password = "" }
            if next == .background { picker = nil; camera = nil; replySheet = false; evidenceSheet = false; model.background() }
            if next == .active && !captured { Task { await model.foreground(); PushManager.shared.resume(); await PushManager.shared.openPending() } }
        }
        .task { PushManager.shared.model = model; if !captured && phase == .active { await model.foreground(); PushManager.shared.resume(); await PushManager.shared.openPending() } else { model.background() } }
        .onChange(of: model.busy) { _, value in if !value { Task { await PushManager.shared.openPending() } } }
        .task(id: pollKey) {
            guard !pollKey.isEmpty else { return }
            while !Task.isCancelled { do { try await Task.sleep(nanoseconds: 8_000_000_000) } catch { return }; guard !Task.isCancelled else { return }; await model.poll() }
        }
        .onChange(of: model.token) { _, value in if value.isEmpty { email = ""; password = ""; link = ""; employee = ""; picker = nil; camera = nil; replySheet = false; evidenceSheet = false } }
        .sheet(item: Binding(get: { picker.map(PickerItem.init) }, set: { picker = $0?.id })) { item in
            if let lease = model.mediaLease { MediaPicker(video: item.id == "video", lease: lease) { media, error in guard model.mediaLease === lease else { return }; picker = nil; model.finishImport(lease, media: media, error: error) }.ignoresSafeArea().interactiveDismissDisabled() }
        }
        .fullScreenCover(item: Binding(get: { camera.map(PickerItem.init) }, set: { camera = $0?.id })) { item in
            if let lease = model.mediaLease { CaptureView(mode: item.id) { media, error in guard model.mediaLease === lease else { return }; camera = nil; model.finishImport(lease, media: media.map { [$0] } ?? [], error: error) }.tint(purple) }
        }
        .sheet(item: $model.preview) { item in PreviewView(media: item) { model.preview = nil } }
        .sheet(isPresented: $replySheet) {
            NavigationStack { List(ChatPolicy.replies, id: \.self) { reply in Button(reply) { guard model.active, model.generation == importEpoch, model.selected?.scope == importScope, !model.busy else { replySheet = false; return }; do { model.draft = try ChatPolicy.reply(reply, draft: model.draft, append: true) } catch { model.status = error.localizedDescription }; replySheet = false } }.navigationTitle("Έτοιμες απαντήσεις").toolbar { Button("Κλείσιμο") { replySheet = false } } }.presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $evidenceSheet) { NavigationStack { ScrollView { Text(model.evidence).font(.system(.footnote, design: .monospaced)).padding() }.navigationTitle("Στοιχεία πηγής").toolbar { Button("Κλείσιμο") { evidenceSheet = false } } } }
    }
    private struct PickerItem: Identifiable { let id: String; init(_ id: String) { self.id = id } }
    private var pollKey: String { model.active && model.screen == .conversation && !model.ai && !model.importing && picker == nil && camera == nil && !replySheet && !evidenceSheet && model.preview == nil ? (model.selected?.companyId ?? "") + ":" + (model.selected?.id ?? "") : "" }
    private var header: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(model.selected?.name ?? "MyWorkStation Chat").font(.title2.bold()).accessibilityIdentifier("title")
            Text(model.screen == .conversation ? (model.ai ? "Βοηθός AI · επιλεγμένο κατάστημα" : "Μηνύματα καταστήματος") : "Οι συνομιλίες σου, στο iPhone σου.").font(.subheadline)
        }.frame(maxWidth: .infinity, alignment: .leading).padding().background(purple).foregroundStyle(.white)
    }
    private func action(_ text: String, _ fn: @escaping () -> Void) -> some View { Button(action: fn) { Text(text).frame(maxWidth: .infinity).padding(.vertical, 12).frame(minHeight: 48) }.buttonStyle(.borderedProminent).disabled(model.busy) }
    private var login: some View {
        ScrollView { VStack(spacing: 18) {
            Text(model.challenge.isEmpty ? "Καλώς ήρθες" : "Επιβεβαίωση 2FA").font(.largeTitle.bold()).frame(maxWidth: .infinity, alignment: .leading)
            if model.challenge.isEmpty { TextField("Email", text: $email).textContentType(.username).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled().textFieldStyle(.roundedBorder).accessibilityIdentifier("email") }
            SecureField(model.challenge.isEmpty ? "Κωδικός" : "Κωδικός 2FA", text: $password).textContentType(model.challenge.isEmpty ? .password : .oneTimeCode).textFieldStyle(.roundedBorder).accessibilityIdentifier("password")
            action("Σύνδεση") { let value = password; password = ""; Task { await model.login(email: email, password: value) } }.accessibilityIdentifier("login")
            Button("Σύνδεση εργαζομένου με PIN") { password = ""; model.clearContent(); model.clearChallenge(); model.screen = .operatorLink }
            if !model.challenge.isEmpty { Button("Άλλος λογαριασμός") { password = ""; model.clearChallenge() } }
            Text("Δεν κρατάμε τοπικό ιστορικό συνομιλιών. Η σύνδεση και προσωρινά η επιβεβαίωση2FA φυλάσσονται στο Keychain αυτής της συσκευής. Το iOS, το πληκτρολόγιο και οι πάροχοι φωτογραφιών μπορεί να κρατούν δικά τους τεχνικά στοιχεία.").font(.footnote).foregroundStyle(.secondary)
        }.padding(22) }
    }
    private var operatorLink: some View { VStack(spacing: 18) { TextField("Ακριβής σύνδεσμος Chat καταστήματος", text: $link).textInputAutocapitalization(.never).autocorrectionDisabled().textFieldStyle(.roundedBorder); action("Εύρεση καταστήματος") { Task { await model.directory(link: link); employee = model.operators.first?.0 ?? "" } }; Button("Πίσω") { model.screen = .login }; Spacer() }.padding() }
    private var operatorPin: some View { VStack(spacing: 18) { Picker("Εργαζόμενος", selection: $employee) { ForEach(model.operators, id: \.0) { row in Text(row.1).tag(row.0) } }; SecureField("PIN", text: $password).keyboardType(.numberPad).textFieldStyle(.roundedBorder); action("Άνοιγμα Chat") { let pin = password; password = ""; Task { await model.operatorLogin(employee: employee, pin: pin) } }; Button("Πίσω") { model.screen = .operatorLink }; Spacer() }.padding() }
    private var storeList: some View {
        ScrollView { VStack(spacing: 14) {
            HStack { Button("Ανανέωση") { Task { await model.loadStores() } }; Spacer(); Button("Αποσύνδεση") { Task { await model.logout() } }.accessibilityIdentifier("logout") }.disabled(model.busy)
            action("Ενεργοποίηση ειδοποιήσεων") { Task { await PushManager.shared.activate() } }
            Text("Οι ειδοποιήσεις δείχνουν μόνο ότι υπάρχει νέο μήνυμα. Χρειάζεται ρύθμιση Apple/APNs και Firebase iOS.").font(.footnote).foregroundStyle(.secondary)
            ForEach(model.stores) { store in Button { Task { await model.choose(store) } } label: { HStack { Image(systemName: "bubble.left.and.bubble.right.fill").font(.title2); VStack(alignment: .leading) { Text(store.name).font(.headline); Text(store.companyName).font(.subheadline) }; Spacer(); if store.unread > 0 { Text("\(store.unread)").padding(8).background(purple.opacity(0.12)).clipShape(Circle()) }; Image(systemName: "chevron.right") }.padding(18).frame(maxWidth: .infinity, alignment: .leading).background(.white).clipShape(RoundedRectangle(cornerRadius: 20)) }.buttonStyle(.plain).disabled(model.busy).accessibilityIdentifier("store-" + store.id) }
        }.padding() }
    }
    private var conversation: some View {
        VStack(spacing: 0) {
            HStack { Button("‹ Συνομιλίες") { Task { await model.back() } }; Spacer(); if model.canAI { Button(model.ai ? "Μηνύματα" : "Βοηθός AI") { Task { await model.toggleAI() } } }; Button { Task { await model.reload() } } label: { Image(systemName: "arrow.clockwise") }.accessibilityLabel("Ανανέωση").disabled(model.importing) }.padding(12).disabled(model.busy)
            ScrollViewReader { proxy in ScrollView { LazyVStack(alignment: .leading, spacing: 12) {
                if model.ai { ForEach(Array(model.aiRows.enumerated()), id: \.offset) { _, row in bubble(row.0, own: row.1, meta: "", message: nil) }; if !model.evidence.isEmpty { Button("Προβολή αναγνωσμένων στοιχείων") { evidenceSheet = true } } }
                else { ForEach(model.messages) { m in bubble(m.body, own: m.senderId == model.identity["id"] as? String, meta: m.senderName + " · " + ChatPolicy.displayTime(m.createdAt), message: m) } }
                Color.clear.frame(height: 1).id("bottom")
            }.padding(12) }.onChange(of: model.messages.count) { _, _ in proxy.scrollTo("bottom", anchor: .bottom) } }
            if model.uncertainStore == model.selected?.id { Text(ChatError.uncertain.localizedDescription).font(.footnote).padding(8); Button("Απόρριψη παλιού προσχεδίου · νέα σύνταξη") { Task { await model.discardUncertain() } }.disabled(model.busy) }
            if model.importing { HStack { ProgressView(); Text("Προετοιμασία συνημμένου…").font(.footnote) }.padding(8) }
            if !model.media.isEmpty { ScrollView(.horizontal) { HStack { ForEach(model.media) { item in HStack { Button(item.name) { model.preview = item }; Button { model.media.removeAll { $0.id == item.id } } label: { Image(systemName: "xmark.circle.fill") }.accessibilityLabel("Αφαίρεση " + item.name) }.padding(10).background(.white).clipShape(Capsule()) } } }.padding(.horizontal).disabled(model.busy) }
            if !model.ai {
                HStack(spacing: 8) {
                    tool("Έτοιμες", icon: "text.bubble") { stamp(); replySheet = true }
                    tool("Φωνητικό", icon: "mic") { openCapture("voice") }.disabled(!model.voiceAvailable || !model.media.isEmpty)
                    Menu { Button("Λήψη από κάμερα") { openCapture("video") }; Button("Επιλογή από συλλογή") { openPicker("video") } } label: { toolLabel("Βίντεο", icon: "video") }.disabled(!model.videoAvailable || !model.media.isEmpty)
                }.padding(8).disabled(model.busy || model.importing || model.uncertainStore == model.selected?.id)
            }
            HStack(spacing: 8) {
                if !model.ai { Menu { Button("Λήψη φωτογραφίας") { openCapture("photo") }; Button("Επιλογή φωτογραφιών") { openPicker("photos") } } label: { Image(systemName: "plus").frame(width: 48, height: 48).background(purple.opacity(0.12)).clipShape(Circle()) }.disabled(!model.photosEnabled || model.busy || model.importing || model.media.contains { !$0.mime.hasPrefix("image/") }) }
                ZStack(alignment: .leading) { if model.draft.isEmpty { Text(model.ai ? "Ρώτησε τον βοηθό…" : "Γράψε μήνυμα…").foregroundStyle(.secondary).padding(.horizontal, 14).allowsHitTesting(false) }; PrivateComposer(text: $model.draft, placeholder: model.ai ? "Ρώτησε τον βοηθό…" : "Γράψε μήνυμα…", maximum: model.ai ? 600 : 5000) }.background(.white).clipShape(RoundedRectangle(cornerRadius: 24))
                Button { Task { await model.send() } } label: { Image(systemName: "paperplane.fill").frame(width: 48, height: 48).background(purple).foregroundStyle(.white).clipShape(Circle()) }.accessibilityLabel("Αποστολή μηνύματος").accessibilityIdentifier("send").disabled(model.importing)
            }.padding(10).disabled(model.busy || (model.ai && !model.aiReady) || model.uncertainStore == model.selected?.id)
        }
    }
    private func stamp() { importEpoch = model.generation; importScope = model.selected?.scope }
    private func openPicker(_ kind: String) { guard model.beginImport() != nil else { return }; picker = kind }
    private func openCapture(_ kind: String) { guard model.beginImport() != nil else { return }; camera = kind }
    private func tool(_ text: String, icon: String, action: @escaping () -> Void) -> some View { Button(action: action) { toolLabel(text, icon: icon) } }
    private func toolLabel(_ text: String, icon: String) -> some View { Label(text, systemImage: icon).labelStyle(.titleOnly).font(.subheadline).lineLimit(2).fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, minHeight: 48).padding(.horizontal, 4).background(purple.opacity(0.10)).clipShape(RoundedRectangle(cornerRadius: 20)) }
    private func bubble(_ body: String, own: Bool, meta: String, message: Message?) -> some View {
        HStack { if own { Spacer(minLength: 30) }; VStack(alignment: .leading, spacing: 8) { if !body.isEmpty { Text(body).font(.body) }; if let message { if message.attachment { Button(message.mime == "video/mp4" ? "▶ Βίντεο" : message.mime == "audio/wav" ? "▶ Φωνητικό" : "Φωτογραφία · προβολή") { Task { await model.attachment(message) } }.frame(minHeight: 44).disabled(model.busy) }; if !message.read { Button("Σημείωση ως διαβασμένο") { Task { await model.markRead(message) } }.font(.footnote).disabled(model.busy) } }; if !meta.isEmpty { Text(meta).font(.caption).foregroundStyle(.secondary) } }.padding(14).background(own ? purple.opacity(0.13) : .white).clipShape(RoundedRectangle(cornerRadius: 20)); if !own { Spacer(minLength: 30) } }
    }
}
struct PreviewView: View {
    let media: DraftMedia
    let close: () -> Void
    @StateObject private var playback = Playback()
    var body: some View { NavigationStack { VStack(spacing: 20) { if media.mime.hasPrefix("image/"), let image = UIImage(data: media.bytes) { Image(uiImage: image).resizable().scaledToFit() }; if media.mime == "video/mp4", let player = playback.player { VideoPlayer(player: player) }; if media.mime == "audio/wav" { Image(systemName: "waveform").font(.system(size: 64)) }; if !media.mime.hasPrefix("image/") { Button("▶ Αναπαραγωγή από την αρχή") { playback.play() }.buttonStyle(.borderedProminent); Button("Διακοπή") { playback.pause() } }; Text("Προσωρινή προβολή · χωρίς εξαγωγή").font(.footnote) }.padding().navigationTitle(media.name).toolbar { Button("Κλείσιμο", action: close) } }.onAppear { playback.prepare(media) }.onDisappear { playback.stop() }.onReceive(NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)) { _ in playback.stop(); close() } }
}
