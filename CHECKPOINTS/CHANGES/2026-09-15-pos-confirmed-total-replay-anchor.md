# POS OCR — confirmed total replay anchor

- LAB rerun of invoice `43243` still produced 32 rows because the generic AI path did not use the POS-confirmed `76.58 €` as its reconciliation anchor.
- Every supplier path now uses the confirmed handoff total before completeness recovery and duplicate-table replay detection.
- The confirmed amount is already the immutable payment amount for paid submissions, so OCR cannot replace it with an invented total.
- No payment creation, reversal, stock, approval, invoicing or finalization behavior changed.

