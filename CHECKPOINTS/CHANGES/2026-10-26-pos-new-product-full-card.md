# POS-NEW-PRODUCT-FULL-CARD-01 - explicit new POS extension / BEFORE SOURCE

26/10/2026. Central owner `codex/central-four-streams-20261018`; worker `/root/next_commerce`, source branch `fix/pos-new-product-full-card-20261026`. Prepared on `27ab5bc`; reconciled fresh main `2b3ac1790c97d6d2a052428586543997beee3c9b` with unrelated myDATA3168 source and complete owner registry bytes preserved. Source scope unchanged. User explicitly requests POS creation with all existing BackOffice new-product fields. Read current AGENTS, tracker/pending/active, original full-card checkpoint and relevant source. Actual POS currently has no new-product button or creation endpoint. Existing BackOffice creator was implemented/released #2463/#2464; retained owner `codex/inventory-new-card-online-20261013` keeps original actual-creation/device acceptance. Its limited full-card UI/lookup PASS is protected. This is only a new POS extension, not a takeover of inventory, SET/recipes, supplier, price/margin or original creation acceptance.

## Exact source/test claim - 15 paths

1. NEW `client/src/components/commerce/InventoryNewProductCard.jsx`: extract/share complete existing new-only creator.
2. `client/src/components/commerce/InventoryArchivePanel.jsx`: delegate new-only form; preserve existing edit/SET/bulk/import.
3. `client/src/components/commerce/InventoryBarcodeLookup.jsx`: optional scoped lookup callback/permission; legacy default preserved.
4. `client/src/components/commerce/OperatorManagementPanel.jsx`: explicit persisted newProduct permission checkbox, default false.
5. `client/src/components/store/StorePosPanel.jsx`: new-product button/shared creator and refresh current catalogue; basket unchanged.
6. NEW `server/src/lib/inventory-new-card-options.js`: shared active-owned-store options.
7. NEW `server/src/lib/inventory-product-barcode-lookup.js`: extract exact existing lookup, no provider algorithm change.
8. NEW `server/src/lib/pos-new-product-card.js`: narrow registered POS options/create/barcode handlers and guards.
9. `server/src/lib/inventory-new-card.js`: trusted POS audit-origin context and bounded StockMovement User-FK actor compatibility only; existing atomic creation/idempotency contract retained.
10. `server/src/routes/owner-product-actions.js`: new-card/options shared helper delegation only.
11. `server/src/routes/owner-product-smart-entry.js`: barcode handler shared helper delegation only.
12. `server/src/routes/store-pos-catalog.js`: fresh newProduct access projection and new route registration only.
13. NEW `server/test/pos-new-product-card-ui.test.js`.
14. NEW `server/test/pos-new-product-card-routes.test.js`.
15. NEW `server/test/pos-new-product-card-postgres.test.js`.

## Required behavior and protected contracts

Same complete tabs/fields: name/SKU/description, category/subcategory, brand, units/capacity, purchase/store/staff/delivery prices, existing margin/markup calculators, exact active VAT department/read-only rate, opening stock, minimum order quantity, discounts A/B/C, active/stock/discount/price/SET/recipe flags, barcode rows with package multiplier/price/name and supplier-code rows. Unsaved statistics/purchases unavailable; SET/recipe composition retains save-first contract. No second simplified product schema or differently calculated field values.

Owner API remains OWNER/SUPER_ADMIN only. POS requires current active same-company/store/operator, fresh explicit newProduct permission default false, bound context and both STORE_MODE plus INVENTORY licences. No fake OWNER, implicit MANAGER upgrade or broader catalogue privilege. Online lookup additionally requires the existing onlineBarcode permission. Reuse exact atomic creator: UUID replay/body conflict, SKU/barcode collisions, owned taxonomy/suppliers, VAT identity, one store card/opening movement, original actor audit and full rollback. Actual StockMovement.createdByUserId has a real User FK: STORE_OPERATOR must always write NULL to that User-only FK, even on an accidental identifier collision. Preserve original credential/employee/name/terminal provenance in existing operator audit and supplier attribution; BackOffice User attribution unchanged. No FK/schema relaxation or new attribution identity. No sale/payment/fiscal/shift/cart write or automatic basket addition.

## Required evidence before acceptance

Actual shared/mounted form and POS button/payload/scope/late-response/revocation/disabled-state tests; registered handler tenant/role/store/licence/operator-permission refusals. Native PostgreSQL full-field create, concurrent identical retry once, changed-body conflict, collisions, actual StockMovement-to-User FK with positive POS opening stock, non-POS attribution, accidental credential/User ID collision and replay/rollback, invalid VAT/foreign metadata and atomic rollback with unchanged control-store/financial rows. Synthetic fixture only; no provider call, production product or accepted transaction replay. Required Node20 exact full PR/main CI, independent review and ordinary guarded exact LIVE before separately authorized authenticated real save with fresh before/after controls. CI is not actual product creation acceptance.

Status ASSIGNED / SOURCE NOT STARTED / NEW FLOW NOT IMPLEMENTED OR INSTALLED / AWAITING LAB. This checkpoint, short common registry claim and canonical PDF must be green merged on main BEFORE source. Three explicitly requested features have separate scopes/source PRs or serialized integration; this docs batch is not a combined speculative runtime change. Existing Gate2/3/8 final PASS and all other owners remain protected.
