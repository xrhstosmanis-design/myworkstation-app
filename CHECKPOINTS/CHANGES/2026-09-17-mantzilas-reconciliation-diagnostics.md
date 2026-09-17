# MANTZILAS reconciliation diagnostics — 2026-09-17

## LAB evidence

- PR `#935`, CI `#2425` and exact production `a2c68311721fcc4635c9ebdf50aeb068b13810dc` preserved the POS handoff through the generic Azure route.
- The same invoice `12424` progressed through the POS-specific reader but failed at `21:04` local time with `POS_FAILED / POS_BACKGROUND_FAILED` and `POS_BACKGROUND_AI_RECHECK: AI_RECHECK_INTERNAL [discount-verification]`.
- The draft remains at zero lines. It must not be uploaded, credited, deleted, approved, finalized or posted again.

## Bounded correction

- The current stage label covers discount verification, final MANTZILAS deterministic recovery, VAT-summary recovery and the final exact-total gate, hiding whether the failure is a provider exception or an intentional incomplete-table rejection.
- Record a bounded reconciliation stage containing only line count, calculated gross, confirmed invoice gross, difference and provider-failure count immediately before the exact-total gate.
- Preserve the incomplete candidate table only as diagnostic data; do not publish it to the draft or stock.
- Keep this stage eligible for recovery after the next corrective deploy.

## Acceptance

- Require focused/full tests, builds, green CI, merge and exact deploy.
- Diagnostic deployment is not LAB PASS. It must reveal the exact safe mismatch evidence for the same stored attachment without another upload/credit.
- Final PASS still requires the same `12424` draft to recover the printed rows and reconcile to `318.74 EUR`.
- Focused regression tests: **73/73 PASS**.
- Full server suite: **1299/1299 PASS**.
- Client build and server/Prisma build: **PASS**.
- Status: **LAB FAIL / diagnostic implementation verified locally; awaiting CI, exact deploy and same-draft diagnostic recovery**.
