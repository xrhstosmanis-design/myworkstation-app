# INVOICE-OWNER-FINALIZATION-01 (#28) — line audit in owner reopen preview — 2026-11-08

**Status: AWAITING CI / LAB NOT TESTED.** Not a PASS; #28 stays OPEN (tracker owner unchanged).

## Change (one bounded, additive, read-only step)
- `server/src/services/purchase-order-reopen.js`: `preview()` is now exported and the preview response additionally carries `lineAudit` (same bounded `summarizeReopenLines` output used in the `PURCHASE_ORDER_REOPENED` audit), so the owner sees which lines the reopen will supersede before confirming.
- Not changed: preview `version` hash (computed from the snapshot, not the response), reopen result shape, stock reversal, payments, photos/attachments, employee finalization, schema, routes, permissions.

## Tests
- `node --test server/test/purchase-order-reopen.test.js`: 8 tests, 3 pass (incl. new preview unit test), 0 fail, 5 SKIPPED (native-Postgres integration tests unavailable here). DB-backed behavior NOT TESTED.

## Remaining for #28
Owner-authorized cancel with inventory reversal, BackOffice UI display of `lineAudit`, native-DB test, LAB acceptance with before/after evidence.
