# Invoice order review — LAB correction checkpoint

## LAB evidence

- Nature Tech `ΤΔΑ-XV2-00758` reached a safe draft with 4 matched products, net `39,76 €` and invoice total `44,92 €`.
- The OCR/resolution view confirms item `0172` as `NO SUGAR PRO PLUS BANANA 80g`.
- The order grid exposed discounts as database-scale values such as `25.00000000`.
- The line editor preview exposed the binary-decimal edge `15.255` as `15,25 €` instead of the expected two-decimal half-up display `15,26 €`.

## Change

- Monetary presentation is normalized to two decimals with explicit half-up rounding.
- VAT, discount and markup percentages are displayed without redundant trailing zeroes.
- The standard line editor now permits correction and persistence of the invoice-line description before finalization.

## Safety

- No stock, payment, fiscal or finalized-order behavior changes.
- The Nature Tech order remains `NEW`; do not finalize until the corrected production UI is retested.

## Verification

- 22 focused invoice/purchase-order tests: PASS.
- Client production build: PASS.
