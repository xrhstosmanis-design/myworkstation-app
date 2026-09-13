# 2026-09-13 — LAB refresh PASS; invoice reconciliation remains open

## Evidence

The user supplied BackOffice screenshot `021dfdb7-cc7b-4406-8a28-6f9979f2848d.png` after PRs #789 and #790. It shows the LAB purchase-order list updated at 11:22:16 AM with 3 entries. Invoice 2612188 is visible for ΣΤΕΦΑΝΙΔΗΣ Ι ΑΝΩΝΥΜΗ ΕΤΑΙΡΙΑ, in ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ, as a new/draft order with 38 items. Its description identifies two pages and credit mode.

## Checkpoint result

- PASS: LAB refresh visibly loaded the current list and the existing draft. This advances the prior checkpoint from a POS notification to an actual BackOffice row.
- Confirmed count only: the row displays 38 items. Individual line accuracy and original order still require inspection.
- Open reconciliation: line total 2363.28 EUR, source invoice total 2369.99 EUR, difference 6.71 EUR. The application displays the BackOffice review warning.
- No full Gate 3 PASS. This screenshot does not establish archive state, stock posting, balances, duplicate prevention, or the eight-second POS notice behavior.
- No application code or business data was changed for this checkpoint. Full CI remains required before merging documentation.

## Next step

The user opens the pencil beside invoice 2612188 and supplies the detailed product rows. Compare codes, descriptions, quantities, units, prices, discounts and net values against both source pages before approval. Do not create the invoice/payment again, add an arbitrary balancing line or adjust the source total to conceal the difference.

## Further user evidence and general learning requirement

The follow-up screenshot `a394d473-44f1-493a-ab5d-4c922ecd81bf.png` confirms widespread line errors: retail displays zero, several quantities contain printed retail prices (4.8, 5, 4.3, 1.2), purchase prices and row order are wrong. All 38 rows require review.

The user explicitly requires correction learning for every supplier and every store across the program. Reusable reading columns, units and item identities must be learned from confirmed corrections, while quantities and current prices still come from the new invoice. Implementation is in progress; this is not a learning PASS.
