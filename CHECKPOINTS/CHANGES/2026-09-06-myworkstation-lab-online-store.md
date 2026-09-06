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
