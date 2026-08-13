# MyWorkStation POS ↔ BackOffice checkpoint — 2026-08-13

## Rules
- POS and BackOffice share the same authoritative store data. No duplicate POS-only business records.
- Every sale/return/payment/stock/shift/customer/supplier/expense/modifier/waste/preparation action must be visible in the proper BackOffice path and audit trail.
- Operator permissions come only from BackOffice → Εμπορική λειτουργία → Χειριστές (`permissions`, `backofficeMenu`, `backofficeTabs`).
- Critical flows get regression tests and live KAT tests.

## Last live
- main: `a458e055a3185d8e80281e8f9fa8c58f5a89dafb`
- Render live auto-deploy confirmed.
- PR #156 merged: POS checkout ↔ BackOffice permissions, stock and audit.

## Active branch
- `agent/show-sale-items-everywhere`

## Implemented in current branch
- BackOffice sales journal now reads the existing authoritative POS `Sale` / `SaleLine` / `Payment` data through `/api/store-pos/sales/journal`.
- Journal is company scoped, optionally store scoped, date scoped and limited to real POS/EXCHANGE records.
- Journal UI shows date/time, store, operator, item names, quantities, payment breakdown, total and state.
- Added regression test `server/test/sales-journal-items-v1.test.js`.

## Next
1. Run CI and merge/deploy if green.
2. Live KAT test: make a sale and verify the exact item/quantity/payment appears in BackOffice → Ημερολόγιο πωλήσεων.
3. Then implement/verify returns: item + quantity + amount + original sale + stock restore only for `trackStock=true` + audit + analytics.
4. Continue cash/card/mixed/EFTPOS, shift totals, permissions, customers, suppliers/expenses, modifiers/preparation/waste and reports.

## Delete-from-list rule
Only tell the user to remove an item from their list after implementation + required regression/live test are complete.