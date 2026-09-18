# Phase 1 orphaned POS worker lease recovery — 2026-09-18

## LAB evidence

- Status: **LAB FAIL** on exact production `5d49fcbfb27f1ca65930af806149a9044d63468c`.
- The POS accepted invoice `12674` without an operator refresh and the BackOffice shell was updated at `18/09/2026 10:23`, but it remained at `0 items / 0.00 EUR`.
- The shell exposed `POS_PROCESSING / POS_BACKGROUND`, while the linked OCR job still showed its older `18/09/2026 07:39` update. The new handoff therefore did not obtain live worker progress.
- This same-number submission is diagnostic because no different physical invoice is currently available. It does not convert Phase 1 to LAB PASS.

## Root cause boundary and bounded correction

- A database-owned background task uses a lease so only one server instance performs the full OCR operation.
- The lease lasts twelve minutes and has no heartbeat. After an instance stops, a task can remain marked `RUNNING` until that long lease expires; a malformed legacy `RUNNING` row with missing lease fields is not claimable at all.
- Shorten the lease to 90 seconds and renew it every 30 seconds while the owning worker is alive. A live worker therefore keeps exclusive ownership, while a stopped instance becomes recoverable automatically within a bounded window.
- Requeue only structurally orphaned `RUNNING` tasks whose lease token, owner or expiry is missing, and allow the dispatcher to claim a `RUNNING` task whose expiry is null or elapsed.

## Protected behavior

- Keep the durable database task as the only retry owner and retain lease-token checks on completion, retry and terminal failure.
- Do not add browser or BackOffice refresh ownership and do not replay one active worker concurrently.
- Preserve the existing attachment, payment/credit, AI job, draft and invoice identity.
- No duplicate payment, duplicate credit, duplicate draft, approval, finalization, stock posting, fiscal, accounting or myDATA mutation.
- Do not change OCR row extraction, supplier packaging, prices, discounts, VAT or invoice-total reconciliation.

## Verification and LAB acceptance

- Focused durable-worker, recovery, reconciliation and invoice regressions: `99/99 PASS`.
- Complete server suite: `1307/1307 PASS`.
- Production client/server/Prisma build, syntax and diff checks: PASS.
- Require green CI, merge and verification of the exact deployed revision.
- After deploy, the existing `12674` may continue automatically without refresh as diagnostic evidence only.
- Phase 1 remains **AWAITING LAB** until one future genuinely new invoice is submitted once from the POS and completes automatically with correct rows/economics, without refresh, a second upload, duplicate settlement, stock posting or finalization.
