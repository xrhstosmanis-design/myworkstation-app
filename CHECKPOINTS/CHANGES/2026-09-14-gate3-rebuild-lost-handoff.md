# Gate 3 — rebuild lost durable handoff

## LAB evidence

- Recovery reported `scanned 2, started 0, no-handoff 2, non-retryable 0`.
- The jobs are eligible but their `posHandoff` was overwritten after an AI success.

## Change

- Merge AI results into `resultJson` so future durable handoffs survive.
- Permit the internal `AI_COMPLETE` bridge state for product-line save and draft intake.
- For an existing failed POS draft with stored product lines, rebuild the handoff only from the same tenant/store `POS_OCR_DRAFT`, its already linked payment, and jobs created in the exact same database transaction.
- Reuse stored lines without a new OCR/provider call; never create a payment.

## Acceptance

- CI passes.
- LAB refresh resumes invoice 2612188 using the same draft, two photos and existing payment.
- Expected final review remains 38 lines / 608 pieces / 2.369,99 € before any approval or stock action.
