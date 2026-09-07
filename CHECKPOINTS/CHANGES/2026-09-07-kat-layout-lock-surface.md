# KAT layout lock for Surface

Date: 2026-09-07

## Reference

The KAT Store Mode screen is the binding POS layout for all Windows terminals:

- two-column quick keys at left;
- sale/search panel in the centre;
- keypad and received/change at right;
- category strip below the sale panel;
- fixed action and payment bar at the bottom.

## Change

For desktop widths (851px and above), Surface terminals retain that three-panel KAT geometry. Responsive CSS may scale text but may not reflow quick keys, keypad, categories, or payment controls.

## Gate

CI, Render deployment, then LAB-POS-01 visual comparison with the KAT reference before shift or payment testing.
