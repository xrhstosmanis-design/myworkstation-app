# Checkpoint — POS supplier invoice V2.4.4 structured flow

Date: 2026-08-17

## Locked rule
Production POS must reuse the proven KAT Invoice Lab V2.4.4 structured result. No second interpretation of raw OCR lines is allowed for purchase items.

## Flow
POS Supplier Payment -> OCR/AI -> V2.4.4 product line finalization -> save structured productLines -> structured-only POS intake -> Purchase Orders & Purchases -> manager resolution/finalization -> stock/supplier-item learning.

## Implemented
- `client/src/lib/invoice-v244.js`: Lab-aligned parseCommercial, economic scoring, canonical dedup, generic recovery guard and packaging rules.
- `client/src/components/store/StoreSupplierInvoiceV244.jsx`: full invoice AI pass, conditional crop/zoom passes, merge, V2.4.4 finalization, structured line save before intake.
- `client/src/components/store/StorePosPaymentsModal.jsx`: supplier payment switched from V3 to V2.4.4 SAFE component.
- `server/src/routes/commerce-pos-v244.js`: structured-only product line save + structured-only POS intake; refuses intake unless `v244Finalized=true` and productLines exist. Preserves supplier code, quantities, unit cost, discount percentages, net/VAT/gross and does not use raw OCR fallback.
- `server/src/index.js`: V2.4.4 route mounted before legacy AI recheck/intake routes.

## Safety
- Raw OCR / anchors / IBAN / headers / totals cannot be converted to purchase lines by the V2.4.4 intake.
- Stock remains unchanged until BackOffice finalization.
- PAID still requires an open cash shift; CREDIT does not subtract cash.
- Existing bad test draft `106,414` must not be finalized.

## First regression test after deploy
1. Open KAT POS -> Payments -> Supplier Payment.
2. Confirm badge `V2.4.4 · SAFE`.
3. Upload a known invoice previously passed in Lab.
4. Confirm status reports N real V2.4.4 lines.
5. Choose CREDIT for safety.
6. Submit for review.
7. In BackOffice -> Orders & Purchases, verify only real product rows, including supplier codes and discounts. Do not finalize until verified.
