# Invoice Learning invalid AI response retry — 2026-09-15

## Scope

Recover once from an empty or invalid structured AI response during invoice reading.

## Behaviour

- The original document is sent for one bounded second attempt only when the first response lacks valid structured output.
- Empty invoice drafts remain blocked.
- No payment, stock, accounting, approval, or finalization action occurs.

## Validation

- Regression test covers empty and invalid structured responses.
- Client build passed locally.
