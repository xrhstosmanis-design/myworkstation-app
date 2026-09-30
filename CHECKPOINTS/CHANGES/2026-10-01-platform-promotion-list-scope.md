# Super Admin promotion list tenant scope — 01/10/2026

## Observed production result

The owner authorized one real LAB-only gift action. Platform Admin submitted buy 1 × `LAB EXCEL TEST 1`, receive 1 × `LAB EXCEL TEST 2`, targeted only to `ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ`. The application returned `Δημιουργήθηκαν 1 πραγματικές ενέργειες δώρου. Προϊόντα: 1 · Καταστήματα: 1.` No sale or stock movement was performed.

After a page reload, `Υπάρχουσες προσφορές` still showed 0. The record creation and the misleading list had different scopes: `POST /api/platform/master-catalog/bulk/promotions` writes the promotion to the selected store's tenant company, while the Platform Admin UI loaded `GET /api/price-catalog/promotions/scoped`, which filters by `req.user.companyId`.

## Bounded correction

- Added Platform Super Admin-only `GET /api/platform/master-catalog/bulk/promotions` across tenant companies.
- Added matching cross-company promotion analysis endpoint.
- Each row includes the tenant company and exact target stores.
- Platform UI now uses the platform endpoints and reloads the list after a successful creation.
- Tenant Owner/Manager scoped endpoints and POS offer/gift application remain unchanged.
- No existing promotion, sale, payment, inventory or stock row is modified by this correction.

## Verification

- Full server suite: 1678 PASS, 0 FAIL, 1 SKIP.
- Client production build: PASS.
- Focused Task 20 and Super Admin promotion tests: 21 PASS.
- PR #1566 initial CI stopped only because this mandatory active-list/checkpoint update was absent; code/test stages had not run. Updated commit requires CI, merge, exact deployment and read-only production confirmation that the existing LAB gift is visible. Do not create a second gift for verification.
