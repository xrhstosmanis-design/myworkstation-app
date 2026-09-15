# POS invoice reconciliation — merged checkpoint

- Merge `06dd1396` from PR #857 combines the verified POS invoice reconciliation and stock-unit changes already reviewed independently on `main`.
- It preserves legitimate repeated invoice rows while collapsing only a complete OCR replay corroborated by the confirmed invoice total.
- Central STEFANIDIS food-column learning and explicit description-driven conversions remain system-wide and equation-guarded.
- Missing package piece counts remain unresolved and visible in red for operator review.
- No payment creation, reversal, stock posting, approval, accounting or finalization behavior changed.
- Local validation before merge: frontend build PASS and 1,235/1,235 server tests PASS.

