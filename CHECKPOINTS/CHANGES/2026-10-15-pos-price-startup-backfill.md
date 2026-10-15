## 15/10/2026 18:06 Athens — POS-PRICE-STARTUP-01 / CLOSED LIMITED LIVE STARTUP PASS

Owner codex/pos-permanent-price-20261015. Independent dependency claim PR2502/docsCI38754792259 merged00c8ce94 before source; source PR2503/head41cf6c0dbeb69e47cc75714a27ae6cc14bdd6267 merged aafb68079ce5f53ffdd2433c76601d6bfa1c79a1. PR CI38755336474/build116492316871 and exactmainCI38756178019/build116495320939 SUCCESS:2679PASS/0FAIL/0SKIP+6backup/all required Windows/build/nativePG/realHTTP/Chromium/invariants. Ordinary guarded Render38756912305/job116497769341 SUCCESS, deploydep-db8emoo473hc739gebq0 LIVE18:05:52Athens, exacthealthy18:06:06Athens and independentoktrue/aafb read. One first independent postrollout read502, subsequentexact200; no manualdeploy/dispatch/hook/migration/backfill/datarepair.

Predecessor layout release7d8cb819/PR2501 had green2678/0/0 but Renderdep-db8eb5ivcj2c7395lbe0 failed startup17:40:54Athens with PostgreSQL21000: multiple legitimate mapping aliases hit one SupplierProductLink upsert target. First mapping INSERT SELECT alone now DISTINCT ON(companyId,supplierId,productId), deterministic latest timestamp/id; aliases and tenant joins/COALESCE/PRODUCT_CARD priority retained. NativePG test reproduces old21000, current repeat/tie/foreign/priority preservation passes separately.

Actual read-only live group before18:01:11:2aliases/hashd1faa5f569b91644fb7af33c01773971, targetlink absent; after18:06:10 SAME2/hash, one linke480484e446af275ddad4b03edbf8fae/codeTJB-1015584 8713800019307/sourceINVOICE_LEARNING matching latestmapping602fb81e-4bb8-4778-bad8-d3a5a980794a. ScopePASS exactordinaryhealthy startup plus targetgroup/sourcepreservation, not fresh invoice/OCR/stock/payment/fiscal acceptance. No Gate3/No33/otherowner takeover. Checkpoint CHECKPOINTS/CHANGES/2026-10-15-pos-price-startup-backfill.md; manual docs/manual/deployment/PASS.md.

## 15/10/2026 — POS-PRICE-STARTUP-01 — IMPLEMENTED / AWAITING FULL CI + EXACT RELEASE

Owner codex/pos-permanent-price-20261015. ClaimPR2502/docsCI38754792259 SUCCESS merged00c8ce94 before source. Failed Render7d8cb819 deploydep-db8eb5ivcj2c7395lbe0: build succeeded, startup17:40:54Athens failed PostgreSQL21000 in first SupplierProductMapping→SupplierProductLink upsert. Read-only production proof:1valid target group/2legitimate mapping aliases, existing targetlink absent, mappinghashd1faa5f569b91644fb7af33c01773971. Previous7bbcff06 remains healthy. No permanent price saved: finalLABpreviewcleanup storeprice1/stock-16/history0/events0/cart0/queue0.

Only first startup INSERT SELECT now uses DISTINCT ON exact(companyId,supplierId,productId), ordered updatedAt/lastSeenAt/confirmedAt descending then stable mappingid. Each link target receives one deterministic latest source; all source aliases retained, same tenant joins/COALESCE/reactivation/PRODUCT_CARD source protection and purchase-history fallback. No OCR/learning trigger/model/pack/tax/invoice line/stock/payment/fiscal rule change, no takeover of Gate3/No33/other owners. No manual DB write/delete/migration/backfill/deploy hook/dispatch. Existing normal guarded startup executes the bounded repaired query only after greenCI.

Added native isolated PostgreSQL reproducer for exact former21000 and rollback, real current query with3aliases/timestamp tie/tenant mismatch/PRODUCT_CARD blank-code fallback, stable repeated startup and source mapping preservation. Local Node24 syntax PASS/native1SKIP (no isolated DB); authoritative Node20/nativeCI pending, not LAB PASS. Next: full green CI, merge, exact guarded healthy source, then fresh original permanent-price LAB save/restoration/Events acceptance. Checkpoint CHECKPOINTS/CHANGES/2026-10-15-pos-price-startup-backfill.md.

## 15/10/2026 17:46 Athens — POS-PRICE-STARTUP-01 — ASSIGNED / OBSERVED RELEASE BLOCKER

Owner codex/pos-permanent-price-20261015; claim branch docs/pos-price-startup-20261015. Narrow independent dependency of requested POS permanent-price delivery, not a takeover of Gate3/OCR/invoice learning or other assigned owners. Render deploydep-db8eb5ivcj2c7395lbe0 for7d8cb819 failed startup14:40:54UTC/17:40:54Athens: ensureSupplierItemLearningSchema→PostgreSQL21000 ON CONFLICT target affected twice. Build successful; previous7bbcff06 remains healthy, permanent saves NOT TESTED. Read-only production aggregate confirms1duplicate(company,supplier,product) group with2mapping aliases. Existing first learning→SupplierProductLink INSERT emits both aliases against one unique target; existing purchase-history SELECT already uses DISTINCT ON and remains protected.

Claim ONLY deterministic one-row-per-target input to this startup backfill, preserving all original mapping aliases, tenant joins, PRODUCT_CARD source priority, purchase-history fallback, OCR triggers/rules/amounts and ordinary guarded deployment. No manual DB update/delete/migration/backfill or deploy hook/dispatch; no real invoice/payment/stock/fiscal action. Native isolated PG must reproduce21000 then prove one correct stable link, latest row/tie determinism, existing source/fallback preservation and unchanged source mappings. Read complete source, relevant12Sep full-product-card checkpoint/main history and current shared records. Next: merge claim before source; fix only first backfill SELECT, full CI/exact guarded healthy revision then resume price LAB test. Checkpoint CHECKPOINTS/CHANGES/2026-10-15-pos-price-startup-backfill.md. Existing POS-PERMANENT-PRICE-01 owner retained and NOT PASS.


## Actual read-only live preservation evidence
```json
{
  "before": {
    "athens": "2026-10-15 18:01:11",
    "link": null,
    "mappingCount": 2,
    "mappingHash": "d1faa5f569b91644fb7af33c01773971",
    "winner": {
      "code": "TJB-1015584 8713800019307",
      "id": "602fb81e-4bb8-4778-bad8-d3a5a980794a"
    }
  },
  "after": {
    "athens": "2026-10-15 18:06:10",
    "link": {
      "id": "e480484e446af275ddad4b03edbf8fae",
      "source": "INVOICE_LEARNING",
      "supplierCode": "TJB-1015584 8713800019307"
    },
    "mappingCount": 2,
    "mappingHash": "d1faa5f569b91644fb7af33c01773971",
    "winner": {
      "code": "TJB-1015584 8713800019307",
      "id": "602fb81e-4bb8-4778-bad8-d3a5a980794a"
    }
  }
}
```
