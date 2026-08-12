# MyWorkStation checkpoint — POS ↔ BackOffice integration

Updated: 2026-08-13 Europe/Athens
Branch: `agent/pos-backoffice-permissions-stock`
Base checkpoint: `eb19b377` — central BackOffice operator permissions in POS.

## Permanent rules
- Operator permissions come only from `Εμπορική λειτουργία → Χειριστές`.
- No second POS permission system.
- POS actions must read/write the same store BackOffice data.
- Every completed action must map to store, operator, shift, timestamp and audit where applicable.
- Real KAT test is required before an item is marked PASS / removable from the 170-item list.

## Completed in this checkpoint
### Server-side payment permission enforcement
`server/src/routes/store-pos-catalog.js` now acts as a central access gate for `/api/store-pos/stores/:storeId/*` requests.

For checkout:
- `CASH` requires BackOffice permission `cash` / «Μετρητά».
- `CARD` and `IRIS` require BackOffice permission `cards` / «Κάρτες».
- `MIXED` validates every included payment method against the same central permissions.
- Permission-denied checkout attempts write `POS_PERMISSION_DENIED` to `StoreOperatorAudit`.
- Existing online barcode search continues to use `onlineBarcode` from the same BackOffice profile.
- Store/operator tenant isolation remains enforced.

## Confirmed existing checkout integration
The current POS checkout already writes real shared BackOffice records:
- `Sale`
- `SaleLine`
- `Payment`
- `StoreTransaction` linked to the open `CashShiftSession`
- cash and card/IRIS split for mixed payments
- duplicate-sale/idempotency safety
- `NON_FISCAL` status for KAT software testing

## Critical gap found — NOT completed yet
The inspected checkout inserts `Sale` / `SaleLine` / `Payment` and shift transactions, but no stock decrement is visible in that checkout transaction.

Before KAT sale testing is accepted, complete and verify:
1. POS sale decrements `StoreProduct.currentStock` atomically in the same DB transaction.
2. Insufficient/invalid store product state fails closed.
3. Return/reversal restores stock through the existing reversal path without double adjustment.
4. Sale + stock + payments + shift movement stay one coherent BackOffice transaction.

## Next action
Implement atomic stock movement for POS checkout, then inspect normal-sale audit linkage and execute CI. After that, request the user's first real KAT test: PIN → open NON_FISCAL shift → product → CASH → verify BackOffice sale/payment/stock/shift/audit.

## 170-item list status
No item is removable yet from the master list in this checkpoint because the end-to-end real KAT sale test has not passed.
