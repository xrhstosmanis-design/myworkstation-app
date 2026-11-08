# Invoice owner correction/cancel after finalization - before-source claim

## 08/11/2026 Europe/Athens - INVOICE-OWNER-FINALIZATION-01 / ASSIGNED / BEFORE SOURCE

Owner: Claude Code page, branch claude/admiring-heisenberg-y0jv5v (task #28, priority IMMEDIATE). New independent scope; no existing claim found in the tracker, active list or pending roadmap. Checkpoint: CHECKPOINTS/CHANGES/2026-11-08-invoice-owner-correction-claim.md.

Owner decision 08/11/2026: the POS operator **keeps** the current invoice finalization and stock posting rights unchanged. The Owner or an authorized manager must be able, after finalization, to **correct** (items/quantities, Invoice Assistant rerun on the same draft) or **delete/cancel** the finalized invoice.

Scope: (1) extend the existing management-only PurchaseOrder reopen (server/src/services/purchase-order-reopen.js, currently INVOICED only) to also accept FINAL, with the same exact recorded stock compensation, immutable audit and payment/photo retention; (2) owner decision 08/11/2026: "Delete" of a FINAL/INVOICED invoice returns it to an editable draft (NEW) through the same reopen with exact stock compensation, required reason and preview; it never hard-deletes the order, lines, photos or POS payment. Hard deletion stays limited to the existing NEW-draft DELETE, which already refuses a REOPENED document; (3) per-line correction history (append-only); (4) BackOffice buttons for FINAL/INVOICED orders in client/src/components/commerce/installPurchaseOrdersSuite.js. Owner decision 08/11/2026: SUPER_ADMIN/OWNER/ADMIN/MANAGER have both reopen and delete-to-draft rights; STORE_OPERATOR has neither.

Read-only evidence at main 64c36f4: PATCH status=FINAL (server/src/routes/purchase-order-posting-guard.js:166-331) posts StockMovement, StoreProduct stock, Product cost/sale price, APPROVED PurchaseDocument and posting rows, and is reachable by POS operators via posPurchaseOrderAccess; DELETE (:95-120) allows only NEW drafts without posting; reopen rejects FINAL (purchase-order-reopen.js:34). Reopen has only a LIMITED LIVE preview PASS (18/10); actual reversal/re-finalization remains NOT TESTED. No line-level correction history exists.

Preserve: operator finalization, idempotent single posting, store/company isolation, one settlement/one AI job/one draft, POS payment retention, existing reopen behavior for INVOICED, fiscal/myDATA untouched. Status: OPEN / BEFORE SOURCE. No code, LAB transaction, stock or payment mutation in this claim. Next: after claim CI and merge to main, bounded server change with regression tests, then AWAITING LAB.

## Proposed source acceptance (AWAITING implementation)

1. Operator PATCH FINAL behavior unchanged; operator receives 403 on reopen/cancel.
2. Reopen of a FINAL order: stock returns exactly to its pre-invoice value via recorded compensation; POS payment and photos unchanged; audit row written.
3. Reopen → correction → re-finalization: net stock delta equals only the correction.
4. Delete of FINAL/INVOICED: order returns to draft (NEW), stock exactly as before the invoice, order/lines/photos/payment preserved; repeated delete/reopen never compensates twice; Manager allowed, operator 403.
5. Cross-store/company requests rejected; existing reopen and posting tests stay green.
6. LAB in MYWORKSTATION LAB only, with before/after stock, shift and control-terminal values per AGENTS.md; then manual update docs/manual/purchase-orders/PASS.md.

## Documentation-only change

This claim changes only the three registries, this checkpoint and the regenerated tracker PDF copies. Runtime code and tests are unchanged. Numbered checklist unchanged (no task closed). Existing manual PASS unchanged.
