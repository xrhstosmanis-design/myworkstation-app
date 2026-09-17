# POS-front MANTZILAS full verification after aggregate mismatch — 2026-09-17

## LAB evidence and acceptance rule

- Current status is **LAB FAIL**: the one POS-front submission of MANTZILAS invoice `12424` created the expected single credit draft, but the background reader ended at `POS_FAILED / POS_BACKGROUND_FAILED` with zero lines.
- The corrected header remains protected: supplier MANTZILAS, invoice `12424`, date `11/09/2026`, gross `318.74 EUR`, never the account balance `4,531.01 EUR`.
- BackOffice refresh/recovery is diagnostic only. It is not acceptance. PASS requires one fresh invoice submitted once from the POS front and completed automatically with the printed rows and total.

## Bounded causal change

- The MANTZILAS discount-verification selector currently excludes every Azure row marked `sourceColumnsVerified`, even when the sum of those rows disagrees with the confirmed invoice total.
- A row-level flag cannot prove the completeness/correct alignment of the whole table when the aggregate total already fails.
- When and only when the current single-page MANTZILAS table differs from the confirmed invoice total by more than `0.05 EUR`, send the complete current-page table through the existing current-image full-row verifier, including rows carrying `sourceColumnsVerified`.
- Keep the existing no-provider fast path unchanged when the full table already reconciles.

## Protected behavior

- Preserve the final POS-front LAB PASS for invoice `12665`, including 18 rows, `00009 = 24 pieces / 31%` and `02410 = 24 pieces x 0.98 EUR`.
- Preserve one payment/credit and one draft only. Do not create another payment, credit, draft or source attachment through recovery.
- Do not approve, finalize, post stock, change fiscal/accounting behavior or resurrect a deliberately deleted draft.
- CI PASS is not LAB PASS.

## Required verification

- Focused invoice/POS regression tests, full server suite, client build and server/Prisma build.
- Green GitHub CI, merge and exact production revision.
- One fresh POS-front MANTZILAS invoice submission. It must populate correct rows automatically without BackOffice refresh, second upload or second settlement action.

## Local verification

- Focused invoice/POS tests: **73/73 PASS**.
- Full server suite: **1299/1299 PASS**.
- Client production build: **PASS**.
- Server/Prisma build: **PASS**.
- `git diff --check`: **PASS**.

Status: **LAB FAIL / local implementation verified; awaiting CI, merge, exact deploy and fresh POS-front LAB**.
