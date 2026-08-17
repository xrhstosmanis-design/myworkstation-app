# CHECKPOINT — Invoice total reconciliation / Owner-Manager responsibility

Date: 2026-08-17

## Locked rule
- POS OCR/V2.4.4 purchase invoices compare the original invoice gross total with the sum of PurchaseOrderLine gross amounts before FINAL posting.
- Absolute difference <= 0.05 EUR: normal finalization may continue.
- Absolute difference > 0.05 EUR: normal finalization is blocked.
- Override is permitted only for SUPER_ADMIN / OWNER / ADMIN / MANAGER and never for STORE_OPERATOR.
- Override requires a mandatory reason (minimum 5 characters).
- UI explicitly warns that continuation is **ΜΕ ΕΥΘΥΝΗ ΙΔΙΟΚΤΗΤΗ/ΔΙΑΧΕΙΡΙΣΤΗ** and shows invoice total, lines total, difference and tolerance.
- Every override attempt is written to PurchaseOrderTotalOverrideAudit with actor, role, timestamp, invoice total, lines total, difference, tolerance, reason and outcome FINALIZED / NOT_FINALIZED.
- Existing unresolved-product and stock-posting guards continue after this reconciliation guard. An override of the total mismatch does NOT bypass unresolved product lines or other posting safety rules.

## Relevant commits
- Server reconciliation guard: 5c33af919497c210f0282904bf29be4a8c65626a
- Mounted before unresolved-line guard: b0f69eb2c9387b94f0b3c083566c5d2ecb834016
- BackOffice owner/manager reason UI flow: e0aa84e1b3d42b6d34bb7920b64645a0b2642b0f
- Regression test: abd3bddf8d72261f569d47dfe9a51395bdae1a77

## Current KAT test
Invoice 106.414 currently shows 6 real V2.4.4 product lines with gross line total around 66.58 EUR while the invoice header total is 108.86 EUR. This is intentionally NOT safe to finalize normally. It is suitable to verify that the new mismatch guard blocks finalization and displays the responsibility flow. Do not use the override to stock-post while product lines remain unresolved.
