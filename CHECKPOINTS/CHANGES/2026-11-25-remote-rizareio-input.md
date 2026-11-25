# 25/11/2026 — REMOTE-RIZAREIO-INPUT-4248 / OWNER-DIRECTED CONTINUATION / BEFORE SOURCE

- Owner request: «ξεκίνα» after observed Remote Agent V2.0.2 Rizareiou live image OK but mouse/typing not working, terminated after ~5m58s.
- Existing retained owner of POS-ATTENDED-REMOTE-02 remains `feat/pos-attended-remote-20261103`; this branch is bounded continuation for #4248, not a reassignment of all remote features. Branch `fix/remote-rizareio-frame-freshness-20261125`, base main.
- Read-only prod AuthAudit: INVITED 19:42:34Z, POS_CONSENT 19:42:40Z, CONNECTED 19:42:40Z, STOP_DEVICE_STOP 19:48:38Z; no proof of manual STOP or fixed expiry. Attended `ttl:null`; short 15s heartbeat dead-connection safety must remain.
- Identified candidate source defect: Controller uses browser `Date.now()` against server `frame.at` to gate input `<5000ms`; cross-host clock skew can silently block commands. Need local frame-receipt freshness, bound to sequence changes; do not refresh stale frame just because SSE repeats unchanged frame. No retry of uncertain input.
- Related candidate: Windows RemoteCommandChannel exception cancels session -> DEVICE_STOP during finally; reason indistinguishable in audit. Needs separate scoped diagnostic/telemetry and tests; do not weaken stop / heartbeat.
- Scope: client Controller + narrow pure helper/tests for cross-clock skew, stale same-sequence, fresh update, fail closed. No production config, agent installation or live session, payments, FTEXT or fiscal changes.
- BEFORE-SOURCE status: no source edit yet; all PR/CI/Windows/physical acceptance NOT TESTED. Required full exact-head CI and owner-only Notepad physical test before production activation. Active work entry only, preserve other assignments.
