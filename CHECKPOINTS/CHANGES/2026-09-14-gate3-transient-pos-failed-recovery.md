# 2026-09-14 — Gate 3: recovery of transient POS background failures

## LAB evidence

- Invoice `2612188` fast header succeeds and reuses the existing payment.
- The draft is created immediately in Orders & Purchases and both source pages are visible in Invoice Inbox.
- The draft remains at `0` lines / `0,00 €` while Inbox remains in “awaiting full read”.

## Diagnosis

- The server already retries transient background transport failures at `0s`, `3s`, `12s`, `30s`.
- After those retries are exhausted the durable job is marked `POS_FAILED`.
- `fast-recover` and `fast-status` currently reclaim only `POS_QUEUED`, `POS_DRAFT_READY`, or stale `POS_PROCESSING` jobs, so a transport-only `POS_FAILED` job can remain permanently stranded even though the draft, photos and payment are intact.

## Planned fix

- Reclaim `POS_FAILED` only when the stored `posBackground.error` matches the existing retryable transport classifier.
- Do not auto-retry configuration, payment, unsafe OCR, or other non-transient failures.
- Resume the same job/page IDs and same existing payment; no duplicate invoice shell.

## Safety

- No new payment or credit.
- No stock movement.
- No approval/finalization.
- CI PASS and LAB reread required before merge.
