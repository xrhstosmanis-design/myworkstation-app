# Gate 3 — POS job observability

## LAB evidence

- Revision `277222c1` was confirmed live.
- Refresh at 08:32 did not update invoice 2612188: the same draft remained at 0 lines / 0,00 € with its 08:04 timestamp.
- The recovery attempt therefore needs the stored durable job state/error before any further behavior change.

## Change

- The tenant-scoped purchase-order report returns only the latest linked OCR job status, stage, timestamp and bounded stored background error.
- The BackOffice order row displays those diagnostics under the existing POS draft description.
- The endpoint is read-only. No OCR, payment, draft, line, stock, approval or finalization behavior changes.

## Acceptance

- CI passes.
- In LAB, refresh `Παραγγελίες & Αγορές` and report the `OCR job:` text shown under invoice 2612188.
