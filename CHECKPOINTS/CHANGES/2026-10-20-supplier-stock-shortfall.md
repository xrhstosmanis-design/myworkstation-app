# Supplier recorded-stock shortfall — source implementation

## 20/10/2026 - CENTRAL-SUPPLIER-SHORTFALL-01 / SOURCE IMPLEMENTED / AWAITING CI AND LAB

Owner `codex/central-four-streams-20261018`, branch `codex/supplier-stock-shortfall-20261020`, #2705/#2527. Before-source claim #2945 head d2130c9a, independent review PASS and CI39429002928 all5 SUCCESS (3652 server/0FAIL/0SKIP +8 backup), merged21b265ae30518b64bd3239c98379b2684e3a8b9b before edits. Checkpoint: `CHECKPOINTS/CHANGES/2026-10-20-supplier-stock-shortfall.md`.

Exactly8 central-delegated paths: `server/src/lib/supplier-order-groups.js`, `server/test/supplier-order-groups.test.js`, `server/test/supplier-order-groups-postgres.test.js`, `client/src/components/commerce/OrderSuggestionsPanel.jsx`, `client/src/components/commerce/supplier-order-proposal-export.js`, `server/test/supplier-order-groups-ui.test.js`, `server/test/supplier-order-proposal-export.test.js`, `server/test/supplier-stock-shortfall-contract.test.js`. Adds recorded minimum-stock gap classification independently of demand replenishment; supplier-only filter and visible labels, six appended CSV columns after the original32, same applied snapshot/all filtered pages. Missing/invalid/negative stock remains REVIEW_REQUIRED; tiny positive gaps are not displayed as zero. Original quantities, default rows, supplier proxy/cap/ties, flat endpoint and existing columns remain protected. No base producer/route/SQL/CSS/auth/licensing/schema/margin/supplier assignment/stock/financial/order/transport changes; retained owners unchanged.

Technical local evidence Node20.20.2: integrated30PASS/0FAIL/1native PostgreSQL SKIP because no local PostgreSQL; the native case is NOT RUN locally and must execute unskipped in full CI. Actual producer -> grouping -> JSON -> shared UI/filter/CSV and mounted download/reset/stale-response tests are covered. Initial partial-checkout missing CSS/zod/Express and one contradictory test fixture are retained in evidence with corrections; they are not product/LAB FAIL. Existing19/10 actual11row UI/CSV PASS, including stock-71/proposal82, is protected and not repeated.

Status: source implemented locally, not yet merged/installed; full required CI/review/normal guarded release pending. New UI/filter/CSV scope AWAITING LAB; no new real PASS, no manual/numbered closure. Dispatch OFF. Next action: review exact source, require full CI including native PostgreSQL without skip, merge and verify exact ordinary release; then new read-only acceptance only. Scoped regenerated tracker PDF: `CHECKPOINTS/EVIDENCE/supplier-stock-shortfall-20261020/source-tracker.pdf`; common PDF retained under existing concurrent-publication rule.


## Historical before-source record

# Supplier recorded-stock shortfall — before-source claim

## 20/10/2026 - CENTRAL-SUPPLIER-SHORTFALL-01 / ASSIGNED / BEFORE SOURCE

Owner: `codex/central-four-streams-20261018`; source branch: `codex/supplier-stock-shortfall-20261020`. Issues #2527 / #2705. Baseline `ec7720fdbcb89762d98a9d72eda8ff5fcc80af55`. Checkpoint: `CHECKPOINTS/CHANGES/2026-10-20-supplier-stock-shortfall.md`.

Bounded continuation of the explicit 18/10 central supplier helper/UI/CSV handoff. Exclusive paths: `server/src/lib/supplier-order-groups.js`, `server/test/supplier-order-groups.test.js`, `server/test/supplier-order-groups-postgres.test.js`, `client/src/components/commerce/OrderSuggestionsPanel.jsx`, `client/src/components/commerce/supplier-order-proposal-export.js`, `server/test/supplier-order-groups-ui.test.js`, `server/test/supplier-order-proposal-export.test.js`, `server/test/supplier-stock-shortfall-contract.test.js`. No edit to Task30 base producer `server/src/lib/order-suggestions.js`, routes/SQL, CSS, supplier assignments, margin, schema, licensing, financial/stock quantities, orders or transport. Other owners remain unchanged.

