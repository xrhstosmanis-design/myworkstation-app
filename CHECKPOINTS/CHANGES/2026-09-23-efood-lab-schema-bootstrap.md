# efood / Pelican LAB schema bootstrap repair — 2026-09-23

## Evidence before the change

- Status: **LAB FAIL**.
- Scope: `MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ` only.
- In Platform Super Admin → Ασφαλείς διασυνδέσεις καταστήματος, the efood section returned `Παρουσιάστηκε εσωτερικό σφάλμα` and the form did not load.
- The efood Partner test shop, Vendor ID, Chain ID and newly generated API credentials already exist. No credential value is stored in GitHub or this checkpoint.

## Root cause

`ensureStoreIntegrationSchema()` attempted to discover the existing CHECK constraint for `StoreIntegrationCredential.kind` using a quoted-text pattern against `pg_get_constraintdef`. PostgreSQL may render the column without quotes, so the old constraint could remain undiscovered. Re-adding the canonical constraint with the same name could then fail as a duplicate before the efood LAB endpoint returned its configuration.

## Bounded correction

- Drop the known canonical constraint idempotently.
- Discover and drop every remaining CHECK constraint that references the exact `kind` column through `pg_constraint.conkey` and `pg_attribute.attnum`.
- Recreate one canonical constraint permitting only `MYDATA`, `VAT_LOOKUP` and `EFOOD`.
- Add regression coverage for the repair and for the existing efood fail-closed boundaries.

## Preserved safety boundaries

- efood/Pelican preparation remains restricted to `MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ`.
- Environment remains `SANDBOX`.
- `enabled=false` and `externalCallsEnabled=false` remain mandatory.
- No live webhook acceptance.
- No order or sale creation.
- No stock mutation.
- No payment posting.
- No RBS/EFTPOS or fiscal execution.
- No myDATA/accounting mutation.
- No API secret is written to source code, logs, checkpoints or GitHub.

## Verification state

- Source regression added: `server/test/efood-lab-schema-repair.test.js`.
- CI/build: **AWAITING CI**.
- Deployment: **NOT DEPLOYED**.
- LAB: **NOT RETESTED**.

## Required acceptance

1. Green GitHub CI.
2. Merge to the single central `main`.
3. Verify the exact merged revision is deployed on Render.
4. Ctrl+F5 in Platform Super Admin.
5. Open `MYWORKSTATION LAB` → `ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ` → `Ασφαλείς διασυνδέσεις καταστήματος`.
6. The `efood / Pelican — Indirect POS` form must load without an internal error.
7. Credential entry and any sandbox/API call are separate approved steps; this checkpoint alone does not authorize external calls.
