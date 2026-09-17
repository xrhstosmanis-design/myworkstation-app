# Phase 1 database-owned POS invoice worker — 2026-09-17

## Acceptance state

- Status: **LAB NOT TESTED**.
- Baseline main revision: `637cca348a5b61019a8fa705429601d07c6558a9` (PR `#940`).
- The last final POS-front LAB PASS remains invoice `12665`: 18 rows, `00009 = 24 pieces / 31%`, `02410 = 24 pieces x 0.98 EUR`, and `0.01 EUR` total variance.
- The newer invoice `12674` remains **LAB FAIL**. Local tests and CI cannot supersede that evidence.

## Root cause closed by Phase 1

The POS handoff and source pages were durable, but the executor was an in-process `Map`. A browser status poll or BackOffice refresh had to reschedule work after interruption. A server restart therefore had no server-owned dispatcher, and concurrent polling used an in-memory successor mechanism rather than a database claim.

## Bounded implementation

- Add one `PosInvoiceBackgroundTask` row per primary durable handoff, linked to `AiReaderJob` with `ON DELETE CASCADE`.
- Commit the task before returning the accepted POS response.
- Start a server-side dispatcher when the HTTP server starts; it does not require an open POS page or BackOffice refresh.
- Claim one eligible task atomically with `FOR UPDATE OF t SKIP LOCKED`, a unique lease token, owner and 12-minute expiry.
- On process death, reclaim only an expired lease. Startup also backfills eligible pre-Phase-1 handoffs that have no task row.
- Allow two concurrent workers and at most three durable attempts. Transient failures return to the durable queue after bounded 30/120-second delays; non-transient or exhausted work remains fail-closed.
- Require the current lease token for completion, retry or terminal failure updates. Do not overwrite a job that has already reached `AWAITING_APPROVAL` or `CONFIRMED`.
- Continue using the exact tenant/store/job/path/method/body-scoped signed server capability introduced before this phase.

## Protected behavior

- One existing settlement/payment or credit intent, one attachment set and one draft only.
- The worker reuses the stored `paymentTransactionId`; it does not create a new settlement.
- A deliberately deleted `AiReaderJob` removes its task and cannot be reclaimed.
- Terminal jobs are absent from the claim query.
- No approval, finalization, stock posting, fiscal, accounting, myDATA or invoice-learning behavior changed.
- The protected MANTZILAS row normalizations for `00009`, `02410` and explicit `12 TMX` remain unchanged.

## Local verification

- Focused durable handoff, recovery, invoice and registration regressions: **95/95 PASS**.
- Full server suite: **1303/1303 PASS**.
- Client production build: **PASS**.
- Server/Prisma build: **PASS**.
- Node syntax checks and `git diff --check`: **PASS**.
- Restored the mandatory active list from its last readable revision after PR `#940` had accidentally committed that Markdown path as binary data; added the PR `#940` and Phase 1 entries without discarding prior history.

## Remaining acceptance

Green CI, merge and the exact deployed revision must be verified first. Then run one fresh POS-front invoice exactly once and confirm that it completes automatically after closing/leaving the page, without BackOffice refresh, duplicate settlement/upload/draft, stock posting, approval or finalization.
