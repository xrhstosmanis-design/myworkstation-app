# Phase 1 terminal durable-task reconciliation — 2026-09-19

## LAB evidence

- Status: **LAB FAIL** after exact production `ae876397d65beea243bfb200bc2d8698f581619e`.
- Invoice `12674` still displays `0 items / 0.00 EUR`.
- Its purchase shell shows update time `19/09/2026 10:23`, but the linked OCR job remains `POS_PROCESSING / POS_BACKGROUND` with the older `18/09/2026 07:58` update.
- The unchanged OCR timestamp proves that the durable dispatcher did not claim the eligible job after the lease-recovery deployment.

## Root cause and bounded correction

- Startup backfills a missing `PosInvoiceBackgroundTask`, but a conflicting row used `ON CONFLICT DO NOTHING`.
- An older task already marked `FAILED` or `COMPLETED`, or carrying stale tenant/store scope, therefore remains unclaimable even while its joined AI job is still non-terminal and contains the persisted POS handoff.
- Reconcile only that impossible split state at startup: reset the conflicting terminal or mis-scoped task to `QUEUED`, clear its old lease/error/completion fields and reuse the same job.
- Do not disturb a live `RUNNING` task, a normal queued retry, or an AI job already in a terminal approval/confirmation state.

## Protected behavior

- Reuse the existing attachment, credit/payment identity, AI job, purchase document and purchase-order shell.
- Keep the database task as the only retry owner and retain the lease-token completion guards.
- Do not change OCR extraction, packaging, prices, discounts, VAT or total reconciliation.
- No second upload, duplicate payment/credit/draft, approval, finalization, stock posting, fiscal, accounting or myDATA mutation.

## Verification and acceptance

- Focused durable-worker regressions: **57/57 PASS**.
- Complete server suite: **1308/1308 PASS**.
- Production client/server/Prisma build, syntax and diff checks: **PASS**.
- Require green CI, merge and exact deployed revision before LAB observation.
- Existing invoice `12674` may continue automatically after deployment as diagnostic evidence only, without refresh or resubmission.
- Phase 1 remains **AWAITING LAB** until a future genuinely new invoice completes correctly from one POS-front submission.
