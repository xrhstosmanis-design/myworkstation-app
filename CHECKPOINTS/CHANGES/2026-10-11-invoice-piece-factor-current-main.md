# POS invoice draft transfer — 2026-10-11

Replacement for conflicted PR #2315. USER FAIL existing invoice 142730: 12 selected rows, printed 678.28 EUR, working 678.31 EUR. Transfer stopped on missing piece factor. Code defaults blank factor to 1 only for PIECE rows; PACKAGE retains explicit factor requirement. No payment, stock, fiscal, or finalization changes. Status AWAITING CI, deploy, and physical same-draft USER acceptance.
