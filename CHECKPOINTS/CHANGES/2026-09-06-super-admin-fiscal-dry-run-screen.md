# Checkpoint — Platform Super Admin Fiscal Bridge DRY RUN

Date: 2026-09-06

## Scope

- Added a protected `Fiscal DRY RUN` action to the existing Platform Super Admin screen.
- Added a fail-closed safety banner that enables execution only when `mode=DRY_RUN`, `externalExecution=false`, `fiscalIssuance=false`, `capDriverWrite=false` and `rbsWrite=false` are all returned by the server.
- Added a read-only candidate list containing only completed `NON_FISCAL` sales with an existing POS/RBS routing attempt.
- Added controlled Super Admin store selection while preserving company/store isolation for Owner and Admin users.
- Shows the idempotency key, payload hash, validation state and explicit `ΧΩΡΙΣ ΕΚΤΕΛΕΣΗ` result.

## Safety boundaries

- No call to RBS, CapDriver, EFTPOS, printer or another external provider was added.
- No `FiscalDocument` is created and no `Sale` row is updated.
- The POST still requires `FISCAL_BRIDGE_TEST_MODE=true` and the literal `confirmNoFiscalExecution=true`.
- A mismatched total, terminal route, missing mapping or already fiscalized sale stops with a validation error.

## Verification

- Focused Fiscal Bridge tests: 4/4 PASS.
- Full server suite: 1007/1007 PASS before branch synchronization.
- Frontend production build: PASS.
- GitHub PR: #538; merge is allowed only after green CI.

## Next step

After deployment, run one selected HOME PC DRY RUN, repeat the same sale to confirm idempotent replay, and verify that no receipt or RBS/CapDriver event occurred.
