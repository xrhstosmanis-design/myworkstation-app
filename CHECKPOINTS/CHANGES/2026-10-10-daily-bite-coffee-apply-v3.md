# DAILY BITE coffee KAT-behavior apply v3 — 10/10/2026

Latest-main rebase of issue #2054 coffee behavior apply after concurrent main changes made PR #2156 non-mergeable.

Behavior unchanged:
- DAILY BITE target only;
- explicit confirmation token `DAILY_BITE_COFFEE`;
- recompute unique 1:1 coffee-family matches at apply time;
- abort before transaction on any missing/ambiguous signature;
- create DAILY-owned modifier groups/items and DAILY product links;
- optional KAT→DAILY name-only normalization after unique match;
- preserve SKU/barcode/purchase+sale prices/VAT/departments/stock/suppliers/store/company identity;
- never copy KAT IDs;
- do not copy KAT recipes, ingredient IDs or stock-consumption configuration.

Protected state: 9 DAILY BITE departments / 8,753 imported products. No catalog reimport or department recreation.

Status: AWAITING CI. Runtime apply has not been executed. LAB/LIVE remains NOT TESTED.
