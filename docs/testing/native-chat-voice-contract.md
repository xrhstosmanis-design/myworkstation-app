# Chat voice — implemented candidate contract, AWAITING CI/RELEASE/DEVICE

Owner of native integration: feat/android-chat-native-20261017. Independent NEW voice-only server/receiver scope claimed in green mergedPR2876 before source;
existing PWA packaging/responsive/photo6432 and N16 physical acceptance owners remain unchanged.
Issue2869 records this dependency. This is implemented candidate source, not a verified shipped API or USER PASS.
Owner instruction19Oct21:02 Athens: prepare Android together, final physical tests afterward,
iOS LAST. Do not repeat gallery/camera messages accepted20:02/20:47 for documentation.

## Proposed bounded first version

- Explicit microphone action, record/stop/cancel/preview, then ordinary explicit Send.
  No recording on screen entry, no automatic send, transcription, invoice/AI job or background recording.
- One voice attachment per message; proposed audio/wav with canonical44-byte PCM header,
  signed16-bit mono samples,16000Hz, duration at most60seconds, data at most1920000bytes,
  whole attachment at most1920044bytes. Server validates RIFF/WAVE/fmt/data layout,
  declared sizes, PCM encoding/channels/rate/blockAlign/byteRate/sample alignment and actual bytes.
  Merely trusting MIME/extension/base64 or accepting arbitrary RIFF is insufficient.
- Existing image/PDF parser and accepted photo flow remain unchanged. Separate
  POST /api/store-chat/stores/:storeId/voice-messages accepts one GENERAL voice message,
  optional editable text at most5000 characters and one bounded audio attachment. Endpoint follows claimPR2876 and is wired in candidate source; it is unavailable until ordinary guarded release.
- Server uses existing company/store/session/module authorization before any insert; no fallback
  to company-wide scope, no cross-store lookup, no new operator role or permission expansion.
  Availability must be explicit for the current authorized store and off until supported/configured;
  native must not display a working microphone button against an unsupported server.
- A successful response requires ok:true and a durable message id; unknown/network/5xx outcome
  stops and requires history review, never automatic POST retry. Never append an invented idempotency key
  without a real server contract. No voice/photo simultaneous queue without explicit user choice.
- Existing scoped attachment GET can serve audio inline with existing no-store headers and
  download permission checks preserved. Voice is GENERAL and must not enter invoice AI Reader.
  List responses include correct attachment MIME/size/name; receiver UI needs actual audio playback,
  not the current image-only preview. Do not silently claim Admin/PWA playback before its owner implements it.
- Generic private notifications remain unchanged; no audio bytes, spoken text or private caption in push/logs.

## Native RAM ownership and lifecycle

Use AudioRecord into bounded PCM buffers, not a MediaRecorder file path. Microphone permission is
requested only on the explicit action in a matching foreground store/session. Permission denial leaves
text/photo chat usable. Native preview/playback should use an in-memory MediaDataSource, no file,
MediaStore, download, share, clipboard, disk cache or persistent URI permission.

Recorder/worker/player resources and every owned byte/short array are stopped, released and wiped
on cancel/background/logout/store change/activity destruction. Epoch/token/store binding fences late
recording/network/playback callbacks. Android saved state and Intent/Bundle must never contain audio.
Keep the existing Main onStop content-clearing boundary; do not bypass it to retain a voice draft.
A successful explicit send consumes/wipes only that voice draft and preserves any newly typed next draft.

Do not promise zero OS/keyboard/SDK traces or prevention of external recording; forensics remains a
separately measured device test. Preserve gallery originals outside this app's ownership.

## Required technical verification before the single final device batch

- Pure container parser cases: exact boundary/empty/too-long/odd PCM, forged RIFF/fmt/data sizes,
  wrong encoding/channel/rate/alignment, malformed/truncated/base64 mismatch and overflow rejection.
- Mounted isolated server HTTP/DB fixtures: authorized insert/receipt and unchanged controls;
  tenant/store/session/role/module refusal and no insert/push on rejected payloads; inline/download
  authorization/no-store, no invoice processing. No production message/photo/voice/business writes by agent.
- Real Activity fixtures: explicit-only recording/send controls, permission denial, background/cancel/
  stale-session/late-chunk wiping, bounded recording, no overlap with photo queue, unknown-outcome stop,
  no automatic replay and preservation of the next typed draft.
- Actual receiver audio component tests under existing UI owner. No broken image element for audio.
- Exact full PR/main and Android CI, verified candidate hash/certificate and ordinary guarded server
  release/health before asking for one final physical voice send/playback/denial scenario.

Until exact CI/release/artifact/device checks pass: voice is an UNVERIFIED CANDIDATE.
New microphone permission is requested only by explicit start; older servers do not advertise support. Final readiness is tracked in native-chat-final-batch.md, never inferred from this proposal.
