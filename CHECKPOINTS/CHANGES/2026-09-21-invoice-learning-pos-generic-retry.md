# Invoice Learning POS generic complete-table retry — 2026-09-21

## Evidence

- MANTZAVAS 38001 remained `POS_FAILED` after deploy because the status retry recognised only older named supplier strategies.

## Fix

- Any centrally confirmed profile with `requireCompletePrintedTableOnMismatch=true` now receives the safe complete-table retry strategy.
- The retry reuses only the same durable POS draft and exact supplier/invoice Learning candidate; it never copies economics from DELTA or another AFM.

## Next LAB step

- After green CI/deploy, refresh POS and verify that MANTZAVAS 38001 leaves `POS_FAILED` and fills the complete lines before payment.
