# POS discount-verification durable recovery

## LAB evidence

- MANTZILAS invoice `12665` remained at `0 items / 0.00 EUR` after a safe `AI_RECHECK_INTERNAL [discount-verification]` failure.
- BackOffice recovery counted the failure as non-retryable, so refresh could not resume the archived POS handoff.

## Change

- Classify staged internal `discount-verification` failures as retryable, alongside the existing `table-recheck` case.
- Reuse the durable job, archived page and existing draft; do not create another payment or require another upload.
- Keep unsafe OCR results, payment mismatches and missing-line failures non-retryable.

## Safety

- Recovery remains bounded and idempotent.
- No payment, credit, stock, approval, finalization, fiscal or accounting behavior changes.

