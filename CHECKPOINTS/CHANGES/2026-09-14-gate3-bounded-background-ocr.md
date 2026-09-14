# 2026-09-14 — Gate 3: bounded background OCR providers

## LAB evidence

- Invoice 2612188 entered background processing at 07:47 and still showed 0 lines / 0,00 € after 07:53.
- Both source photos remained attached under the same intake UUID and the existing payment remained preserved.
- The job stayed in processing instead of completing or becoming eligible for transient failed recovery.

## Αλλαγές

- Every external provider call in the full multipage OCR route now has a 75-second deadline.
- A timed-out unified OpenAI read can continue through the existing all-pages Azure fallback.
- Azure page recovery is also bounded, so no provider request can leave the durable job processing forever.
- Provider timeout errors are classified as transient background errors and remain eligible for the existing guarded recovery.

## Safety

- No FAST-header, payment, credit, draft, stock, approval, price or discount calculation changed.
- The same durable job, draft, source photos and existing payment are reused.
- Non-transient OCR, payment and configuration errors remain excluded from automatic recovery.

## Validation

- Added regression coverage for bounded full-OCR provider calls and transient timeout classification.
- After restart, normal BackOffice refresh can reclaim the existing stale POS_PROCESSING job.
