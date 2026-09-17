# POS discount-verification durable recovery

## LAB evidence

- MANTZILAS invoice `12665` remained at `0 items / 0.00 EUR` after a safe `AI_RECHECK_INTERNAL [discount-verification]` failure.
- BackOffice recovery counted the failure as non-retryable, so refresh could not resume the archived POS handoff.
- **New POS-front LAB FAIL after PR #928:** the order was updated at `18:15`, while the displayed OCR failure was the historical `15:22` failure. The server had already reclaimed the job as `POS_QUEUED / POS_RECOVERING`, but the same status response still returned `failed: true` and the stale error, so the POS stopped polling the active recovery.

## Change

- Classify staged internal `discount-verification` failures as retryable, alongside the existing `table-recheck` case.
- Reuse the durable job, archived page and existing draft; do not create another payment or require another upload.
- Keep unsafe OCR results, payment mismatches and missing-line failures non-retryable.
- When status atomically reclaims a retryable failed job, report `POS_RECOVERING` rather than the stale failure and keep POS polling active.
- Replace the visible stale error with a recovery marker while retaining the previous error only as diagnostic history.
- Do not queue a successor on every normal `POS_PROCESSING` poll; only a processing job stale for at least one minute is recoverable.

## Safety

- Recovery remains bounded and idempotent.
- No payment, credit, stock, approval, finalization, fiscal or accounting behavior changes.
- Focused recovery tests: **28/28 PASS**.
- Full server suite: **1294/1294 PASS**.
- Client production build and server/Prisma build: **PASS**.
- Status: **AWAITING commit, green CI, exact deploy and POS-front LAB recovery**.
