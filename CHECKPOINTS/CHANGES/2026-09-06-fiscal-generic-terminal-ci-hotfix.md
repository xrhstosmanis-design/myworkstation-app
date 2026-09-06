# Checkpoint — Fiscal DRY RUN generic terminal CI hotfix

Date: 2026-09-06
Branch: `agent/fiscal-generic-terminal-ci-hotfix-20260906`
Base revision: `c14787c8274a230a5819eebef9d93afd64fba6f1`

## Cause

- PR #539 generalized the laboratory terminal model and added regression coverage for identifiers such as `LAB-POS-01`.
- The Fiscal Bridge DRY RUN route still accepted only the legacy enum values `POS1` and `POS2`, so CI #1465 correctly failed.

## Fix

- The route now accepts a trimmed, non-empty terminal identifier up to 80 characters.
- Allowed characters remain deliberately restricted to ASCII letters, digits, `.`, `_`, `:` and `-`.
- The submitted identifier must still match the store-scoped payment route during `validateFiscalDryRun`.
- `confirmNoFiscalExecution: true`, tenant isolation, idempotency and all external-execution safety locks remain unchanged.

## Verification

- Targeted Fiscal Bridge tests: 5/5 PASS.
- Full server regression: 1015/1015 PASS.
- Client production build: PASS.
- KAT pre-install readiness invariants: PASS.
- Checkpoint policy and `git diff --check`: PASS.

## Next safe action

- Require green GitHub CI and squash merge before continuing the module access matrix checkpoint.
