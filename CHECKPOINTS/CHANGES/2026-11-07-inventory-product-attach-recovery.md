# 2026-11-07 — INVENTORY-SCAN-WORKFLOW-01 · safe product attachment recovery

Owner /root, unchanged; continuation explicitly approved by the owner. This branch `recovery/inventory-product-attach-20261107` builds on recovery PR #3701, not on the unmergeable old draft #3691. State: **DRAFT / AWAITING FULL PR CI / LAB NOT TESTED**.

## Bounded implementation
After the full new-product card creates an unknown-barcode product, link its returned product ID only to the **original, still-selected DRAFT** stocktake within the same company/store/view. The client uses captured original `storeId/stocktakeId/scope` and does not retarget a delayed callback to a different stocktake. The existing `POST /api/inventory-v2/stocktakes/:stocktakeId/lines` endpoint is gated for delegated staff through `inventory.count` and requires live transaction-time **both** `inventory.count` and `products.create` grants, tenant/store, active global Product **and active StoreProduct**, parent DRAFT lock, and ON CONFLICT replay returning the actual existing line ID. No quantity entry, stock movement, finalization, fiscal/payment or permission grant is performed by line attach.

## Tests and limits
- Original selected-stocktake origin helper and admission mapping tests.
- Mocked native route regression: inactive store-product 404 with zero writes, active insertion 201, replay 200 returning the original line ID.
- Staff-route regression: either grant revoked denies before insert; both live grants checked, finalized parent denied, no other stock/count writes.
- Existing Enter and counted-only filter remains preserved, accepted user filter tests must not be repeated.
- **Not yet proved:** native PostgreSQL/HTTP full CI, mounted product-save-to-attach navigation race, independent review, exact-main guarded release, measured MYWORKSTATION LAB, physical barcode scanner. Old PR #3692 is historical DRAFT and is unchanged.

Registry update is to be applied only by read-only source verification and local Git with every prior active-list byte preserved. This checkpoint does not claim CI/LAB PASS.
