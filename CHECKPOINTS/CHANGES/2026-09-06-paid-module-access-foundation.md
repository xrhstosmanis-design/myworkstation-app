# Checkpoint — Paid module access foundation

Date: 2026-09-06

## Scope

- Registered the approved future modules in the single module catalog, commercially locked until implementation is complete.
- Changed the module middleware so Platform Super Admin has permanent access to every module, including support-context sessions.
- Added a default employee restriction for owner-only financial, analytics and evaluation modules. A narrowly scoped explicit `MODULE:<KEY>` permission remains possible.
- Added optional per-store module overrides on top of the existing company entitlement. When no store override exists, the current company entitlement remains authoritative, preserving existing installations.
- Extended the existing Super Admin store-module endpoint so it can read and write all catalog modules while preserving the personnel package response contract.
- Updated `/api/license/current` so Super Admin receives every module and other roles receive only the modules their role may use.
- Added a CI policy that rejects implementation/configuration changes unless the active unified list and a new checkpoint are included in the same PR.

## Safety boundaries

- No production database migration, seed, data deletion or module activation was executed.
- No fiscal, CapDriver, RBS, EFTPOS or external provider command was added or executed.
- Future modules remain `commercialReady: false` until their own implementation, tests and checkpoint are complete.
- Existing company entitlements remain the fallback when a store has no explicit override.

## Tests required before merge

- `node --test server/test/module-access.test.js server/test/module-catalog.test.js server/test/checkpoint-policy.test.js`
- `npm test -w server`
- `npm run build`
- GitHub CI must be green before merge.

## Next step

After merge and deployment, verify three live profiles: Super Admin sees every module, an owner sees only active licensed modules, and an employee cannot open sensitive analytics/financial/evaluation modules without an explicit limited permission.
