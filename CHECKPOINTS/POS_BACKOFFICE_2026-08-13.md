# MyWorkStation POS ↔ BackOffice checkpoint — 2026-08-13

## Rules
- POS and BackOffice share the same authoritative store data. No duplicate POS-only business records.
- Every sale/return/payment/stock/shift/customer/supplier/expense/modifier/waste/preparation action must be visible in the proper BackOffice path and audit trail.
- Operator permissions come only from BackOffice → Εμπορική λειτουργία → Χειριστές (`permissions`, `backofficeMenu`, `backofficeTabs`).
- Critical flows get regression tests and KAT live-application tests where appropriate.
- **KAT / current test environment is NON_FISCAL only. No real fiscal transaction and no command is sent to RBS or any physical cash register during these tests.**
- **Real RBS / fiscal cash-register integration and fiscal receipt tests are performed only at the physical store with the real cash register connected.**
- Until that store-stage test, POS sales/returns are application/business-flow tests only and must remain explicitly `NON_FISCAL`.

## Last live
- main: `a458e055a3185d8e80281e8f9fa8c58f5a89dafb`
- Render live auto-deploy confirmed.
- PR #156 merged: POS checkout ↔ BackOffice permissions, stock and audit.

## Active branch
- `agent/show-sale-items-everywhere`

## Implemented in current branch
- BackOffice sales journal reads the existing authoritative POS `Sale` / `SaleLine` / `Payment` data through `/api/store-pos/sales/journal`.
- Journal is company scoped, optionally store scoped and date scoped.
- Journal UI shows date/time, store, operator, item names, quantities, payment breakdown, total and state.
- Journal includes POS sales, exchanges and POS reversal records so returns/cancellations can appear as item-level movements.
- Added regression tests for journal data contract and route mounting.

## Next
1. Run CI and merge/deploy if green.
2. KAT NON_FISCAL application test: make a test sale and verify the exact item/quantity/payment appears in BackOffice → Ημερολόγιο πωλήσεων. No RBS command.
3. Implement/verify returns: item + quantity + amount + original sale + stock restore only for `trackStock=true` + audit + analytics, still NON_FISCAL in KAT.
4. Continue cash/card/mixed/EFTPOS, shift totals, permissions, customers, suppliers/expenses, modifiers/preparation/waste and reports.
5. Separate final store-stage test: connect real RBS/cash register and validate actual fiscal communication only there.

## Delete-from-list rule
Only tell the user to remove an item from their list after implementation + required regression/application test are complete. RBS/fiscal items cannot be removed until the physical-store test with the real cash register passes.