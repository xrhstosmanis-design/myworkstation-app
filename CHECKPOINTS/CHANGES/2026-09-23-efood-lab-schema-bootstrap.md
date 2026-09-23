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

## Verification result

- PR: **#1110**, merged to the single central `main`.
- Exact merged/deployed revision: `195a2a27c6c7a8a61d577682215ac432d1d4b582`.
- PR CI **#2837: PASS**.
- Main CI **#2838: PASS**, including server tests, client build and real HTTP E2E flows.
- Render deploy **#1397: PASS**, with exact-revision verification.
- LAB retest on 2026-09-23: **PASS for schema bootstrap and form loading**.
- The `efood / Pelican — Indirect POS` modal now opens in the correct LAB without the previous internal error and visibly loads the SANDBOX fields for Chain ID, Vendor / Store ID, optional external partner config ID, Client ID, Client Secret and Authorization webhook.
- The red label `LAB — ΔΕΝ ΕΧΕΙ ΠΡΟΕΤΟΙΜΑΣΤΕΙ` is expected at this stage because no credentials have yet been saved; it is not a recurrence of the schema/bootstrap failure.
- No credential was entered or exposed, no save was performed and no external sandbox/API call was made during this acceptance test.

## Acceptance status

**LAB PASS — FORM LOAD COMPLETE.**

The schema/bootstrap correction is complete. Credential entry, validation, test-vendor mapping, webhook preparation and any sandbox/API call remain separate approved steps. Live order creation, sales, stock, payments, RBS/EFTPOS, fiscal execution and myDATA/accounting remain disabled.
