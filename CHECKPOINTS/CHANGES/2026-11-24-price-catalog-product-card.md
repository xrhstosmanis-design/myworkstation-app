# Price catalog product card

24 November 2026. Assigned /root. Source branch `fix/price-catalog-product-card-20261124`. Before source, LAB pending.

From Price Catalog → Sales price audit, open the existing full product card by product ID in the selected store. Reuse existing price-write authorization and VAT-exclusive margin/markup calculations. Keep base-price and explicit store price scope clear, refresh the price audit after saves, and retain filters. Verify read/open/edit/reload and store isolation in LAB.

Implemented the pricing card on product description and price, exact selected-store/base scope on the existing price writer, and a full-card entry for an explicit store. Syntax checks passed. Hosted LAB pending.
