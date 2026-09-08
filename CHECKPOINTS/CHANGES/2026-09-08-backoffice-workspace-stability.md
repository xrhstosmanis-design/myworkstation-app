# BackOffice workspace stability

## Scope

- Stops catalogue refreshes from remounting the complete Owner BackOffice workspace.
- Keeps the active tool, selected store and in-progress form state in place while data refreshes.
- Rejects duplicate open events synchronously, before React has committed the visible window state.

## Validation

- `node --test server/test/backoffice-workspace-stability.test.js`
- Existing inventory foundation tests.

## Safety

- UI state only. No POS, EFTPOS, RBS/CapDriver or external device action.
- Intended for LAB verification before any wider use.
