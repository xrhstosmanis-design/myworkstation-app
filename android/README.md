## Native multi-photo implementation — 19/10/2026, AWAITING CI/DEVICE

Existing gallery selection accepts up to five JPG/PNG/WEBP files, at most7MiB each and14MiB combined, kept in a bounded in-memory queue. Tap the selection label to preview/remove before Send. Images are sequential separate messages through the existing API; caption goes on the first confirmed message only. This is not an atomic album. A missing ok/id receipt or network error stops all further sends without retry; review server history and discard the old draft before composing again. Background/logout/store/tab change clears selected bytes and cancels remaining requests. Only transient content-URI reads; no persisted URI grant, image cache or gallery write. Existing gallery originals remain outside the app's ownership. Replies and voice messages are not implemented in this slice. Source tests do not constitute physical device acceptance or a new distributed APK.

# MyWorkStation Chat Android — development preview

Native Java/Android views in the existing repository, issue #2673. Claim #2677 merged before source work. This is not a WebView or the existing PWA.

## Build

JDK 17, Android SDK platform/build-tools 35, Gradle 8.9:

```sh
gradle -p android :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
```

The debug application ID is `gr.myworkstation.chat.preview`. A production signing key is deliberately not included. Do not distribute an unsigned release or assume that a debug APK is a production release.

## Implemented source, awaiting verification

- Existing account login and 2FA challenge; initial 2FA setup and temporary-password changes remain in normal Backoffice.
- Employee store-link/directory/PIN login using the existing Chat-only session; no POS session, shift or permission grant.
- Authorized store list, Owner company selection and selected-store messages, explicit read acknowledgement, in-memory photo upload/preview.
- Separate selected-store AI conversation through existing Owner/Super Admin status/ask APIs. Staff is denied rather than gaining administrative AI rights. No OpenAI key in the client.
- Native camera JPEG capture through Camera2 memory buffers and transient existing-photo selection. No MediaStore/gallery write, download, file export, image cache, message database or persisted history.
- AndroidKeyStore AES-GCM connection token only in no-backup internal storage. Cloud/device backup excluded, secure windows, no saved private view state, private draft copying/sharing disabled and no personalized keyboard learning requested.
- Late results discarded at session/store/navigation/background boundaries; no automatic POST retry. Active-screen refresh only, not background notification delivery.

## Still required

Native background/locked-screen push is **not configured**. Existing Web Push subscriptions cannot be reused as native FCM registration. This requires an independently scoped backend registration/delivery integration, provider project configuration, revocation/account-switch tests and physical delivery/tap acceptance. No fake notification switch or successful-delivery claim.

Physical Android phone/tablet acceptance, camera orientation/preview/permission denial, keyboard/rotation, source-report presentation parity and complete forensic storage review remain NOT TESTED. Android and third-party keyboards/photo providers can have their own storage; the app does not promise zero operating-system traces or prevent photography by another device. Do not use this preview as proof that the privacy requirement has passed device acceptance.

No changes to existing web/POS/backend authorization, fiscal flows, licensing, provider settings or production data are part of this client.

## Firebase preparation — 18 October 2026

Debug configuration now maps to the owner-created `myworkstation-chat` project and
`gr.myworkstation.chat.preview`. Firebase Messaging only is included, with no
Analytics, Auth, Firestore or Storage SDK. FirebaseInitProvider is removed and
auto-init/data collection disabled: no token registration or messaging runtime
activation is performed yet. Backend claim #2693 must merge before its source.
Release Firebase configuration is intentionally absent; register the separate
release package and supply its correct configuration before a release build.

When push is enabled later, Firebase persists technical installation/push
identifiers; these are separate from private chat content. Do not retain the
previous “encrypted connection token only” statement as a complete SDK storage
guarantee after activation. Physical storage and logout/account-switch acceptance
remain required. No private service-account key belongs in this repository or APK.

Clean debug build, 9 unit tests and lint passed with Firebase BoM 35.0.2 and Google
services plugin 4.5.0. A clean build was necessary after changing the generated R
class/dependency graph; the initial incremental duplicate-R failure is not a PASS.
No notification delivery, device acceptance, backend change or production rollout
is asserted by this preparation.


## Native push implementation preview

Explicit activation now checks configured backend and current session, then initializes Messaging and registers. Android notification permission denial leaves chat usable. Opted resume/token refresh rebinds the token. Generic data-only notifications must match the current session digest; staff also requires exact company/store. Tap fetches current authorized stores before opening and uses existing Owner company selection. Logout clears notifications/opt-in and requests SDK token deletion; server logout revokes delivery. Firebase technical installation identifiers and opt-in may persist; private content remains memory-only. Backend draft PR2695 after merged claim2693, default disabled. 12 native unit tests, APK build and lint passed locally; exact remote CI pending. Physical receipt/tap/logout/storage and Google Play services/token-deletion races remain NOT TESTED. Earlier preparation-only text is historical. No production/device PASS or iOS implementation.
