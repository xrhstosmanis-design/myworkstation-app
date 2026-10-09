# Customer Windows demo — preparation foundation

Owner: `codex/customer-demo-windows-20261009`. Claim PR1944 / CI37883796617 SUCCESS / main `f2f570d8032f6bb04fb70358dac0225c7e3d38f4` precedes source edits. Checkpoint: `CHECKPOINTS/CHANGES/2026-10-09-customer-demo-windows.md`.

This is the first inactive foundation in the existing MyWorkStation repository, not a customer installer. No new route, feature toggle, service, migration, database write or provider call is added. Importing the module has no operational side effects. No preparation may be treated as an authenticated server readiness response.

`prepareCustomerDemo` creates a fresh UUID namespace for one company and one store, a fixed 16-product synthetic supermarket catalog, exact integer-cent prices, an opening-stock proposal, and a 50 × 40 mm DEMO label specification. Company/store remain inactive. Sales, payments, shifts, movements, users, sessions and providers start empty. It copies no real/LAB records and supplies no credentials. The immutable output says `PREPARATION_ONLY` and `installable: false`. Prices and VAT values are invented demonstration fixtures, not fiscal advice. Provisioning must later translate this proposal through the existing business schema and authenticated server lifecycle; it cannot insert this JSON blindly.

`assertCustomerDemoAction` is an unwired future predicate. Its caller must load a trusted persisted lifecycle record and an existing verified session, then retain all existing company/store/role/module/license checks. The predicate rejects mismatched identities, foreign stores/companies, inactive/revoked/expired records, unbound POS operators and unknown/external actions. An owner and a store-bound POS operator resolve the same explicit store. A forged request-body record/session can satisfy a pure predicate; this is why no route or installer consumes it yet. The predicate neither establishes persisted lifecycle nor certifies complete outbound protection.

Remaining, in order:

1. Add persisted server-owned lifecycle and SA-only provisioning/revocation with two independent synthetic customer demos and an untouched control. Choose personal invitation/authentication and preserve existing license/module gates.
2. Enforce outbound exclusions in every applicable route, settings path and background worker; test zero provider calls including forged settings, expiry/revocation during jobs and idempotent replay. A single checkout guard or disabled module is insufficient.
3. Connect the existing full POS and Backoffice to a visible DEMO context and common selected store without session/store leakage. Prove one identified cash sale changes only that demo's payment, stock, shift, report and Audit; replay must add nothing.
4. Issue authenticated readiness only after all server requirements pass. Build the Windows package with separate POS/Backoffice shortcuts using personal authentication, no embedded passwords/tokens, and no fiscal/card drivers. Preserve the separately owned physical KAT/RBS installers.
5. Run isolated PostgreSQL/HTTP regression, exact-revision CI/release verification and actual Windows install/reopen/uninstall acceptance. Do not call CI or this synthetic preparation LAB/USER PASS.

Full customer demo remains OPEN / NOT TESTED. No download is ready to send to customers.

## Published evidence

Source PR1945 / d7c9c1733648e740a8be38e3c3b2bccac51c9ca2 / full CI37884321450 SUCCESS / 1957 tests, zero failures/skips / main eba858d32617a4b4c0023b4fa7a6853072739299. Existing production build/invariants, isolated PostgreSQL16/HTTP flows and existing Windows smoke checks succeeded. Targeted Node20.20.2 tests: 8/8 PASS. No runnable customer demo, provider-exclusion E2E, demo-specific Windows or LAB/USER acceptance occurred. Next action and retained owner are recorded in the final handoff checkpoint.
