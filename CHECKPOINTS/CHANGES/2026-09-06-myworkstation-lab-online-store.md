# Checkpoint — MYWORKSTATION LAB / multi-store Online Store

Date: 2026-09-06
Branch: `agent/kat-home-readiness-20260906`
Base revision: `8aeb9b934f88b763d0e568ca88ee9a96596aab06`

## Completed in code

- Renamed the test concept to the generic permanent laboratory model: `MYWORKSTATION LAB` / `ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ`.
- Online ordering POS and BackOffice routes now resolve the authenticated store by `companyId + storeId`, not by the KAT store name.
- Public online ordering already uses each store's unique `OnlineOrderingConfig.publicSlug`; modifier ordering now gives each store its own serial namespace (`KAT-###` only for legacy KAT, `ONL-###` for other stores) with a transaction advisory lock.
- Print payloads and POS print windows use the current store name.
- Store POS online-order UI is no longer limited to a KAT store name; any authenticated store with the licensed module can use it.
- Fiscal Bridge remains DRY RUN only, but accepts generic terminal identifiers such as `LAB-POS-01` and uses the generic envelope version `MWS_FISCAL_DRY_RUN_V1`.

## Verification

- `npm run build`: PASS
- `npm test -w server`: 1014/1014 PASS
- `node server/e2e/kat-preinstall-readiness-invariants.mjs`: PASS
- `git diff --check`: PASS
- No production store, account, fiscal device, EFTPOS device or real order was created by this checkpoint.

## Still pending / safe next action

- Create the actual tenant/store record in Platform Admin only after the owner-account choice is confirmed at action time.
- Activate only CORE, PERSONNEL, SHIFTS, INVENTORY, POS, STORE_MODE, CASH_CONTROL and ONLINE_ORDERING for the lab; leave RBS/Netlink/fiscal execution unactivated.
- Create `LAB-POS-01` and `LAB-POS-02`, then run the shared-stock/separate-shift/online-order test matrix in the lab.

## Unified test rule for all pages

- All future development pages, QA pages and test sessions must use only this permanent laboratory: `MYWORKSTATION LAB` / `ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ`.
- Do not create another test tenant and do not use the name `ΚΑΤ` for new test data.
- Every test must be tagged with the lab store and, where applicable, `LAB-POS-01` or `LAB-POS-02`.
- Real KAT testing remains a separate final validation stage after the lab test matrix is green.

## Current action checkpoint — 2026-09-06

- Code merged to `main` through PR #539 (`c14787c8274a230a5819eebef9d93afd64fba6f1`).
- Owner creation was authorized for `xrhstosmanis@gmail.com`.
- Platform Admin currently has a UI blocker: the `Νέος πελάτης` button does not open its creation form in the authenticated production page. No tenant, account, store, terminal, fiscal device or real order was created.
- Resume from Platform Admin repair, then create the lab and append its IDs/activation links here before any cross-page test.

## Platform Admin creation result

- Tenant created: `MYWORKSTATION LAB` (Enterprise, active).
- Store created: `ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ` — store id `cmtpopbgo000trhb5ng9ytiru`.
- Owner: `Υπεύθυνος Εργαστηρίου` / `xrhstosmanis@gmail.com`.
- Terminal created: `LAB-POS-01` (`Εργαστήριο Ταμείο 1`), awaiting one-time installation.
- Terminal created: `LAB-POS-02` (`Εργαστήριο Ταμείο 2 — Online`), awaiting one-time installation.
- One-time activation links for both terminals were issued in Platform Admin. Tokens are intentionally not stored in the repository; use the links shown there on the matching PCs.
- LAB-08 terminal setup is complete; fiscal/RBS/EFTPOS mapping remains intentionally unconfigured and DRY RUN only.
- Readiness audit: company/store are active Enterprise and the safe pilot modules were enabled (11 total, including inventory, POS, online ordering and cash-control audit). Remaining gaps are active store employee/PIN, Store Mode responsible, backup confirmation and base/design lock. Real KAT-only checks (PIN entry, shift open/close, Kiosk Manager) remain deliberately untested in the lab.
- Workforce v2 role created: `Χειριστής Εργαστηρίου` (`LAB_OPERATOR`).
- Workforce v2 employee created: `Εργαστήριο Χειριστής 1`, base store `ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ`, €5/hour. PIN remains to be set through the secure UI and is not stored in the checkpoint.
- Workforce v2 PIN implementation added: optional 4–8 digit PIN field, bcrypt hash only, `hasPin` status only, and additive migration `20260906120000_workforce_employee_pin`.
- After deployment set the PIN from Workforce v2 → Εργαζόμενοι → Εργαστήριο Χειριστής 1 → Επεξεργασία. Leave blank when editing to retain the current PIN.
- Fiscal Bridge DRY RUN now accepts generic lab terminal identifiers such as `LAB-POS-01`/`LAB-POS-02` while remaining strictly non-fiscal and non-executing.
- Live fix queued in PR #548: Workforce bootstrap now creates `WorkforceEmployee.pinHash` idempotently before Prisma reads the employee table; this resolves the live internal error on deployments where migrations have not run.
