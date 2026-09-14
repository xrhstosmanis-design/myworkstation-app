# Gate 3 — show recovery outcome

## LAB evidence

- With revision `7e6f22f8` live, invoice 2612188 still showed the unchanged 17:12 generic failure.
- The BackOffice client discarded both the `/fast-recover` success payload and any endpoint error, hiding why no worker started.

## Change

- Return aggregate safe counters for scanned, started, missing-handoff and non-retryable candidates.
- Display that result, or the endpoint error, beside the existing report refresh timestamp.
- No job data, provider logic, payment, draft, price/discount, stock, approval or finalization mutation was added.

## Acceptance

- CI passes.
- One LAB refresh shows the exact recovery outcome immediately; no waiting or repeated upload is required.
