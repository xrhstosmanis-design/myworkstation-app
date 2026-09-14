# 2026-09-14 — Gate 3: queued recovery always receives a worker

## LAB evidence

- At 10:57 invoice 2612188 remained at 0 lines with `POS_QUEUED / POS_RECOVERING`.
- Recovery had claimed the durable row while an older in-memory worker still held the same job lock. The scheduler returned without attaching a successor.

## Fix

- Every recovery request stores one coalesced successor while an older worker is active.
- When the active worker settles, the latest queued handoff starts automatically.
- Repeated POS polls/BackOffice refreshes coalesce into one successor and cannot create an infinite worker chain.

## Safety / validation

- Same job, draft, pages and payment; no new charge, stock, approval or finalization.
- 45/45 targeted invoice, recovery and worker-lock tests PASS.
