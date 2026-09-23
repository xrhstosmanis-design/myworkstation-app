# POS invoice: cross-supplier regression matrix (2026-09-23)

## Current evidence

The newest real Leventopoulos LAB is **FAIL**: a 22-row draft totals 450.96 EUR against the printed 194.77 EUR, with duplicates and quantities of 1000. PR #1118 is deployed but has **NOT TESTED** status for a fresh POS submission. Earlier supplier results must not be inferred from local unit tests.

| Supplier / invoice | Independent printed target | Automated regression | New front-of-POS LAB |
| --- | --- | --- | --- |
| TALOS `01T00125909` | 44 rows; 223.05 + 29.01 = 252.06 EUR | `talos-verified-printed-rows-v1` checks printed row arithmetic and supplier boundary; whole-invoice LAB still FAIL | Not tested after latest deployment |
| Leventopoulos `ΤΑΠΠΧ14 15` | Printed 194.77 EUR; independently count all physical rows from original image | `leventopoulos-mm-pos1-profile-v1`, `leventopoulos-full-image-reread-target-v1`; prior 22/450.96 draft is LAB FAIL | Not tested after #1118 |
| MANTZILAS `12729` | 10 rows; 200.08 EUR; package quantities, discount, excise | `invoice-12729-pos-regression-v1` | Not tested on this revision |
| DELTA `28897` | 11 rows; 53.91 EUR; printed quantities, 10/15% discounts, 13% VAT | `invoice-28897-pos-regression-v1` | Not tested on this revision |
| Fresh Snack wrapped rows | 9 physical products; 88.49 + 11.50 = 99.99 EUR | `invoice-fresh-snack-wrapped-lines` checks paired rows and footer | Not tested on this revision |
| Any supplier with 20 products | All 20 rows; at most two identified lines `ΠΡΟΣ ΕΛΕΓΧΟ` | `pos-invoice-header-total-reconciliation-v1` | Not tested on this revision |

The additional `pos-cross-supplier-isolation-v1` test challenges TALOS learning with TALOS-shaped text on four other suppliers and ensures Leventopoulos's one-page table selection cannot rewrite three other suppliers. The cross-supplier examples are intentionally synthetic isolation cases, not evidence of successful OCR of their original documents.

## Acceptance and safety

Run the complete server suite and required CI gates for all suppliers together. After exact deployment, observe one genuinely new, ordinary POS submission from each different supplier as invoices naturally arrive; never resubmit an already processed invoice simply to test. Record supplier, store, invoice, original physical row count, each printed quantity and discount, VAT groups, printed gross, detected uncertainties and draft/job identity. LAB PASS for each requires one automatic draft with all physical rows, no duplicates, at most two *identified and visibly marked* uncertain lines, and reconciliation before operator approval. Report each supplier separately; a test pass does not establish LAB PASS. Do not delete old drafts, approve, move stock or initiate payment/fiscal actions for diagnostic testing.
