# 2026-09-14 — Gate 3: recovery of transient POS background failures

## LAB evidence

- Invoice `2612188` fast header succeeds and reuses the existing payment.
- The draft is created immediately in Orders & Purchases and both source pages are visible in Invoice Inbox.
- The draft remains at `0` lines / `0,00 €` while Inbox remains in “awaiting full read”.

## Diagnosis

- The server already retries transient background transport failures at `0s`, `3s`, `12s`, `30s`.
- After those retries are exhausted the durable job is marked `POS_FAILED`.
- `fast-recover` currently reclaims only `POS_QUEUED`, `POS_DRAFT_READY`, or stale `POS_PROCESSING` jobs, so a transport-only `POS_FAILED` job can remain stranded even though the draft, photos and payment are intact.

## Αλλαγές

- Changed the Gate 3 source directly so `fast-recover` considers `POS_FAILED` jobs; no deployment-time text patch is used.
- A failed job is actually reclaimed only when stored `posBackground.error` matches the existing transient transport classifier: `fetch failed`, `ECONNRESET`, `ECONNREFUSED`, `ETIMEDOUT`, or `EAI_AGAIN`.
- Configuration, payment, unsafe OCR and other non-transient failures remain failed and are not automatically replayed.
- Recovery changes the same durable job back to `POS_QUEUED` and schedules the existing background worker with the same page IDs and payment identity.
- `fast-status` also reclaims a failed job only when the same stored transient classifier passes, allowing the existing status polling to resume the same durable job automatically.
- Added source-level regression tests for transient eligibility, guarded status recovery and non-transient exclusion.

## Safety

- Same durable job, same draft, same source photos and same existing payment.
- No new payment or credit.
- No stock movement.
- No approval/finalization.
- PR #827 remains Draft until CI PASS; LAB verification follows merge.
