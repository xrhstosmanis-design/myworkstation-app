# POS Invoice OCR — raw-row review guard

## Trigger

Fresh POS invoice `445` reconciled to `34.37 EUR`, but the adjacent supplier rows
`0003012` and `0003013` had exchanged quantities. Aggregate reconciliation alone
therefore cannot be used as confirmation of a physical invoice row.

## Change

- Require a stored row-level OCR transcript to support the structured code,
  quantity and meaningful description words.
- Mark any unsupported structured row `NEEDS_REVIEW`, with an operator-readable
  reason, rather than silently accepting it.
- Preserve `sourceColumnsVerified` across the client finalizers, POS submission
  schema and the background job handoff.

## Boundaries

- This is a generic verification guard, not a supplier-specific correction.
- It does not modify the existing invoice `445`; it remains an unapproved
  diagnostic draft.
- It makes no payment, stock, approval, fiscal, accounting or myDATA change.

## Required evidence

The regression must show the exact `0003012` / `0003013` swapped-row shape is
flagged. CI, deploy and a fresh single-submit POS invoice must pass before LAB
acceptance can be reported.
