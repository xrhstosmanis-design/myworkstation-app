# Fresh Delicacies complete printed-table safety rule — 2026-09-19

## Evidence and boundary

Fresh Delicacies invoice `BB 6439` reached the POS-front background flow but
was safely blocked: the printed receipt has `12` physical rows, net `51.20
EUR`, VAT `6.66 EUR` and total `57.86 EUR`; the provisional OCR table had a
malformed first value and two duplicate rows, totalling `4810.44 EUR`.

It remains an unapproved draft. No approval, stock posting, fiscal/accounting
export, payment creation or duplicate draft is allowed by this change.

## Change

The central `FRESH_DELICACIES_COMPLETE_PRINTED_TABLE` learning profile stores
no historical line economics. When the current image does not reconcile, the
existing complete verifier must reread every printed row, its arithmetic, the
VAT footer and the final total before it can replace the draft. An incomplete
or mismatched reread leaves the existing draft visible for review.

The same correction also repairs the MANTZILAS complete-verifier condition to
use its defined reconciliation gate rather than an undefined identifier.

## Verification and next evidence

- Focused regression suite: `77/77` PASS locally.
- GitHub CI, merge, Render deploy and a new POS-front Fresh Delicacies invoice
  are still required. Do not re-upload diagnostic `BB 6439` as acceptance
  evidence.
