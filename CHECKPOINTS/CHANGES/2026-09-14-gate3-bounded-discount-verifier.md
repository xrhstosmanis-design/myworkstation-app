# 2026-09-14 — Gate 3: bounded discount verifier transport

## LAB evidence

- After PR #830 reclaimed invoice 2612188 at 08:04, the same draft still had 0 lines / 0,00 € after the complete observation window.
- The full OCR route had provider deadlines, but its final price/discount verification transport still had no deadline.

## Αλλαγές

- The discount verifier accepts an opt-in transport timeout without changing any validation or calculation.
- Only the POS full-OCR caller supplies the existing 75-second background provider deadline.
- Other discount-verifier callers retain their previous behavior.

## Safety

- No price, discount, quantity, payment, draft, stock, approval or finalization calculation changed.
- The timeout is caught by the verifier's existing failure path; already verified document arithmetic remains intact.
- The same durable job, draft, source photos and payment are preserved.

## Validation

- Regression coverage verifies both the bounded POS call and the unchanged default verifier behavior.
- After restart, BackOffice refresh reclaims the existing stale job.
