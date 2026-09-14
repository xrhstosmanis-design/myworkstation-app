# Gate 3 — parallel full-OCR timeout recovery

- LAB 11:31–11:35: invoice 2612188 failed again with `POS_FAILED / POS_BACKGROUND_FAILED` and a hidden internal error.
- The duration matched the full-provider fallback path: after the primary reader failed, Azure pages were retried sequentially, consuming one full timeout per page.
- Recovery now runs every invoice page concurrently with `Promise.allSettled`.
- A failed page preserves its exact page number and returns `AZURE_TIMEOUT` with HTTP 503, allowing the durable POS worker to retry automatically instead of leaving a permanent generic failure.
- A non-timeout provider failure remains fail-closed with HTTP 502.
- No payment, credit, stock, approval, or finalization behavior changed.
- Validation: 47/47 targeted tests PASS; syntax and whitespace checks PASS.

