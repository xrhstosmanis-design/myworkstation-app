# Wholesale / B2B — assignment and architecture baseline — 01/10/2026

## Status
ASSIGNED `agent/wholesale-b2b-20261001` — NOT TESTED.

## Owner request
Add a wholesale/B2B mode for companies that sell wholesale, while preserving the existing retail application.

## Verified architecture
The live commercial catalog is bootstrapped at runtime in `server/src/commercial-bootstrap.js`, not represented in the current Prisma schema. Canonical product identity is `Product.id`, company isolation is `Product.companyId`, store availability/price/stock is `StoreProduct`, and barcodes are `ProductBarcode`.

## Phase 1
1. Company-scoped wholesale customer master.
2. Company-scoped B2B price lists.
3. Price-list product overrides referencing the existing `Product.id`.
4. Optional customer-specific product override.
5. No duplicate product/catalog/stock tables.

## Protected behavior
- Gate 3 remains PASS and is out of scope.
- Retail POS price selection is unchanged in Phase 1.
- No stock movement/posting.
- No payment, fiscal, Netlink/RBS, myDATA or invoice finalization changes.
- Existing auth/licensing and company isolation remain mandatory.
- No production data mutation is part of initial acceptance.

## Acceptance for first implementation
CI/build/server tests must pass. API tests must prove cross-company customer/product/price-list references are rejected. UI/LAB use remains AWAITING LAB until deployed and observed.
