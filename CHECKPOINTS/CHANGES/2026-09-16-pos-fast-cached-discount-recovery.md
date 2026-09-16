# POS FAST cached discount recovery — 2026-09-16

## LAB evidence

- The end-to-end POS rerun of invoice `43243` created one draft and retained the existing payment.
- Sixteen cached product lines reached BackOffice, but line `340061124` remained `2 × 1.205`, discount `0`, net `2.41` instead of printed `2 × 1.420`, `15% / 0.43`, net `2.41`.
- The job also started a redundant full provider call and ended `POS_FAILED`, even though a complete cached table already existed.

## Root cause and bounded change

- FAST cached product lines bypassed the deterministic raw-row discount verifier.
- The immediate worker received a reduced handoff object without `resumeStoredProductLines`, so it ignored the cached table and called the unavailable providers again.
- Complete cached pages now run through the no-provider arithmetic verifier before finalization.
- The immediate worker receives the same complete handoff identity and cached-line flag stored in the durable job.

## Safety and acceptance

- The verifier accepts a recovery only when printed row arithmetic proves quantity, original price, discount percent/amount and net value.
- Payment reuse, duplicate guards, invoice total reconciliation, draft-only behavior, stock, approval and finalization are unchanged.
- LAB PASS requires a new front-POS run with one draft, no new payment, 16 lines, and `340061124 = 1.420 / 15% / 0.43 / 2.41` without `POS_FAILED`.
