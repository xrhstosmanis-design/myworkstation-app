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
### 1. Server-side payment permission enforcement
`server/src/routes/store-pos-catalog.js` is now a central access gate for `/api/store-pos/stores/:storeId/*` requests.

For checkout:
- `CASH` requires BackOffice permission `cash` / «Μετρητά».
- `CARD` and `IRIS` require BackOffice permission `cards` / «Κάρτες».
- `MIXED` validates every included payment method against the same central permissions.
- Permission-denied checkout attempts write `POS_PERMISSION_DENIED` to `StoreOperatorAudit`.
- Existing online barcode search continues to use `onlineBarcode` from the same BackOffice profile.
- Store/operator tenant isolation remains enforced.

### 2. Atomic POS stock update
The POS checkout now updates `StoreProduct.currentStock` in the same database transaction that creates the sale.

For every sold line:
- `SaleLine` is inserted.
- If the linked BackOffice product has `trackStock=TRUE`, the store stock is decremented by the sold quantity.
- The stock write is store-scoped and company-scoped.
- If the sale transaction rolls back, the stock update rolls back with it.

### 3. Normal sale audit
A successful POS sale now writes `POS_SALE_COMPLETED` to `StoreOperatorAudit` inside the same transaction.
The audit includes:
- sale ID
- shift/session ID
- total
- payment method and payment breakdown
- customer ID when present
- products and quantities
- operator / actor from the authenticated POS session

## Confirmed shared BackOffice records used by checkout
- `Sale`
- `SaleLine`
- `Payment`
- `StoreProduct.currentStock`
- `StoreTransaction` linked to the open `CashShiftSession`
- `StoreOperatorAudit`
- duplicate-sale/idempotency safety records
- `NON_FISCAL` status for KAT software testing

## Still to verify before KAT sale PASS
1. Return/reversal restores stock through the existing reversal path exactly once.
2. Payment/shift totals remain correct for CASH, CARD and MIXED after the new stock write.
3. UI visibility follows the same BackOffice permissions, not only server enforcement.
4. CI/build passes on this branch.
5. Real KAT test: PIN → open NON_FISCAL shift → product → CASH → verify BackOffice sale/payment/stock/shift/audit.

## Next action
Run repository CI/build through a PR, inspect any failure, then continue directly with return/reversal stock symmetry and UI permission visibility. After those pass, request the user's first real KAT test.

## 170-item list status
No item is removable yet from the master list because the real end-to-end KAT sale test has not passed.
