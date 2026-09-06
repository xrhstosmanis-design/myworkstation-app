# Checkpoint 2026-09-06 — MOD-01 promotion listing safety

- PR #550 merged to main as `e393ae96`.
- Added tenant-scoped read-only listing for existing promotions.
- Returned fields: product, SKU, original/offer price, discount, quantities, dates, active state, creator and store scope.
- No POS price, stock, sale or payment mutation.
- PR #551 adds CI regression coverage for tenant scope, read-only behavior, bounded results and response shape.
- Next step: connect real completed Sale/SaleLine records to promotions before calculating sales quantities, supplier amounts or exports.
