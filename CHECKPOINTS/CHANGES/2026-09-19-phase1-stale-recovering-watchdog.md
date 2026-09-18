# Phase 1 stale POS_RECOVERING watchdog — 2026-09-19

## LAB evidence

- Invoice `12674` remained `POS_QUEUED / POS_RECOVERING` from 17:00 onward.
- Its old, unapproved `12`-row / `430.29 EUR` draft was correctly preserved, but no worker claimed the queued reread.
- A durable retry that remains queued for hours is a dispatcher failure, not an acceptable provider delay.

## Root cause and bounded correction

- Retry state is stored separately on `AiReaderJob` and `PosInvoiceBackgroundTask`.
- Startup previously repaired only terminal or mis-scoped tasks, allowing a stale `QUEUED` task to survive unchanged.
- The five-second dispatcher previously claimed only the task table and did not reconcile a stale authoritative `POS_QUEUED / POS_RECOVERING` job.
- Startup now resets every eligible active task unless it owns a complete, unexpired `RUNNING` lease.
- Every dispatcher sweep now makes a recovering job older than three minutes immediately claimable when there is no live lease.

## Safety boundaries

- The watchdog preserves the existing attempt count; normal maximum-attempt handling remains authoritative.
- A live worker lease is never interrupted or duplicated.
- The same attachment, handoff, payment/credit identity, AI job and unapproved draft are reused.
- No upload, duplicate payment/credit/draft, approval, finalization, stock movement, fiscal command, accounting entry or myDATA mutation.

## Acceptance

- Focused durable recovery regressions `53/53`, complete server suite `1311/1311`, production build, syntax and diff checks: **PASS**.
- Require green CI, merge and exact deployed revision.
- Automatic recovery of existing `12674` is diagnostic only.
- Phase 1 remains **AWAITING LAB** until a future new invoice succeeds correctly from one POS-front submission.
