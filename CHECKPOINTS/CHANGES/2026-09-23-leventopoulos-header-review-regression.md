# LAB POS 2 Leventopoulos — header review regression — 2026-09-23

## Evidence

- The existing invoice `ΤΑΠΠΧ14 15` was received once. A later screenshot shows `POS_FAILED / POS_BACKGROUND_AI_RECHECK` at 04:09, with the printed-header agreement error and zero **persisted** order items.
- This error is thrown after the OCR candidate is assembled and before the product-lines PUT. Zero persisted lines do not establish an empty OCR result. The prior assertion that OCR found no lines was incorrect.
- The TALOS rollout introduced the generic total gate. The subsequent two-review-line patch still applied that gate to a table whose every row was verified internally against its own printed arithmetic when the independent header differed by more than 5 EUR.

## Correction

- Permit an internally verified complete printed table to reach the same unapproved draft with its original row values. Do not adjust an amount to force the header total. Preserve the visible discrepancy for operator correction.
- The hard stop remains for unverified output without the at-most-two identified review rows. Empty reads, three uncertain rows, corrupt verified row arithmetic, duplicate payments and posted stock remain blocked.
- The owner has already deleted the failed invoice from the POS and requests the normal front-of-POS intake again. Do not restore the deleted job. The proposed recovery strategy was removed before commit.

## Acceptance

- Targeted and full server tests, green CI, merge and exact deployed revision.
- Perform one fresh submission from the front of the POS after the deployed change; inspect every physical product row and the financial mismatch in BackOffice. Do not claim LAB PASS until the invoice has all printed rows, at most two specifically flagged incorrect rows, no unresolved product, and the operator can correct the draft before approval.
