# 2026-11-07 — INVENTORY-SCAN-WORKFLOW-01 · unknown barcode recovery

Owner: original inventory owner /root, centralized coordination approved 2026-11-07. Isolated recovery branch `recovery/inventory-unknown-barcode-20261107` initially based on main `d4879bfdc9d30b2e8debe37e80eb33822259ee6b`. State: **DRAFT / AWAITING EXACT-HEAD CI / LAB NOT TESTED**.

The original local candidate `bcf5db10a6d0c3e268d4780f23be1b58daa92da0` was not accessible in this session. Reconstructed bounded personal inventory unknown-barcode entry from current main and existing remote draft #3691. Existing `InventoryNewProductCard` receives the selected barcode, only when the staff member has both `products.create` and `inventory.count`, the selected stocktake is `DRAFT`, and navigation/write guards are clear. Store and stocktake identity are captured on card open, cards are dismissed when selection changes, opening-stock entry is disabled, and successful product creation explicitly does **not** count or attach the item. The owner event and existing Enter/count-filter behavior remain unchanged.

Added focused mounted tests for permission gating, finalized/locked rejection, same-store full card and no write prior to Save. No new API, schema, permission grant, payment, inventory count, stock movement or fiscal action.

Known separate dependency: original #3692 line attachment must be reconciled only after this scoped card passes full CI and review; #3692 must preserve transaction-time both-grant checks, active StoreProduct binding, duplicate-line replay, original DRAFT stocktake binding and native PostgreSQL authorization tests.

Before merging, verify the full unchanged shared registries, update the existing active list without deleting history, run repository checkpoint policy, Node20 tests, full PR CI, independent review, guarded release and measured MYWORKSTATION LAB acceptance. #3690 already merged and filter USER PASS reported; do not repeat accepted counts. This checkpoint is **not** LAB/CI PASS.
