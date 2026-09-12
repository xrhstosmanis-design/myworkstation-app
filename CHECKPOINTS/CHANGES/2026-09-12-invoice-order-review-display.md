# Invoice order review — LAB correction checkpoint

## LAB evidence

- Nature Tech `ΤΔΑ-XV2-00758` reached a safe draft with 4 matched products, net `39,76 €` and invoice total `44,92 €`.
- The OCR/resolution view confirms item `0172` as `NO SUGAR PRO PLUS BANANA 80g`.
- The order grid exposed discounts as database-scale values such as `25.00000000`.
- The line editor preview exposed the binary-decimal edge `15.255` as `15,25 €` instead of the expected two-decimal half-up display `15,26 €`.
- After deploy, the four visible net values added to `39,76 €`, while the footer added their hidden extra decimals and displayed `39,75 €`.

## Change

- Monetary presentation is normalized to two decimals with explicit half-up rounding.
- VAT, discount and markup percentages are displayed without redundant trailing zeroes.
- The standard line editor now permits correction and persistence of the invoice-line description before finalization.
- The detail footer adds the same two-decimal net line values that are displayed to the user.

## Safety

- No stock, payment, fiscal or finalized-order behavior changes.
- The Nature Tech order was kept `NEW` until the corrected production UI passed the final LAB retest.

## Verification

- 22 focused invoice/purchase-order tests: PASS.
- Client production build: PASS.

## Final LAB result

- PR #708, CI #1829 and merge `44f9b570` into `main` completed successfully.
- Initial prices `1.40 / 1.05 / 1.05 / 1.50`, first discount `25%`, net line values `10.50 / 7.88 / 7.88 / 13.50` and VAT `13%` matched the source document.
- The economic control reported invoice total `44.92`, four-line total `44.92`, difference `0.00` and status `ΣΥΜΦΩΝΕΙ`.
- The footer displayed net `39.76` and gross `44.92` after deploy.
- Order `ΤΔΑ-XV2-00758` was finalized only after the PASS and stock increased exactly once by `10 + 10 + 10 + 12 = 42` units.
- Final status: `ΟΚ`. The test does not require the separate `Τιμολόγηση` action.
