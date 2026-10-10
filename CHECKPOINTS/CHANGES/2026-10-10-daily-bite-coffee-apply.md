# DAILY BITE coffee KAT-behavior apply — 10/10/2026

Owner `codex/daily-bite-coffee-kat-behavior-20261010`, issue #2054.

## Bounded implementation
Adds a guarded Super Admin apply endpoint after the read-only preview PASS at source level.

It:
- requires target company DAILY BITE and explicit confirmation token `DAILY_BITE_COFFEE`;
- recomputes unique 1:1 coffee-family matches at apply time;
- aborts before any transaction when a signature is missing or ambiguous;
- copies only KAT modifier-group **definitions/behavior** into DAILY BITE's own company IDs;
- creates DAILY BITE modifier rows with DAILY BITE IDs, preserving description/order/price/cost behavior;
- links those DAILY groups to matched DAILY coffee products;
- enables preparation UI for those products with environmental fee forced to 0;
- optionally changes only the DAILY product `name` to the matched KAT coffee name;
- never changes SKU, barcode, purchase/sale price, VAT, department, stock, supplier links or store/company identity;
- never copies KAT group/modifier IDs;
- explicitly does **not** copy KAT recipes, ingredient product IDs or ingredient stock-consumption configuration.

## Safety
Existing DAILY BITE 9 departments / 8,753 catalog import remains protected. No reimport or department recreation. No runtime apply has been executed by this PR. CI is required; LAB/LIVE remains NOT TESTED.
