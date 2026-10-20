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
