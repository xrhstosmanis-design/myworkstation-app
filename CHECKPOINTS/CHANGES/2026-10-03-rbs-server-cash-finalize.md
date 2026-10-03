# Server-side RBS CASH finalization

Date: 2026-10-03

After a physical receipt is written, the Writer dispatch-result is the authoritative transition to DISPATCHED. CASH sale finalization now runs on the server at that transition instead of depending on the browser. It locks the same request, checks idempotency by clientTransactionId, writes the sale and lines from the saved checkout snapshot, marks fiscal status ISSUED, and closes the request as SALE_COMMITTED. No fiscal resend occurs.
