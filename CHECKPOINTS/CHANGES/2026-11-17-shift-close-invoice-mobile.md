## 17/11/2026 — SHIFT-CLOSE-INVOICE-MOBILE-01 — TECHNICALLY LIVE / AWAITING COMMON LAB

Owner approved source merge and publication on 17/11/2026. PR #4011 exact head `0c4f97cc7ea83cc6d1a4d15d3e173351d60c67fa` passed full Node20 CI `44169632000` (all five jobs SUCCESS). Expected-head squash merged `1af6d3173a462cf1f610307db14af5202a5cbf04`. Main retains the unrelated #4010 table-service documentation; runtime source matches the reviewed candidate. Full combined-main CI `44172996676` also passed all five jobs. No required check was bypassed or manually replaced.

Ordinary guarded deploy workflow `44174787012` SUCCESS triggered the existing Render service `srv-d9isenfavr4c73bdh52g` in confirmed workspace `tea-d9ie26vaqgkc739uudqg`. Deploy `dep-dbubvtl6e07s73f5m69g`, trigger deploy_hook, became LIVE exact `1af6d3173a462cf1f610307db14af5202a5cbf04` at 17Nov2026 21:00:08.487877 UTC / 23:00:08 Athens. Previous healthy revision `e4210cf93987596cb0ec59cb4daefd1f399fc386` was independently observed before release. No manual redeploy, service/plan/configuration change, rollback, credential change or financial action.

Independent no-cache GET /api/health at 21:00:43.905797 UTC and 21:02:59.144401 UTC returned HTTP200 / ok=true / exact new revision. The public application HTML also responded and references `/assets/main-g2A23gbV.js`. This proves technical installation, not authenticated invoice/POS/device acceptance.

Post-live observation: the new instance emitted connection-pool/transaction timeouts during its first minute, including cash-control/auth/FTEXT and the existing invoice worker. These were real observations, not ignored successes. An initial follow-up log query from 21:01:30 UTC returned zero error-level entries. A later query showed only the separately retained TABLE_SERVICE/Online module-denial messages already present before rollout; no new database timeout was observed in that follow-up window. HTTP 21:02 bucket had 8x500, 11x503, 13x499; the 21:03 bucket had 0x500, 1x503 and 0x499, with 220x200 (partial/latest measurement); 1x503 per minute also existed before rollout. CPU/memory showed no process resource exhaustion. Recovery was observed, but the cause is NOT DIAGNOSED and a long-term performance claim is not made. No pool-size/timeout/role/module settings or business records were changed for diagnosis.

Scope installed: QR mobile photo transfer and camera capture on both missing-invoice acquisition paths; safe selected-store/payment/fingerprint fencing and exact retry; NFD normalization of stored invoice numbers in existing payment lookup, preserving all supplier/company/store/type/reversal/full-number/amount guards and the 0.05 EUR tolerance.

Remaining acceptance belongs in the owner's final shared session on the existing LAB: physical phone QR multi-page transfer, camera photo, connection to one existing unpaid-document obligation/original payment, refreshed pending close state, and retained no-double-payment behavior. No actual supplier invoice/payment/shift-close replay, new stock/fiscal operation or new LAB/USER/PASS manual claim occurred. Source implementation and technical release are complete; functional acceptance remains NOT TESTED. Keep original invoices/payments; do not repay the real invoice to test recovery.

Evidence: PR https://github.com/xrhstosmanis-design/myworkstation-app/pull/4011 · main CI https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/44172996676 · guarded release https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/44174787012 · Render https://dashboard.render.com/web/srv-d9isenfavr4c73bdh52g/deploys/dep-dbubvtl6e07s73f5m69g .

## 17/11/2026 — SHIFT-CLOSE-INVOICE-MOBILE-01 — source candidate / AWAITING CI AND LAB

Approved assignment #4008 merged `0a1e6f4`; causal amendment #4009 merged `be6c767` before their source edits. Source candidate is based on `be6c767`. Owner remains /root. No deployment or live financial operation performed.

Implemented shared QR mobile-photo reception, camera capture and page management in both the plain pending-invoice panel and the upper FAST_PAYMENT_WITHOUT_DRAFT close recovery form. Each acquisition is fenced to store, API, selected original payment and fingerprint; cancellation, replacement and unmount reject late uploads/streams. Preserve one PDF or up to five photos and existing 6.5 MB total limits. Submission is explicit, serialized and reuses prepared original bytes after an uncertain response. Confirmed handoff refreshes close pending state; plain capture remains without AI, existing fast recovery retains its guarded AI/draft semantics.

Root cause reproduced in isolated PostgreSQL: JavaScript invoiceToken deaccented Greek, but the SQL lookup discarded the accented letter itself. Synthetic number `ΆνευΧ-12345` could not find its own payment. SQL now applies NFD normalization before uppercase/filtering, matching JavaScript. The before regression had 6 failures; the corrected native Unicode suite and retained pending-invoice fixture all pass. Company/supplier/store/type/reversal/full-number/amount guards and the existing 0.05 EUR tolerance remain unchanged. No production repair, re-payment, historical replay, stock/fiscal action or shift-close bypass.

Local validation (Node 24.22.1):
- 67/67 protected tests PASS, 0 failed, 0 skipped: invoice-payment-reuse-v1, pos-fast-handoff-recovery-v1, pos-pending-invoices, pos-pending-invoices-ui and new pos-pending-invoices-mobile-ui.
- 33/33 isolated native PostgreSQL 18.6 tests PASS, 0 failed, 0 skipped: new invoice-payment-unicode-postgres plus retained pos-pending-invoices-postgres.
- Initial retained native fixture ran with the embedded server's Europe/Athens timezone and had three dependent assertion failures. The unchanged fixture passed when the isolated server was configured to UTC, matching its expected test environment. No assertion, timeout or skip was relaxed.
- `npm run build` PASS, Vite 10.64s; TABLE_SERVICE bundle verification PASS. `git diff --check` PASS.

