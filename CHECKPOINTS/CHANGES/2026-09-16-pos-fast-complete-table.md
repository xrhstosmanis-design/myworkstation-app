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

## LAB follow-up after revision `56735d39`

- A new POS-front run of `27293` again stayed at zero items and moved from `POS_PROCESSING / POS_BACKGROUND` to `POS_QUEUED / POS_RECOVERING`.
- This proves that the complete FAST table did not reach the durable handoff; the old slow provider path was activated again.
- The complete structured-table request was still limited to the former four-field 50-second deadline. Its server deadline is now bounded at 70 seconds and the browser request at 100 seconds, so the server result cannot be cut off by the client first.
- Status remains **LAB FAIL / AWAITING CI and new POS-front LAB**. No payment, draft identity, stock, approval, finalization or fiscal behavior changes.

## LAB follow-up after revision `a3f9a916`

- The POS-front rerun of `27293` ended at `POS_BACKGROUND_AI_RECHECK / FULL_OCR_PROVIDER_FAILURE` with OpenAI timeout and Azure F0 quota `403`.
- The unified full-OCR response schema duplicated the invoice output as global `rawText`, audit `lines` and structured `productLines`, increasing response generation until the bounded provider timeout.
- The bounded correction requests only the header plus structured `productLines`; equivalent audit text and audit lines are rebuilt locally from those same rows before the existing supplier-profile and reconciliation stages.
- Status remains **LAB FAIL / AWAITING CI and new POS-front LAB**. Provider deadlines, payment identity, draft identity, stock, approval, finalization and fiscal behavior remain unchanged.

## LAB follow-up after revision `c7385ffb`

- The POS-front rerun of `27293` again ended at `POS_BACKGROUND_AI_RECHECK / FULL_OCR_PROVIDER_FAILURE` with OpenAI timeout and Azure F0 quota `403`; the draft remained at zero items and `0.00 EUR`.
- Compacting the structured response did not remove the timeout, so duplicate output was not the remaining cause.
- Both full-table vision requests now use minimal reasoning effort, reserving the existing bounded 70-second provider window for visual extraction and structured output.
- Status remains **LAB FAIL / AWAITING CI and new POS-front LAB**. Provider deadlines, payment identity, draft identity, stock, approval, finalization and fiscal behavior remain unchanged.

## LAB follow-up after revision `493adc33`

- Full OCR succeeded from the POS front: the same draft displayed all 16 product rows and gross `74.25 EUR`.
- A BackOffice refresh while the first worker was finishing queued a successor. After the first worker completed the draft, the successor attempted `SAVE_PRODUCT_LINES` again and reported the false failure “Το τιμολόγιο έχει ήδη σταλεί για έλεγχο”.
- A waiting successor now re-reads the durable job status after the active worker ends and stops when the invoice is already `AWAITING_APPROVAL` or `CONFIRMED`.
- Status remains **LAB FAIL / OCR PASS, intake refresh FAIL**. The visible net total is still `74.25 EUR` instead of the printed `65.72 EUR`, so line economics remain unverified.

## Printed VAT summary recovery

- LAB showed that the 16 recovered rows preserved their final gross amounts but the narrow VAT column shifted to `0`, making net and gross both `74.25 EUR`.
- The recovery now accepts a printed VAT footer only when its canonical rate, net and tax form an exact equation with the POS-confirmed invoice total.
- It then converts the preserved line gross amounts back to net amounts and accepts the result only when the reconstructed line totals independently equal the same printed net `65.72 EUR` and VAT `8.53 EUR`.
- Ambiguous summaries, mixed pre-existing VAT rates, or any total mismatch remain unchanged for review; no supplier-wide `13%` assumption is made.
- Status: **AWAITING CI, exact deploy and POS-front LAB**.
- Payment identity, draft identity, stock, approval, finalization and fiscal behavior remain unchanged.
