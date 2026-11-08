# INVOICE-OWNER-FINALIZATION-01 (#28) — line audit shown in owner reopen modal — 2026-11-08

**Status: AWAITING CI / LAB NOT TESTED.** Not a PASS; #28 stays OPEN (tracker owner unchanged).

## Change (one bounded, additive, display-only step)
- `client/src/components/commerce/installPurchaseOrdersSuite.js`: the reopen confirmation modal renders the preview's `lineAudit` (added server-side earlier, see `2026-11-08-invoice-owner-finalization-preview-line-audit.md`) as a collapsed, read-only `<details>` table (max 50 rows, "μερική προβολή" when truncated). All values are HTML-escaped. Absent `lineAudit` renders nothing (older previews unchanged).
- Not changed: server code, reopen request/payload, stock reversal, payments, photos, employee finalization, permissions, schema.

## Tests
- `node --test server/test/purchase-order-reopen-ui.test.js server/test/purchase-order-reopen.test.js`: 13 tests, 7 pass, 0 fail, 6 SKIPPED (native-Postgres integration tests unavailable). New test covers escaping, 50-row bound, truncation label, no POST, and absence case.
- Hosted/DB behavior NOT TESTED. No full server suite run.

## Remaining for #28
Owner-authorized cancel with inventory reversal, native-DB test, LAB acceptance with before/after evidence.
