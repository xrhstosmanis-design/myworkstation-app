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
- Published POS payment buttons are filtered by the same central access data, so CASH/CARD/IRIS/MIXED are not merely blocked at submit time.

### 2. Atomic POS stock update
The POS checkout updates `StoreProduct.currentStock` in the same database transaction that creates the sale.

For every sold line:
- `SaleLine` is inserted.
- If the linked BackOffice product has `trackStock=TRUE`, the store stock is decremented by the sold quantity.
- The stock write is store-scoped and company-scoped.
- If the sale transaction rolls back, the stock update rolls back with it.

### 3. Normal sale audit
A successful POS sale writes `POS_SALE_COMPLETED` to `StoreOperatorAudit` inside the same transaction.
The audit includes sale, shift/session, total, payment breakdown, customer when present, products/quantities and authenticated operator.

### 4. Return/cancellation stock symmetry
`server/src/routes/pos-sale-actions.js` now restores stock only for the same type of product that checkout decrements:
- same store
- same company product
- active `StoreProduct`
- `Product.trackStock=TRUE`

This prevents returns/cancellations from increasing stock for products that do not use stock tracking.

### 5. Return/cancellation/delayed audit linkage
POS action records continue to write `PosSaleActionAudit` and now also write the central `StoreOperatorAudit` used by operator events:
- `POS_RETURN_COMPLETED`
- `POS_SALE_CANCELLED`
- `POS_SALE_DELAYED`

Return/cancellation audit stores original/reversal sale IDs, reason, shift/session, payment breakdown and product lines.

## Confirmed shared BackOffice records used by checkout and reversal
- `Sale`
- `SaleLine`
- `Payment`
- `StoreProduct.currentStock`
- `StoreTransaction` linked to the open `CashShiftSession`
- `StoreOperatorAudit`
- `PosSaleActionAudit`
- duplicate-sale/idempotency safety records
- `NON_FISCAL` status for KAT software testing

## CI status
Draft PR #156 is open.
The first CI runs failed. GitHub check annotations expose only the final exit-code annotation, not the underlying test output through the connector. The branch is still under correction and MUST NOT be used for KAT acceptance until CI is green.

## Still to verify before KAT sale PASS
1. Exact CI failure and green build/test.
2. Server-side `returnItems` permission on reversal, using the same BackOffice permission profile.
3. Payment/shift totals for CASH, CARD and MIXED.
4. Remaining UI actions from the previous-page list: left keys, product-name menu, end shift, own/all shift transactions, own shift payments, transfer amount.
5. Real KAT test: PIN → open NON_FISCAL shift → product → CASH → verify BackOffice sale/payment/stock/shift/audit.

## Next action
Resolve PR #156 CI, add central return permission enforcement, then continue the previous-page POS controls. Only after green CI/merge/deploy request the user's first real KAT test.

## 170-item list status
No item is removable yet because the corresponding real end-to-end KAT test has not passed.
