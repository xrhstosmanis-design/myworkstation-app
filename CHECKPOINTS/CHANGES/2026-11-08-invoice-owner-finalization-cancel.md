# INVOICE-OWNER-FINALIZATION-01 (#28) — owner/manager cancel (void) of a posted purchase — 2026-11-08

**Status: AWAITING CI / LAB NOT TESTED.** Not a PASS; #28 stays OPEN (tracker is authoritative).

## Change (one bounded server-side step)
- `server/src/services/purchase-order-reopen.js`: reopen logic became `transitionPurchaseOrder(target)`; `reopenPurchaseOrder` (target `NEW`, behavior unchanged) and new `cancelPurchaseOrder` (target `CANCELLED`) share one audited transaction: same actor gate (SUPER_ADMIN/OWNER/ADMIN/MANAGER, no store-operator tokens, store-scoped), same preview-version check, explicit confirm + reason (>=5 chars), negative-stock acknowledgement, inverse `StockMovement` rows, `PurchaseOrderReopenAudit` snapshot and `StoreOperatorAudit` (`PURCHASE_ORDER_CANCELLED`).
- Cancel leaves the order `CANCELLED` (terminal: cannot be reopened, edited or re-finalized; existing guards require `NEW`/`FINAL`/`INVOICED`) and the approved purchase projection `CANCELLED`.
- Idempotency: unique (company, order, previewVersion); replay returns the stored result with `idempotent:true` only if the order is still in the same target state.
- `server/src/routes/purchase-order-reopen.js`: `POST /:orderId/cancel` (same mount/auth as reopen).
- Coordinator post-review hardening: `server/src/routes/purchase-order-posting-guard.js` explicitly rejects re-finalization or re-posting of `CANCELLED` orders, including calls supplying a valid reopenVersion/identity; `server/src/routes/purchase-orders.js` blocks ordinary line/editor mutations of cancelled orders. This closes a terminal-state bypass identified in the original Claude draft.
- No change to: preview/lineAudit, payments, original photos/attachments, employee finalization, schema, catalog prices, fiscal/myDATA. No UI change (BackOffice UI belongs to PR #3737).

## Tests (isolated local Postgres 16, NODE_ENV=test, throwaway DB)
- Prior Claude commit `node --test test/purchase-order-reopen.test.js`: 11/11 pass (2 new: pre-DB actor/payload rejection; native cancel: stock 13→10 once under concurrent duplicate, payments/files unchanged, foreign company/other store 404, replay idempotent, reopen/preview/re-finalize after cancel rejected 409).
- `test/purchase-order-*.test.js` + supplier-correction: 46/47; the one failure is `purchase-order-reopen-ui.test.js` (`jsdom` not installed in this sandbox, pre-existing, owned by PR #3737).

- Coordinator added regression assertions for re-finalization with the correct order version/identity and testing the real editor guard. **Updated tests and repository CI are not yet verified at this checkpoint**.

## Remaining for #28 (not done)
BackOffice cancel UI (PR #3737 scope), LAB acceptance with measured before/after, decision on whether cancelled supplier-payment evidence needs an owner-visible flag. CI and LAB NOT TESTED.
