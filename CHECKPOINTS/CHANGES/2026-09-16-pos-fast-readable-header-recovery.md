# POS FAST readable header recovery — 2026-09-16

## LAB evidence

- A clear single-page STEFANIDIS invoice selected from Payments returned no supplier, document number, date or total.
- The POS displayed that the fast reader exhausted its safe retries and correctly confirmed that no payment occurred.
- The supplied image visibly contains the issuer header and a final payable total of `76.58 EUR`; this is a provider-path failure, not an empty document.

## Bounded change

- Azure remains the primary FAST header provider but releases the request after 20 seconds when it is unavailable or returns no useful header.
- The fallback receives the original invoice image at high detail instead of low detail so small printed header and total text remain readable.
- Both fallback attempts share one 50-second deadline. A fast malformed response may retry, while a timeout cannot start another unbounded request.
- The existing 75-second POS request boundary remains unchanged.

## Safety

- This change runs before payment, credit, draft handoff or stock activity.
- A failed read remains fail-closed and cannot create a payment, purchase document or stock movement.
- Existing payments, drafts, supplier learning and product-line extraction are unchanged.

## Required validation

- Targeted FAST header and durable handoff tests, full server tests and client/server builds must pass.
- CI PASS is not LAB PASS.
- After exact deployed-revision verification, LAB must retry this one STEFANIDIS image once and verify only supplier, invoice number, invoice date and `76.58 EUR`; do not submit payment or credit.
