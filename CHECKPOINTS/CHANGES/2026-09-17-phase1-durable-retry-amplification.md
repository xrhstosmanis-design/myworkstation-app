# Phase 1 durable retry amplification — 2026-09-17

## LAB evidence

- Status: **LAB FAIL**.
- Exact production revision: `dde564989fdb49d72b170c1d5548e57fb12c0a0d` (PR `#941`).
- Invoice `12674` was submitted once from the POS. Its existing draft, attachment and settlement identity were preserved.
- After leaving the POS and refreshing BackOffice, the row still showed `0 items / 0.00 EUR` and `POS_PROCESSING / POS_BACKGROUND`.
- This proves that the new database dispatcher claimed the task, but it did not complete within the LAB acceptance window. The draft shell alone is not a Phase 1 PASS because the previous implementation already created it.

## Bounded causal correction

- The database task is now the only owner of a full background retry.
- Remove the older in-lease two-pass OCR retry. A transient failure is persisted as `QUEUED` with the existing 30/120-second durable delays instead of silently repeating inside `POS_PROCESSING`.
- Keep the public Render fallback only for a loopback connection failure.
- Do not replay a completed HTTP error response or a loopback timeout through the public origin: the local handler was reached and may still be finishing, so replaying it duplicates the same expensive OCR operation.
- Keep the existing three-attempt ceiling, atomic lease token, tenant/store/job binding and exact signed internal capability.

## Protected behavior

- Preserve the one existing payment/credit intent, source attachment, AI job and draft for invoice `12674`.
- Do not resubmit or delete the invoice during recovery.
- Preserve complete MANTZILAS reconciliation, printed discounts/economics and explicit `12 TMX` conversion.
- No approval, finalization, stock posting, fiscal, accounting or myDATA mutation is introduced.
- The final accepted baseline remains invoice `12665`; CI PASS is not LAB PASS.

## Verification

- Route syntax: PASS.
- Focused POS handoff, recovery and durable lifecycle tests: **44/44 PASS**.
- Full server suite: **1303/1303 PASS**.
- Client production build and server/Prisma build: **PASS**.
- `git diff --check`: **PASS**.
- Remaining: green CI, merge, exact deployed revision and recovery of the same `12674` job without another upload or settlement.
- Final LAB PASS requires all physical rows and printed gross `366.47 EUR`, with the draft left unapproved and without stock posting.
