# Invoice Learning empty-result guard — 2026-09-15

## Scope

Prevent a failed Azure/AI invoice read from being shown as a successful empty draft.

## Behaviour

- A response with zero product lines returns an explicit NO_PRODUCT_LINES error.
- The AI fallback is instructed to keep every visible product-table row, including repeated supplier codes.
- No empty draft can be confirmed, learned, or used for stock/accounting movement.

## Validation

- Route syntax check passes.
- Regression test verifies the empty-result guard and repeated-row instruction.
- Client build passes.
