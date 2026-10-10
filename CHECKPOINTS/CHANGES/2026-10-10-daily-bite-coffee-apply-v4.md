# DAILY BITE coffee KAT-behavior apply v4 — 10/10/2026

Latest-main rebase of issue #2054 after concurrent main changes again made the previous delivery PR non-mergeable.

Scope unchanged:
- DAILY BITE target only.
- Explicit confirmation token `DAILY_BITE_COFFEE`.
- Recompute unique 1:1 coffee-family matches at apply time.
- Abort before any transaction on missing/ambiguous signatures.
- Create DAILY-owned modifier groups/items and DAILY product links.
- Optional KAT→DAILY **name-only** normalization after a unique match.
- Preserve SKU, barcode, purchase/sale prices, VAT, departments, stock, suppliers, store/company identity.
- Never copy KAT IDs.
- Do not copy KAT recipes, ingredient IDs or ingredient stock-consumption configuration.
- No catalog reimport or department recreation.

Protected state remains 9 DAILY BITE departments / 8,753 imported products.

Status: AWAITING CI. Runtime apply remains NOT TESTED.
