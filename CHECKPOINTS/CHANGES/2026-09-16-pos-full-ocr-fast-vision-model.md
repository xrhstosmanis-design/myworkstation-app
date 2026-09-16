# POS full OCR bounded vision model — 2026-09-16

## LAB evidence

- After deploy `1757a419`, invoice `43243` was reclaimed without a new upload or payment.
- Azure F0 again returned the known quota `403` immediately.
- The general OpenAI invoice model still exceeded the enlarged 70-second full-table budget on the clear 16-row page.
- FAST vision had already read the same source header correctly, proving that the image and OpenAI connection are usable.

## Bounded change

- Full extraction, supplemental table extraction and discount diagnostics now share `OPENAI_INVOICE_FULL_MODEL`, falling back to `OPENAI_INVOICE_FAST_MODEL` and then `gpt-5-mini`.
- The full-table path no longer inherits the slower general reasoning model.
- The existing 70-second provider and 180-second background request limits remain unchanged.

## Safety and LAB acceptance

- Payment reuse, duplicate guards, financial reconciliation, draft-only behavior, stock, approval and finalization are unchanged.
- After CI and exact deploy, one BackOffice refresh must reclaim the same failed draft; no new POS upload is required.
- PASS requires 16 lines and line `340061124` with unit price `1.420`, discount `15%` / `0.43 EUR`, net `2.41 EUR`.