Implement a recorded-current-stock minimum shortfall classification independently of demand-driven replenishment; make it visible/filterable in the existing supplier panel and append metadata to its CSV. Keep original proposed quantities, default rows, grouping, proxy evidence, pagination and existing CSV columns. Invalid/unavailable/negative recorded stock stays explicitly REVIEW_REQUIRED; no physical availability certification or historical-stock claim. New required pipeline coverage: actual producer -> grouping -> JSON wire -> mounted UI / CSV; native isolated PostgreSQL coverage remains required in full CI.

Evidence: existing 19/10 supplier UI/CSV parity LAB PASS remains protected and is not repeated. New classification is NOT IMPLEMENTED / NOT TESTED / AWAITING LAB; no manual or numbered-list completion. Dispatch remains OFF. Next action: only after this before-source claim is green and merged, implement these exact paths in isolated Node 20 tests, review, full CI and normal guarded release; then require new read-only LAB acceptance for this added scope. Scoped regenerated tracker PDF: `CHECKPOINTS/EVIDENCE/supplier-stock-shortfall-20261020/claim-tracker.pdf` (common PDF retained under the existing concurrent publication rule).


## Contract

Each grouped row receives currentStockShortfall {status, quantity, basis: RECORDED_CURRENT_STOCK_MINIMUM, stockVerified:false, reviewReasons:[]}. Status is BELOW_MINIMUM (nonnegative recorded stock below recorded minimum), DEMAND_REPLENISHMENT (no recorded minimum shortfall and positive existing suggestion), NO_SHORTAGE (no recorded minimum shortfall), or REVIEW_REQUIRED. Missing calculation fields, invalid/nonfinite/negative calculation inputs or negative recorded stock require review and null quantity; never infer original minimum configuration from the base producer default. Supplier evidence completeness is independent. Generic calculation review does not parse human reason prose.

UI only in supplier mode, all rows default, explicit filters; reset on reload/store changes. Fail closed on absent/malformed classification. Append CSV columns without changing the preceding 32; filter export uses the same applied snapshot and all filtered pages. Recorded stock is an observation, not verified physical quantity; rolling history describes demand only. No stock/order/invoice/payment action.

## Protected acceptance

19/10 supplier panel/CSV parity, selected LAB store, 11 rows, all unassigned proxy evidence; water SKU2269 recorded stock -71 and proposal82 remain unchanged. That acceptance does not certify stock correctness, positive supplier attribution, automation or this new classification. Keep all existing PASS and historical FAIL.

## Required acceptance / handoff

Full required CI and isolated native PostgreSQL tests must pass; peer review verifies unchanged original quantities/assignments and malformed-data rejection. Exact deployed revision must be verified through ordinary CI/Render guard. New read-only UI/filter/CSV acceptance is still required; CI alone is AWAITING LAB. Owner remains central until explicit merged handoff. No source changes have started at this claim.

## Pre-merge integration review follow-up

Root review found that a sixth table column would shift the existing CSS fifth-column reason width. Before merge, the panel was corrected to preserve all five original columns, placing separate shortfall labels in the existing stock cell, and putting the stock filter inside the existing styled view wrapper. No CSS edit. NO_SHORTAGE explicitly says recorded shortfall. Mounted regression asserts five headers/cells, stock2/proposal4/reason5 and filter wrapper. Updated nonnative Node20 tests30PASS/0FAIL/0SKIP; native remains not run locally. This is a static integration review finding and correction, not a new actual LAB FAIL/PASS. Prior unmerged head bdb923d526243212105805e369c2874d3cb588bb CI39430718110 is historical after the new head; full CI and review must run against the updated head. Same eight claimed paths and AWAITING LAB remain unchanged.
