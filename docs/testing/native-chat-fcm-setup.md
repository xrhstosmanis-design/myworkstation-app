# Native chat FCM — source preview, not device acceptance

Claim #2693 merged f991276 before backend source. Existing web/PWA/N16 owners and delivery remain separate. Android source PR #2687. iOS client/APNs registration are not implemented by this change.

## Server configuration after green CI and normal guarded release

Default is disabled. Do not enable in production as part of diagnostic tests.

- Render Secret File name `native-chat-fcm.json`; copy the service-account JSON directly from Firebase into Render, never into chat, git or the Android app.
- `NATIVE_CHAT_FCM_CREDENTIALS_FILE=/etc/secrets/native-chat-fcm.json`
- `NATIVE_CHAT_FCM_ENABLED=true` only at the agreed activation step; absent or any other value disables registration/delivery without reading credentials or creating the table.
- The service account must belong to `myworkstation-chat` and have FCM send permission. Provider validates project, key type and service-account domain; fixed Google OAuth and FCM endpoints, no redirects or automatic send retries. No Firebase database, Storage, Auth or paid AI service is configured here.

The new independent `StoreChatNativePush` table is initialized lazily only when enabled. No Work command has created it in production. Browser Web Push tables and VAPID keys are not changed. Registration upserts under a token hash advisory lock, replaces prior token ownership, and stores technical session/scope identity only. Current role, session/version/expiry/revocation, owner access, staff credential and active store/company/module are rechecked at send. Registrations older than 30 days are not used; Android refreshes on resume. At most 2000 current native mappings are scanned per message; larger installations need bounded indexed audience work before rollout. A delivery request accepted by FCM is not proof of handset receipt.

## Android preview

On the conversations list choose Enable notifications and grant Android notification permission. An active authenticated session and configured backend are required. Only then is Firebase explicitly initialized. No automatic SDK startup provider; Analytics/data collection off, Messaging only. A successful registration is displayed as registration, not proven delivery. Refresh/rotate/token refresh can rebind an existing technical token without resending chat messages.

Push contains only kind, session digest, company/store IDs. The app renders a fixed generic title/body, no message text, employee/store name or image. Unknown fields, foreign staff scope, expired/local missing session and stale session digest are rejected. Tap loads the current authorized store list and only then opens the exact company/store, using existing owner company selection when needed; no arbitrary URL is consumed. A single generic notification is replaced by the latest. Logout clears notifications/local binding and requests SDK token deletion; server logout revokes the existing session. Unreachable-server logout still clears local connection and received notifications, so old pushes cannot render private content. Technical provider mapping may remain until revoked/expired/retired; it is not a chat history store.

Firebase installation/push identifiers and an opt-in boolean can persist on device after activation. The encrypted app connection token is also persisted. Private messages/photos/AI results/drafts remain memory-only. Do not claim zero OS traces or only one persistent value after adding the SDK. Physical forensic review, SDK initialization/token deletion races, phone/tablet permission and notification delivery/tap acceptance remain NOT TESTED.

## Validation and activation gate

Local Node20 tests cover provider off/no network, data-only payload, bounded input, fixed OAuth audience/project, signed JWT, cached token, credential rejection, explicit UNREGISTERED handling, role/session/version/expiry/ownership/staff/module rejection and registry ownership/revocation SQL harness. Existing Apple/browser push regressions retained. The registry harness executes the actual module functions with injected database methods; it is not real PostgreSQL concurrency evidence. Full repository CI and isolated PostgreSQL/real HTTP routing acceptance remain required. Android build/unit/lint are separate from device acceptance.

No real message/read/notification/business transaction is authorized solely to fill a documentation gap. After exact guarded release and explicit device test setup, record device, operator, store, revision, recipient authorization and one generic test action. Verify background/locked delivery, tap, foreign-store denial, session expiry, PIN/role/module revocation, logout/account switch, permission denial and content-free notification history/storage. No manual PASS until actually observed.
