# MyWorkStation — CURRENT CHECKPOINT

Updated: 2026-08-17

## Current safe baseline
- Invoice Reader V2.4.4 CANONICAL DEDUP: **SAFE / regression approved**
- Invoice Reader checkpoint: `90529b6f`
- Do not modify the V2.4.4 parser while integrating BackOffice.
- Accepted invoice total rounding tolerance: ±0.05 EUR.

## Active implementation — BackOffice supplier-item learning
Current integration head: `6b7592c82959a1cd35cd59918de2b9756f803bc2`

Implemented:
1. Added `supplierItemCode` and `supplierBarcode` persistence on `PurchaseDocumentLine`.
2. Added `SupplierProductMapping` keyed by company + supplier + supplier item code.
3. Mapping stores Product, last description, supplier barcode, units/package, last piece cost, usage count and confirmation audit.
4. Mapping is learned/updated **only when OWNER / ADMIN / MANAGER approves the PurchaseDocument**.
5. Draft/AI result alone never teaches the mapping.
6. Added `/api/commerce/supplier-item-mappings/resolve` bulk resolver: supplier code first, barcode fallback.
7. Added `/api/commerce/supplier-item-mappings?supplierId=...` for BackOffice visibility.
8. Existing stock approval flow is preserved; learning is inside the same approval transaction.

## Next test / action
1. Verify Render deploy/schema bootstrap succeeds for head `6b7592c8`.
2. Real KAT BackOffice test: confirm one invoice line with supplier item code -> approve -> verify SupplierProductMapping created.
3. Resolve the same supplier code through `/supplier-item-mappings/resolve` and verify it returns the confirmed Product without AI description matching.
4. Re-run same supplier/code with a later approved invoice and verify usageCount increments and last cost/description refreshes.
5. Only after PASS: connect V2.4.4 output to this resolver before AI/recovery, then build the BackOffice review UI for unmatched lines.

## Permanent architecture rules
- POS and BackOffice share the same store/company data; never create a parallel invoice/product database.
- Invoice Reader proposes. BackOffice approval confirms and learns.
- Supplier mapping key is supplier + supplier item code, scoped by company/tenant.
- Stock changes only at PurchaseDocument approval, never from the Lab or AI read.
- Operator permissions come only from Commercial operation -> Operators (`permissions`, `backofficeMenu`, `backofficeTabs`).
- Every material completed step gets a checkpoint and KAT live verification.
- Never reopen a PASS module without a specific regression reason.

---

## Previous checkpoint — 2026-08-13

### Live baseline
- main: a458e055a3185d8e80281e8f9fa8c58f5a89dafb
- Render: LIVE / Auto-Deploy confirmed
- PR #156 merged: central BackOffice permissions + checkout stock/audit integration

### Previous active implementation
- Branch: `agent/show-sale-items-everywhere`
- PR: #158
- Current head: `589b6b3f1015ee977caa67a7087de9b75dbede16`
- CI: run #234 in progress

### Completed in previous checkpoint
1. BackOffice sales journal reads authoritative `Sale` + `SaleLine` + `Payment` data and shows real item names, quantities, payment split, total and state instead of only daily totals.
2. Journal is tenant/store/date scoped and includes `POS`, `EXCHANGE` and `POS_REVERSAL` rows.
3. POS RETURN enforces the existing central BackOffice operator permission `permissions.returnItems` server-side. Denied attempts write `POS_RETURN_DENIED_PERMISSION` audit.
4. Reversal restores stock only when the product is tracked (`trackStock=true`).
5. Every successful tracked-stock restore writes a `StockMovement` in the same DB transaction with source `POS_REVERSAL` and reference to the reversal/original sale.
6. Reversal keeps negative `Sale`/`SaleLine`/`Payment` rows, `originalSaleId`, `reversalKind`, shift `StoreTransaction`, `PosSaleActionAudit` and `StoreOperatorAudit` so analytics and audit use the same authoritative movement.
7. Regression tests added for sales journal item/payment contract and POS return BackOffice integrity.
