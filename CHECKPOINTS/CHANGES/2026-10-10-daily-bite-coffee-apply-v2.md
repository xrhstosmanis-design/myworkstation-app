# DAILY BITE coffee KAT-behavior apply v2 — 10/10/2026

Rebased delivery of the guarded coffee apply implementation on current main after PR #2153 became non-mergeable due to concurrent documentation changes.

Behavior is unchanged:
- target must be DAILY BITE;
- explicit confirmation token `DAILY_BITE_COFFEE`;
- recompute unique 1:1 coffee-family matches at apply time;
- abort before any transaction on missing or ambiguous signatures;
- recreate KAT modifier-group behavior using DAILY BITE-owned group/modifier IDs;
- link only DAILY BITE coffee products;
- optional name-only normalization from the uniquely matched KAT coffee label;
- no changes to SKU, barcode, prices, VAT, departments, stock, suppliers, store/company identity;
- no KAT IDs copied;
- no KAT recipes, ingredient IDs or stock-consumption configuration copied.

Protected state: DAILY BITE 9 departments / 8,753 imported products. No catalog reimport or department recreation.

Status: AWAITING CI. No runtime apply has been executed by this PR. LAB/LIVE remains NOT TESTED.
