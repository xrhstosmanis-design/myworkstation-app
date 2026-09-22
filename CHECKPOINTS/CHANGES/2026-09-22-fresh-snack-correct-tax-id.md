# FRESH SNACK correct supplier tax ID — 2026-09-22

## LAB evidence and root cause

After exact deployment of the wrapped-row repair, Invoice Learning still showed `18 products` for document `006019`. The current screen proves supplier tax ID `999162880`. The central seed was keyed to mistyped `099162880`, so exact tax-ID resolution correctly found no Fresh Snack profile and never invoked the new repair.

## Bounded correction

The built-in `FRESH_SNACK_COMPLETE_PRINTED_TABLE` profile is now keyed to the actual current-document tax ID `999162880`. No product quantities, prices, discounts or totals are added to the profile. The previously deployed current-image-only pair and footer validation remains unchanged.

## Acceptance

- Local focused and complete server regression suites must pass.
- Require green PR CI, merge and exact Render revision.
- LAB must refresh with `Ctrl+F5` and upload document `006019` once. Accept only 9 reconstructed products with the printed `88.49 EUR` net, `11.50 EUR` VAT and `99.99 EUR` total. Do not confirm an 18-row result.