Hosted LAB and physical mobile/camera acceptance remain NOT TESTED, to join the user's final common test session. Source merge/deployment requires the owner's approval; only documentation claims have been approved for merge so far. Next: full exact-head Node20 CI, review the source PR, then approved installation and the final shared LAB session. Do not ask the user to repeat the real supplier payment.

## 17/11/2026 — SHIFT-CLOSE-INVOICE-MOBILE-01 — causal amendment before source

User screenshot reports paid invoice recovery rejected by fast-handoff despite the pending close row. The upper FAST_PAYMENT_WITHOUT_DRAFT recovery form is distinct from the plain pending panel. Read-only source diagnosis: invoiceToken removes NFD combining marks, while findInvoicePayment SQL currently uppercases then drops non-range characters, losing precomposed accented Greek letters. Synthetic reproduction target: ΆνευΧ-12345. This is a suspected cause pending native PostgreSQL proof, not a repair of live data.

Same /root owner and branch; extend the bounded source scope to `client/src/components/store/StoreShiftClosePanel.jsx` (FastPaymentDraft acquisition and stale response guards only), `server/src/lib/invoice-payment-reuse.js` (lookup normalization only), new `server/test/invoice-payment-unicode-postgres.test.js`, and existing `server/test/invoice-payment-reuse-v1.test.js` (normalization regression only). Retain originally claimed pending panel and new mobile UI test. Reuse the same acquisition UI in both close attachment paths, without changing close/PIN guards, payment identity, supplier/store/type/reversal/amount checks, AI route semantics or financial state. Existing invoice/payment and shift owners retain all other scope.

Required before completion: native accented/decomposed Greek lookup matching and rejection boundaries, protected payment reuse/handoff/pending tests, mounted QR/camera scenarios on both close paths, build and full CI. One original payment, no duplicate charge, no live financial repair, no historical replay, no close bypass. This amendment must merge before the newly added source paths are edited. Final functional LAB remains in the common session and NOT TESTED.

# QR and camera for missing invoices at shift closure

## 17/11/2026 22:08 EET — SHIFT-CLOSE-INVOICE-MOBILE-01 — proposed independent assignment /root

Branch `fix/shift-close-expense-mobile-20261117`, base `e4210cf`. User requests QR photo transfer from mobile and camera acquisition when attaching a missing invoice at shift closure, matching the existing POS payment flow. Status: CLAIM PREPARED; source and hosted LAB NOT TESTED. Claim must land on main before source edits under AGENTS.md. Existing invoice, cash, PIN, scanner, myDATA and role owners remain retained.

Bounded proposed source scope: `client/src/components/store/StorePendingInvoicePanel.jsx` and new `server/test/pos-pending-invoices-mobile-ui.test.js` only. Reuse existing `useMobileDocumentPhotos`, `MobileDocumentPhotosQr`, camera acquisition helpers and document photo bundling unchanged. Do not edit shared close/PIN, backend routes, payments, AI/OCR, mobile upload service or other assigned files. Bind each mobile/camera session to the selected store/payment/fingerprint; cancel on selection, store/API change, cancellation, unmount and submission. Preserve up to five pages, current attachment limits, plain capture, original payment identity, durable confirmation and safe exact retry. Automatic pending-list/close refresh only after confirmed attachment.

Acceptance preparation: mounted component checks for mobile multi-photo reception and upload against original pending payment, camera capture, stale async responses after store/payment switch, cancellation, limits, duplicate-submit suppression and failed-upload retry. Run existing pending UI/service regressions and client build. Hosted existing LAB acceptance belongs in the final shared session; no repeated payment or unmeasured shift close. No implementation, deployment, new functional PASS or financial action is claimed here.

Checkpoint: `CHECKPOINTS/CHANGES/2026-11-17-shift-close-invoice-mobile.md`.

Evidence: current pending attachment UI offers a file input only. StoreShiftClosePanel mounts StorePendingInvoicePanel and refreshes pending state through onChanged. The POS payment form StoreSupplierInvoiceFast already uses the mobile-photo and camera helpers above. Current gate blocks closure while pending count remains nonzero. Existing service plain-capture and original payment protections remain unchanged.

Read locally: AGENTS.md, COMMON_WORK_RULE.md, authoritative tracker/pending registry, active registry, deferred-invoice checkpoint of 26 October, shift invoice-draft guard checkpoint of 10 November, and POS PASS manual. Inspected main history for the affected panel. No current independent QR/camera claim for this missing-invoice attachment UI was found. This claim does not transfer any other owner scope.

Next action: approve and merge this documentation-only claim, then implement the bounded panel change and its mounted tests. No source edits before the claim is on main.

Local test log SHA256 (full bytes retained in the task workspace):
- `shift-unicode-before.log`: `015036d1d63b4d35e3a19bc40231a6a6ff65b74b2f515e1a72f0434e62bdd41b`
- `shift-unicode-after-utc.log`: `e2b434ab19a17ce8f6601f6446f33d95f5cdd70c3e0827c2e8815a2d26a70cf5`
- `shift-mobile-protected.log`: `f994fc649814e0d26c2187841eb09b840052c9adbe088d5bf112414f38dd13b9`
- `shift-mobile-build.log`: `65eac8d220552a42c6c0f53f34d2d3b5a116d43b24e2cd217733273c4497faec`
