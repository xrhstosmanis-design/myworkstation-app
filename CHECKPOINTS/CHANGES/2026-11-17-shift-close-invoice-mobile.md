# QR and camera for missing invoices at shift closure

## 17/11/2026 22:08 EET — SHIFT-CLOSE-INVOICE-MOBILE-01 — proposed independent assignment /root

Branch `fix/shift-close-expense-mobile-20261117`, base `e4210cf`. User requests QR photo transfer from mobile and camera acquisition when attaching a missing invoice at shift closure, matching the existing POS payment flow. Status: CLAIM PREPARED; source and hosted LAB NOT TESTED. Claim must land on main before source edits under AGENTS.md. Existing invoice, cash, PIN, scanner, myDATA and role owners remain retained.

Bounded proposed source scope: `client/src/components/store/StorePendingInvoicePanel.jsx` and new `server/test/pos-pending-invoices-mobile-ui.test.js` only. Reuse existing `useMobileDocumentPhotos`, `MobileDocumentPhotosQr`, camera acquisition helpers and document photo bundling unchanged. Do not edit shared close/PIN, backend routes, payments, AI/OCR, mobile upload service or other assigned files. Bind each mobile/camera session to the selected store/payment/fingerprint; cancel on selection, store/API change, cancellation, unmount and submission. Preserve up to five pages, current attachment limits, plain capture, original payment identity, durable confirmation and safe exact retry. Automatic pending-list/close refresh only after confirmed attachment.

Acceptance preparation: mounted component checks for mobile multi-photo reception and upload against original pending payment, camera capture, stale async responses after store/payment switch, cancellation, limits, duplicate-submit suppression and failed-upload retry. Run existing pending UI/service regressions and client build. Hosted existing LAB acceptance belongs in the final shared session; no repeated payment or unmeasured shift close. No implementation, deployment, new functional PASS or financial action is claimed here.

Checkpoint: `CHECKPOINTS/CHANGES/2026-11-17-shift-close-invoice-mobile.md`.

Evidence: current pending attachment UI offers a file input only. StoreShiftClosePanel mounts StorePendingInvoicePanel and refreshes pending state through onChanged. The POS payment form StoreSupplierInvoiceFast already uses the mobile-photo and camera helpers above. Current gate blocks closure while pending count remains nonzero. Existing service plain-capture and original payment protections remain unchanged.

Read locally: AGENTS.md, COMMON_WORK_RULE.md, authoritative tracker/pending registry, active registry, deferred-invoice checkpoint of 26 October, shift invoice-draft guard checkpoint of 10 November, and POS PASS manual. Inspected main history for the affected panel. No current independent QR/camera claim for this missing-invoice attachment UI was found. This claim does not transfer any other owner scope.

Next action: approve and merge this documentation-only claim, then implement the bounded panel change and its mounted tests. No source edits before the claim is on main.
