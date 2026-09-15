# Invoice Learning single reader flow — 2026-09-15

## Scope

Remove the duplicate automatic invoice reader from the Learning Lab.

## Behaviour

- One upload starts only the primary Azure/AI reader.
- The quantity/package correction button stays manual-only.
- No stock, payment, accounting, approval or finalization behaviour changes.

## Validation

- Client production build passed locally.
