# POS FAST complete-table handoff — 2026-09-16

## LAB evidence

- New invoice `27293` was submitted only from the POS front for supplier `ΜΙΧΑΛΟΠΟΥΛΟΣ ΔΙΟΝΥΣΙΟΣ ΠΑΝΑΓΙΩΤΗΣ`, dated `03/09/2026`, total `74.25 EUR`.
- FAST correctly returned the supplier/AFM, invoice number, date and total, and the POS accepted the handoff.
- After more than two minutes and a BackOffice refresh, the same draft remained `POS_PROCESSING` with zero items and `0.00 EUR` values.
- The source visibly contains 16 product rows, total quantity 47, net `65.72 EUR`, VAT `8.53 EUR` and payable `74.25 EUR`.
- Status: **LAB FAIL** for automatic full product reading from the POS front. The four-field FAST header remains a separate LAB PASS.

## Bounded causal change

- When Azure FAST is unavailable and the existing OpenAI FAST fallback reads the original page, its one structured response may also return the complete product table.
- FAST rows are forwarded to the already-existing durable handoff only when their finalized gross sum reconciles to the read invoice total within `0.05 EUR`.
- Empty, partial or non-reconciling rows are discarded; the existing fail-closed background path remains authoritative.
- This removes the unnecessary second full-provider call only when the first successful page read already proved a complete table.

## Protected behavior

- Supplier/header matching, duplicate checks and the operator-confirmed invoice identity remain unchanged.
- No payment is created, changed, repeated or reversed by this change.
- No stock posting, approval, finalization, fiscal action or deliberate-draft resurrection is added.
- CI PASS is not LAB PASS.

## Required LAB acceptance

1. Deploy the exact merged revision.
2. Submit one clean invoice from the POS front; do not use BackOffice upload/recovery as the acceptance path.
3. For invoice `27293`, the same draft must automatically reach 16 product rows, quantity 47, net `65.72 EUR`, VAT `8.53 EUR` and gross `74.25 EUR`.
4. Compare the printed line quantities, original unit prices and discounts before any approval.
5. Do not approve, finalize or update stock during this diagnostic test.

## LAB follow-up after revision `83255307`

- A clean POS-front rerun of `27293` again reached `POS_PROCESSING / POS_BACKGROUND` with zero items and `0.00 EUR` values.
- Root cause in the deployed path: Azure returned a useful header and the route returned it immediately even when Azure supplied no complete reconciled product table. Therefore the new OpenAI FAST table schema was never called.
- Follow-up correction: Azure returns immediately only when its own product table reconciles to the invoice total within `0.05 EUR`. A useful header with empty/partial rows is retained as a safe header fallback while the existing FAST OpenAI call reads the table.
- If OpenAI fails, the already-read Azure header is still returned, preserving the four-field behavior and fail-closed background path.
- Status remains **LAB FAIL / AWAITING CI and new POS-front LAB**. Payment, draft identity, stock, approval, finalization and fiscal boundaries remain unchanged.
