# Bounded POS multi-page provider chain — 2026-09-15

## LAB evidence

The two-page invoice 2612188 entered `POS_PROCESSING / POS_BACKGROUND`, then returned to `POS_QUEUED / POS_RECOVERING` with zero lines.

## Root cause

The internal POS request has a 90-second deadline, while the full reader could wait for Azure, then OpenAI, then Azure again for up to 225 seconds. The background worker could repeat that entire sequence four times. Recovery therefore reclaimed a still-running request and the DRAFT appeared stuck.

## Change

- Bound each full provider attempt to 30 seconds.
- For the centrally profiled Stefanidis invoice, read ordered Azure pages sequentially with a 25-second per-page ceiling.
- Allow one OpenAI fallback, but never repeat the same Azure page pass in the same request.
- Limit the durable background worker to one transient retry.

## Safety

The existing payment is reused. No payment creation logic, stock posting, approval, invoice finalization, or supplier conversion logic changes.

## Validation

CI must pass. Then refresh the existing DRAFT after deployment; if it reaches a terminal failure, a single safe reread may reuse the existing payment and DRAFT. Do not finalize during LAB.
