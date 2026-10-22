# MyWorkStation Chat iOS - native preparation

Owner `feat/ios-chat-native-20261022`; claim3020/49c27e87 merged BEFORE source. Same repository and existing production APIs as Android. This is a native SwiftUI/UIKit/AVFoundation client, not a WebView. Initial version0.1.0/build1, bundle `gr.myworkstation.chat.ios.preview`, iOS17+. Source/build/simulator evidence is not physical iPhone acceptance or an installable release.

## Build and automated acceptance

Use a Mac with Xcode26.2+ (Swift6.2.3+) for the pinned Firebase Messaging13.1.0 package, and XcodeGen from Homebrew. Only Messaging is linked; no Analytics/Auth/Firestore/Storage products are used.

```sh
swift test --package-path ios
cd ios
xcodegen generate
xcodebuild test -project MWChat.xcodeproj -scheme MWChat -destination 'platform=iOS Simulator,name=<available iPhone>' CODE_SIGNING_ALLOWED=NO
```

The GitHub `iOS Chat Preview` workflow resolves the pinned package, chooses an actual available iPhone simulator, executes core HTTP/policy tests, real native lifecycle/quick-reply UI tests and actual AVAssetWriter H264 memory encoding/remux/playback. It cross-checks the produced synthetic MP4 with the unchanged server validator and builds an unsigned Release device archive. Generated project/Info.plist, dependency/build directories and credentials are not committed. UI fixtures exist only in Debug, perform no production requests and must not appear in the Release binary. Tests write only synthetic media/screenshot proof in disposable CI; application media capture never writes a file.

The artifact explicitly says unsigned archive, not IPA/TestFlight. Never rename a simulator app/archive into an IPA or offer it as an install link. The stable Android app/download/QR/key remain untouched. No real chat/AI/push/business request is part of these synthetic tests.

## Privacy and media contract

- Chat history, drafts, photos, voice/video and playback remain in RAM. Ephemeral URLSession disables URLCache, cookies, credential storage and redirects. Every response is bounded, and failed POSTs have no automatic retry. Unknown send outcomes block another send until history review/discard.
- The connection token, bounded5minute2FA challenge and explicit push opt-in use non-synchronizing Keychain `WhenUnlockedThisDeviceOnly`; no password/OTP is saved. Keychain/OS/SDK behavior is not a zero-storage guarantee. Push Firebase technical installation identifiers may persist independently of content.
- Background/logout/store/tab transitions clear private state, cancel requests and reject late scoped results. The whole UIWindow is covered before app-switch snapshots, including sheets/camera. Active screen capture/mirroring hides content. Ordinary screenshots cannot be universally disabled through a supported iOS public API; no secure-text/private-view hack is used.
- Camera photos use AVCapturePhoto memory data and metadata-stripping JPEG conversion. Photos/video selected through the system picker are bounded transient provider reads; provider-owned originals/temporary representations are outside app storage control. The app does not write or export a new local media file or delete a provider original.
- Voice is PCM16/16kHz/mono WAV, max60seconds/1920044bytes, AVAudioEngine/Converter in RAM with explicit preview/use/send.
- Video is H264/AAC MP4, max30seconds/12MiB. Native camera uses AVAssetWriter segment delegate memory output, then a bounded in-memory remux to the EXISTING nonfragmented server/Android contract. File-backed writer/export and server parser relaxation are forbidden. Gallery accepts compatible MP4 only, not silent MOV/HEVC transcoding. Server still revalidates actual codecs/sample tables/duration/bytes.
- Only authorized selected-store messages and existing Owner/SuperAdmin AI with selected-store evidence are routed; operator/PIN users never gain POS or administrative AI permissions. Read acknowledgement and sending require explicit user action.

## Apple signing and TestFlight prerequisites

Owner confirmed22Oct2026 that there is no Apple Developer membership. Preparation proceeds without creating an account, accepting Apple agreements, billing, signing-key generation or reading a private credential. Required before actual iPhone delivery:

1. Owner-controlled Apple Developer membership and App Store Connect app with the exact bundleID. The owner handles Apple agreements/payment/account verification outside this repository.
2. Register the matching iOS app in the EXISTING Firebase project `myworkstation-chat`. Obtain `GoogleService-Info.plist` and place it under `ios/Resources/` only in the owner-controlled signing build. It is gitignored. BundleID/projectID must match; no Android signing/Firebase credential is rotated.
3. Enable Push Notifications for the App ID and configure the owner-controlled APNs authentication key in Firebase. Never paste `.p8`, `.p12`, provisioning profiles, passwords or API credentials into chat/repository. No Analytics is required. The app configures Messaging only after explicit opt-in AND an enabled server iOS status.
4. Use the prepared project with the owner's Team/provisioning to produce a signed device archive. The unsigned CI archive cannot install. In Xcode Organizer validate and upload to App Store Connect/TestFlight with the correct distribution profile/APNs environment. This is a separate owner-controlled step; CI does not upload or accept agreements automatically.
5. Only after Apple/Firebase setup is verified, enable the separate server `NATIVE_CHAT_IOS_ENABLED=true` through its existing authorized deployment process. It defaults OFF; existing Android FCM behavior stays unchanged. Default/no-platform legacy rows remain Android. iOS rows still require current-session/store authorization before every send.
6. Verify the actual processed build in TestFlight, then distribute its real tester link/QR. Perform the final consolidated iPhone batch once: account/2FA and PIN, selected store/AI rights, text/read/quick reply, photo camera/gallery, WAV/MP4 capture/gallery/playback, background/locked push/tap/logout/account change and scoped privacy behavior. No accepted Android transaction/message replay.

APNs OS alerts contain only a generic new-message notice and a sanitized bounded server store label, no sender/body/photo/voice/video/question. Binding/store/company data is technical routing. Foreground/tap validate current binding and fetch currently authorized stores; logout clears delivered notifications and deletes opt-in/requests SDK token deletion. In-flight OS/APNs behavior still needs physical acceptance; don't promise unconditional delivery or that delayed OS alerts can never appear after logout.

Official references used during preparation: Apple `AVAssetWriter.init(contentType:)`/`AVAssetWriterDelegate`, `UIScreen.isCaptured` and capture notifications, Apple TestFlight/distribution documentation; Firebase Apple Messaging setup/Swift Package Manager docs. No new physical USER PASS is implied by these instructions.
