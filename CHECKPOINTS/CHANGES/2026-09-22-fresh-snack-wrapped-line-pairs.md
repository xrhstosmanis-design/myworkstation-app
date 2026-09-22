# FRESH SNACK wrapped line pairs — 2026-09-22

## LAB evidence

The new real Fresh Snack receipt has nine printed products and footer `88.49 EUR` net, `11.50 EUR` VAT and `99.99 EUR` gross. Invoice Learning exposed eighteen provisional rows because Azure split every physical product across a description row and its following lot/quantity/price row. The malformed draft totalled `55.90 EUR`. This is `LAB FAIL`; it must not be confirmed or learned.

## Bounded change

Only the existing `FRESH_SNACK_COMPLETE_PRINTED_TABLE` profile may invoke the repair. It joins a complete alternating sequence of description headers and numeric continuation rows from the current image. Every reconstructed row must independently satisfy its printed quantity, unit price, discount and net value equation. The reconstructed table must then match all available current-image footer totals within cent tolerance.

If any pair is missing, non-numeric, ambiguous, arithmetically inconsistent or disagrees with the footer, the original result is returned unchanged for review. The rule stores no historical item economics and does not affect any other supplier.

## Safety and acceptance

- No approval, stock, payment, fiscal, accounting or myDATA mutation is part of this diagnostic change.
- Local regression: wrapped 18-to-9 recovery, ambiguous-pair rejection, footer-mismatch rejection and the existing central invoice-learning suite pass.
- Status: `AWAITING CI / DEPLOY / LAB`.
- After exact Render deployment, re-read the photograph once in Invoice Learning. Accept only 9 rows with correct quantities/prices/discounts and `88.49 + 11.50 = 99.99`; then, and only then, confirm learning.
