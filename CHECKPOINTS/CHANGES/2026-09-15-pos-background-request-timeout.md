# 2026-09-15 — Bound stalled POS background requests

## LAB evidence

The two-page POS invoice 2612188 remained in `POS_PROCESSING / POS_BACKGROUND` with zero lines for more than ten minutes. Recovery kept the durable draft and page handoff, but the in-memory worker could remain occupied by an internal request with no transport deadline.

## Change

- Add a 90-second deadline to every internal POS background request.
- Treat the resulting timeout as retryable through the existing bounded retry schedule.
- Preserve persisted pages and the same POS draft across retry or server restart.
- Add a regression test for the timeout and retry classification.

## Safety

No second invoice, supplier payment, stock movement, approval or finalization is created. Failure remains visible and recoverable instead of hanging indefinitely.
