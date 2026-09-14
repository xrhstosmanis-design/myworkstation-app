# Gate 3 — filter recoverable failed jobs in code

## LAB evidence

- After revision `4d33312a` became live, invoice 2612188 remained at the old 17:12 failure and generic error.
- Therefore `/fast-recover` did not reclaim the stored legacy failure; the new provider diagnostics never ran.

## Change

- Select tenant-scoped `POS_FAILED` candidates without a database regex.
- Apply the existing tested `isRetryableBackgroundError` guard before any state update.
- Inspect up to 50 candidates while still recovering at most 3 jobs per request, so old non-transient failures cannot starve eligible jobs.
- No payment, OCR algorithm, draft, pricing/discount, stock, approval or finalization change.

## Acceptance

- CI passes.
- One LAB refresh reclaims the existing 2612188 job; a later refresh shows either completed lines or the preserved exact provider/page failure.
