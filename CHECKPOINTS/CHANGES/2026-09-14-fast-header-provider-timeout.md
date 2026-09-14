# 2026-09-14 — FAST header provider deadline

## LAB evidence

- The same two invoice pages that previously returned their basic header in about 7 seconds failed three consecutive times.
- The POS displayed its 30-second request timeout before any transaction, payment, draft or durable background job was created.

## Αλλαγές

- The Azure call used only by the POS FAST header now has a 9-second deadline, including submission and polling.
- A slow Azure header therefore reaches the already configured OpenAI fallback before the POS request reaches its 30-second deadline.
- The OpenAI FAST fallback has its own 17-second deadline, keeping the complete server path below the client deadline.
- Full background V2.4.4 OCR keeps its existing longer Azure behavior.

## Safety

- No payment, credit, draft, stock, approval or finalization behavior changed.
- A provider timeout still fails before any transaction is executed.
- Existing invoice payments and drafts are untouched.

## Validation

- Added regression coverage for the Azure deadline, fallback budget and unchanged opt-in timeout behavior.
- LAB must repeat only the initial two-page FAST header read before any payment action.
