# INVOICE-OWNER-FINALIZATION-01 (#28) — Owner cancellation UI — 2026-11-08

**Status: AWAITING CI / LAB NOT TESTED; #28 remains OPEN.**

## Scope
- Independent ChatGPT BackOffice interface for the scoped Claude server-side cancellation implementation in Draft PR #3743. **Do not merge this UI before the backend is reviewed and merged.**
- Only an OWNER, ADMIN, MANAGER or SUPER_ADMIN opening the BackOffice for a posted FINAL/INVOICED purchase can see the new "Ακύρωση τιμολογίου" button. POS/store-operator context is excluded. Server authorization is still mandatory.
- Opens a read-only preview using the existing `reopen-preview` endpoint: original lineAudit, inverse inventory changes, any negative stock result, expense effect and retained payments/photos. The form requires a nonempty reason (min 5 chars), a specific cancellation acknowledgment, and a separate negative-stock confirmation when applicable.
- Submits **once** to `POST /api/purchase-orders/:orderId/cancel`, with the preview version to reject stale stock/invoice state. Rejects stale UI context; shows server errors as text. The client does not directly touch payments, stock, photos or data.
- `CANCELLED` is displayed as "Ακυρωμένη"; ordinary editor, reopen and invoice actions are disabled/hidden in the cancelled order UI.

## Tests and checks
- `server/test/purchase-order-reopen-ui.test.js`: JSDOM tests added for visible owner cancel button on posted invoices, no cancel button for unposted/cancelled status, explicit reason/consent, no double submission, negative-stock confirmation, escaped line audit, stale context rejection and owner role gate.
- Syntax of transformed UI module has been parsed but **full tests, exact-head CI, and hosted LAB acceptance are not yet verified**.
- Owner cancel server-side work PR #3743 includes new terminal state protection and native DB tests; dependent verification is separate.

## Acceptance and restrictions
- Require #3743 exact-head CI PASS and server-side review first. Then exact-head CI of this PR, staged MYWORKSTATION LAB test with synthetic order and before/after inventory/payment/photo/audit evidence. Never use real invoices as test data.
- No fiscal/myDATA changes, live customer email, payment refund, production database writes or Render deploy.
