# Checkpoint — Read-only role/module access matrix

Date: 2026-09-06

## Scope

- Added a Super Admin-only, read-only endpoint that evaluates the effective module access of a real store.
- Added a visible `Έλεγχος δικαιωμάτων` action in the customer store controls.
- The matrix reports every catalog module for Super Admin, owner, employee and employee with an explicit limited permission.
- Company license status, module dates and store overrides are evaluated fail-closed for customer roles.
- Super Admin access remains permanent even when the customer license is inactive.

## Safety boundaries

- The check performs no write, activation, entitlement, user, store or permission change.
- Commercially locked modules remain locked.
- No production database migration, seed or data deletion is included.
- No fiscal, CapDriver, RBS, EFTPOS or provider command is sent.

## Verification

- Targeted module and role tests: 13/13 PASS.
- Full server regression: 1018/1018 PASS.
- Client production build: PASS.
- KAT pre-install readiness invariants: PASS.
- Checkpoint policy and `git diff --check`: PASS.
- GitHub CI remains required before merge.

## Next step

After deployment, open a real store from Platform Admin and run `Έλεγχος δικαιωμάτων`. Confirm that Super Admin is `ΠΑΝΤΑ`, owner access follows active entitlements and employee access excludes sensitive owner-only modules. Then mark `MOD-01` / `DEV-12` complete and continue with `MOD-02`.
