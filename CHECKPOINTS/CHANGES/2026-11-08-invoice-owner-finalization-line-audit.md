# INVOICE-OWNER-FINALIZATION-01 (#28) — per-line audit on owner reopen — 2026-11-08

**Status: AWAITING CI / LAB NOT TESTED.** Not a PASS; #28 stays OPEN (owner is the tracker's).

## Change (one bounded, additive step)
- `server/src/services/purchase-order-reopen.js`: new exported `summarizeReopenLines()` (bounded to 500 lines, whitelisted fields, strings capped at 200 chars). The `PURCHASE_ORDER_REOPENED` StoreOperatorAudit event now also carries `lineAudit` (the lines superseded by the reopen). The full snapshot was already stored in `PurchaseOrderReopenAudit`.
- No change to: preview version hash, reopen result shape, stock reversal, payments, photos/attachments, employee finalization, schema, routes, permissions.

## Existing behavior preserved
Owner/admin-only reopen, stock reversal movements, payment untouched, source files preserved, idempotency by preview version.

## Tests
- `node --test server/test/purchase-order-reopen.test.js`: 7 tests, 2 pass (incl. new unit test), 0 fail, 5 SKIPPED (native-Postgres integration tests unavailable in this sandbox). DB-backed behavior is therefore NOT TESTED here.

## Remaining for #28 (not done)
Owner-authorized cancel (with inventory reversal), exposing lineAudit in BackOffice UI, native-DB test of lineAudit content, LAB acceptance with before/after evidence.
