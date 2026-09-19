# Fresh Snack complete printed-table rule — 2026-09-19

## Evidence and boundary

Diagnostic POS invoice `21-ΤΛΑ 006019` for `FRESH SNACK AE` (ΑΦΜ `099162880`) created one unapproved draft with nine rows, but its calculated gross was `68.12 EUR` while the operator-confirmed invoice total was `99.99 EUR`.

The mismatch remained blocked in BackOffice. No approval, stock posting, fiscal/accounting export, payment creation or duplicate draft is permitted by this change.

## Change

The central supplier profile `FRESH_SNACK_COMPLETE_PRINTED_TABLE` activates only when this supplier has a current-image total mismatch. It reruns the existing complete printed-table verifier and accepts a replacement only if every printed row's economics, the VAT footer and the final gross agree within the existing cent tolerance.

The rule contains no historical product economics and applies across stores only for this supplier tax ID. A failed or incomplete rerun retains the same draft unchanged and visibly reviewable.

## Verification and next evidence

- Local focused regression suite: `76/76` PASS.
- GitHub CI, merge, Render deploy and a new single-submission POS-front LAB invoice are still required.
- The diagnostic `21-ΤΛΑ 006019` is not a retry target and must not be uploaded again for acceptance.
