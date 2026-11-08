# INVOICE-OWNER-FINALIZATION-01 (#28) — show line audit in owner reopen preview — 2026-11-08

**Status:** AWAITING CI / LAB NOT TESTED. #28 remains OPEN.

## Scope
- Builds on merged PR #3727 (POS review and authorized BackOffice posting) and Claude PR #3731 (server `preview.lineAudit`, CI PASS).
- BackOffice reopen dialog now displays a scrollable, expanded table of the original invoice lines *before* the user confirms a reopen.
- Display is bounded to 100 lines; show a truthful count/truncation notice if more exist. All server-supplied display values are HTML escaped, and older previews without `lineAudit` degrade to an informational message.
- Does not change reopen action, API, payment handling, photos/attachments, inventory reversal, role authorization, fiscal processes or database schema.

## Evidence to obtain
- Tests added to `server/test/purchase-order-reopen-ui.test.js`: malicious HTML in descriptions is displayed as text, 100-line cap and missing-audit fallback. Existing confirmation and single-submit behavior retained.
- Required exact-head MyWorkStation CI and focused UI test have **not yet been observed passing** at checkpoint creation.
- Hosted MYWORKSTATION LAB manual acceptance and owner action permissions are **NOT TESTED**. Do not classify CI PASS as LAB PASS.
- Do not touch real financial records, payments or stock. No deployment requested by this checkpoint.

Remaining for #28: review cancellation/voiding with stock reversal and full audit, real DB-backed evidence, authorized owner/manager LAB acceptance.
