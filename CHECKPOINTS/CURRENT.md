# MyWorkStation — CURRENT CHECKPOINT

Updated: 2026-08-13

## Live baseline
- main: a458e055a3185d8e80281e8f9fa8c58f5a89dafb
- Render: LIVE / Auto-Deploy confirmed
- PR #156 merged: central BackOffice permissions + checkout stock/audit integration

## Active implementation
- Branch: `agent/show-sale-items-everywhere`
- PR: #158
- Current head: `589b6b3f1015ee977caa67a7087de9b75dbede16`
- CI: run #234 in progress

## Completed in this checkpoint
1. BackOffice sales journal now reads authoritative `Sale` + `SaleLine` + `Payment` data and shows real item names, quantities, payment split, total and state instead of only daily totals.
2. Journal is tenant/store/date scoped and includes `POS`, `EXCHANGE` and `POS_REVERSAL` rows.
3. POS RETURN now enforces the existing central BackOffice operator permission `permissions.returnItems` server-side. Denied attempts write `POS_RETURN_DENIED_PERMISSION` audit.
4. Reversal restores stock only when the product is tracked (`trackStock=true`).
5. Every successful tracked-stock restore writes a `StockMovement` in the same DB transaction with source `POS_REVERSAL` and reference to the reversal/original sale.
6. Reversal keeps negative `Sale`/`SaleLine`/`Payment` rows, `originalSaleId`, `reversalKind`, shift `StoreTransaction`, `PosSaleActionAudit` and `StoreOperatorAudit` so analytics and audit use the same authoritative movement.
7. Regression tests added for sales journal item/payment contract and POS return BackOffice integrity.

## Next actions
1. Wait for CI #234 result. If green: merge PR #158 to main and verify Render auto-deploy.
2. KAT live test: one sale with known item -> verify journal item/qty/payment/total.
3. KAT live RETURN -> verify negative journal row, original sale link, stock restored, shift amount reversed and audit recorded.
4. Only after live verification mark the corresponding user-list items complete.
5. Continue with mixed payment/EFTPOS/shift totals, then remaining permissions and BackOffice links.

## Permanent architecture rules
- POS and BackOffice share the same store data; never create a parallel POS data source.
- Operator permissions come only from Commercial operation -> Operators (`permissions`, `backofficeMenu`, `backofficeTabs`).
- Every critical flow gets automated regression tests and KAT live verification where needed.
- Update this checkpoint after every material completed step so another conversation can resume without rediscovery.
