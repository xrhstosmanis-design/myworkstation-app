# Invoice Learning decimal-comma recovery

## LAB evidence

The FRESH MILK `ΔΑ0011467` row printed `1,620`, quantity `1`, discount `5%`,
VAT `13%` and final value `1,54`. Azure returned the unit price as `1620`,
which inflated the displayed draft from 8,44 € to 8.440 €.

## Change

- For an explicit no-unit declared map, read the mapped numeric tail.
- Repair a 1,000× unit-price scale only when the final printed line value and
  all declared discounts reconcile with the repaired price.
- Preserve unproven values unchanged for review.

## Safety

This affects only the Invoice Learning draft interpretation. It does not post
stock, create or finalize a purchase, alter accounting, payment or credit.

## Verification

- Regression test with `1,620` supplied by Azure as `1620`.
- Existing inline-unit map regression remains covered.
