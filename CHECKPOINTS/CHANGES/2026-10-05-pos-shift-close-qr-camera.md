# POS closing QR camera / autofill correction — 05/10/2026

Same assigned scope continuation fix/pos-shift-close-qr-camera-20261005. Owner has phone QR, no physical card; camera requested21:04 Athens. Prior PR1749/CI4402 exact LIVE aac666b8 checks opener card on server. Screenshot21:02 shows closing title/card field and apparent browser credentials autofill into handover/card fields. This is UI evidence only; physical close/card rejection/Workforce OUT remains NOT TESTED.

Add QR-only camera overlay using existing ZXing settings and focus preference. One decode fills closing card field and returns to counted form; it never closes or logs in automatically. Explicit close still submits to existing server verification; wrong QR leaves shift open. Camera stops on decode, cancellation, unmount and late startup completion. Permission error is visible and user can cancel/retry. Replace password input with masked text scanner field and non-login names/autocomplete hints so browser no longer sees a username/password pair. No stored credential, camera frame, auth, fiscal or financial mutation.

Preserve normal/shortage verification, recount, BackOffice privileged closure, tenant/terminal isolation and idempotency. Local React/DOM camera lifecycle and frontend build required; full CI then exact LIVE required. Physical camera/QR rejection/close acceptance AWAITING LAB. Required next test is camera preview/decode without closing, then refreshed full baseline before one identified close; other terminal remains control.

Local validation PASS: frontend build, camera lifecycle/permission/late cleanup, server tests 1838 PASS / 0 FAIL / 2 SKIP. CI and exact LIVE pending.
