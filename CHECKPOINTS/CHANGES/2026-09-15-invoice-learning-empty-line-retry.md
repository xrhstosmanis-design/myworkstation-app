# Invoice Learning empty line retry — 2026-09-15

## Scope

Retry one time when AI returns a valid invoice structure with zero product lines.

## Behaviour

- The same uploaded original is reread once with the strict line-table instruction.
- An empty result remains blocked and cannot create a draft.
- No stock, payment, accounting, approval or finalization action occurs.

## Validation

- Regression coverage verifies the retry branch.
- CI runs after this checkpoint update.
