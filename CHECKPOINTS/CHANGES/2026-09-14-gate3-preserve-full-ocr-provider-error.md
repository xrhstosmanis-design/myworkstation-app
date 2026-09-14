# Gate 3 — preserve full OCR provider error

## LAB evidence

- Invoice 2612188 recovered and failed again at 17:12 as `POS_FAILED / POS_BACKGROUND_FAILED`.
- The stored error was the generic all-pages failure, so the failing provider, page and underlying error were lost.

## Change

- Preserve a bounded combined diagnostic containing the unified OpenAI failure plus the exact Azure page and failure.
- Keep the existing durable job, draft, photos and payment.
- No OCR algorithm, price/discount calculation, payment, stock, approval or finalization behavior changes.

## Acceptance

- CI passes.
- LAB refresh retries the legacy generic failure once and exposes the exact provider/page error if it fails again.
