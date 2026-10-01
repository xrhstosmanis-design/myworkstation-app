# Diadochou POS company catalog

**01/10/2026 — ASSIGNED `codex/diadochou-pos-catalog-20261001`:** Installation owner requests Diadochou POS quick water keys and fast movers from uploaded sales. LIVE READ-ONLY FAIL: central picker uses MasterProduct codes; master332 is Alpha Strong, company332 is Alpha330ml. Bounded company-scoped product-ID selection/import and publication guard; preserve existing global templates, fixed20/14/40 structure, financial/stock/fiscal behavior. No LAB/installation PASS. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-diadochou-pos-catalog.md`.


## Evidence
Owner sales file01Jan–01Oct2026; 363593 net units after returns. Company catalog6623 products. Strict SKU+normalized-name extraction prepared, unmatched372 positive rows excluded pending review. Existing draft35 has labels only and legacy8products+7up, not published. Three water IDs/SKUs verified read-only: KM490,KM768,KM491. Runtime35a52c4 live. Master-vs-company332 collision confirmed. New behavior NOT TESTED; no sale, payment, stock or fiscal changes.

## Acceptance
Select Diadochou company, use actual company Product IDs; import reviewed ranked category list without creating catalog products. Publish to only Diadochou; reload and match all product IDs, water labels and fixed limits. Reject publication/clone to different company. LAB and physical store acceptance remain separate. No repeated existing transaction.
