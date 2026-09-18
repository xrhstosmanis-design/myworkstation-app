# Phase 1 MANTZILAS single complete verifier — 2026-09-19

## LAB evidence

- Status: **LAB FAIL** on exact production `1b535650a4bd691b73d7d1480ba7919dc2ed97d1`.
- The repaired durable worker claimed invoice `12674`, moving the linked OCR job from its old timestamp to `08:14`.
- After six minutes and an operator refresh, the draft still showed `0 items / 0.00 EUR`; the job remained `POS_PROCESSING / POS_BACKGROUND` and updated again at `08:21`.
- Six minutes is not acceptable. The previously working POS path completed reading in seconds.

## Root cause and bounded correction

- The central MANTZILAS path first reads the image through bounded Azure.
- When that candidate disagrees with the invoice total, the current request may then run a supplemental table AI pass, repeat Azure field recovery and finally run the complete printed-table/discount verifier.
- These independent provider budgets can exceed the three-minute internal caller deadline. Aborting the loopback client does not cancel the already-running route handler, while durable retry may start another attempt.
- For a central MANTZILAS Azure result, skip the redundant supplemental table and repeated Azure passes. Continue directly to the existing complete printed-table verifier.
- The verifier is not discount-only: it returns every physical row, can rebuild an omitted row, validates the complete per-row economic chain, requires contiguous order, reconciles VAT-footer groups and requires the independent invoice total within `0.05 EUR`.

## Protected behavior

- Other suppliers retain their existing table recheck and Azure recovery behavior.
- Preserve the exact MANTZILAS row verification, discount, VAT, packaging and total-reconciliation rules.
- Reuse the existing attachment, credit/payment identity, AI job, draft and purchase-order shell.
- No second upload, duplicate payment/credit/draft, approval, finalization, stock posting, fiscal, accounting or myDATA mutation.

## Verification and acceptance

- Focused POS/MANTZILAS regressions `50/50`, complete server suite `1309/1309`, production build and diff checks: **PASS**.
- Require green CI, merge and exact deployed revision before observing the existing job.
- Existing invoice `12674` recovery is diagnostic only and must complete without another upload or refresh.
- Phase 1 remains **AWAITING LAB** until a future genuinely new invoice completes correctly from one POS-front submission.
