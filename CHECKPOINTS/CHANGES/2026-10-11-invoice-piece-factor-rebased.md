# POS invoice PIECE factor — 11 October 2026

USER FAIL: existing draft 142730, 12 selected rows, printed 678.28 EUR, working 678.31 EUR. Draft transfer stops on blank pieces-per-package in successive PIECE rows.

Source defaults missing factor to 1 only for PIECE rows; PACKAGE still requires verified factor. Preserve monetary, permission, concurrency, and duplicate-write safeguards. No real payment, stock, fiscal or finalization.

Status: AWAITING CI, deployment and physical USER retest on same draft. Do not reupload or pay again.
