# DAILY BITE coffee LIVE one-shot apply — 10/10/2026

Owner `codex/daily-bite-coffee-kat-behavior-20261010`, issue #2054.

Measured production baseline before this change:
- DAILY BITE company `cmv25lf0w000seegf1cn4bbmx`;
- 8,753 active products;
- 0 active DAILY modifier groups;
- 0 active DAILY modifiers;
- 0 preparation-enabled DAILY products.

The prior generic coffee-name matcher was intentionally NOT used for LIVE apply because the full catalog contains retail products whose names contain espresso/cappuccino/latte. This one-shot patch instead uses an explicit, reviewed SKU↔KAT-SKU mapping for 16 prepared coffee products only.

On next production startup it:
- validates exact DAILY and KAT source rows;
- requires KAT modifier groups for every mapped product before any transaction;
- creates DAILY-owned modifier groups/items;
- links only those exact DAILY products;
- enables preparation UI with environmental fee 0;
- changes only the product name to the KAT label where different;
- records one durable `DataPatchMarker` and becomes a no-op on later restarts;
- does not copy recipes, ingredient IDs, ingredient stock consumption, prices, VAT, barcode, department, category, stock or suppliers.

Current status before CI/deploy: AWAITING CI / LIVE APPLY NOT YET EXECUTED.
