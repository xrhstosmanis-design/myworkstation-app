# MANTZILAS scaled quantity/discount ambiguity

## LAB evidence

- Invoice `12665`, supplier code `00009`, was published as 48 pieces with 65.5% discount.
- The printed row is 24 pieces with 31% discount.
- Both representations produce the same `13.49 EUR` net value, so line and invoice totals alone cannot distinguish them.

## Change

- Detect the doubled-quantity/equivalent-discount ambiguity during the authoritative MANTZILAS reread.
- Repair it only when another row in the same document independently establishes the same unit price and one unambiguous discount percentage.
- Require the repaired quantity, price, discount and net arithmetic to balance before accepting it.
- Preserve supplier-code/index identity and the whole-invoice total gate.

## Safety

- No payment, credit, stock, approval, finalization, fiscal or accounting behavior changes.
- Focused POS invoice tests: 39/39 passed.
- Full server suite: 1287/1287 passed.

