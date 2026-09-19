# Fresh Snack unverified trailing replay — 2026-09-19

Fresh Snack invoice `36-ΤΔΑ 005401` is a fresh POS-front diagnostic. Its
printed receipt has five physical rows and gross `53.87 EUR`. The provisional
OCR table contains those exact five rows first (which total `53.87 EUR`), then
four unverified malformed replay rows, giving a false `92.28 EUR` total.

For a supplier that already requires current-image complete-table verification,
the POS now discards only such a trailing replay when its preceding rows alone
reconcile exactly to the independently confirmed total and every removed row
matches an earlier description but is not source-verified. It never uses old
invoice economics. Any other mismatch remains blocked for review.

- Focused regression suite: `78/78` PASS locally.
- CI, merge, Render deploy and an operator check of the existing safe draft
  are still required. No approval, stock posting, fiscal/accounting export or
  payment mutation is permitted.
