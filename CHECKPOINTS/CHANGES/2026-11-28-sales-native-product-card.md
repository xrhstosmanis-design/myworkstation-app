# Sales right-click → native Warehouse product card and purchases



## 28/11/2026 — Sales native warehouse card/purchases correction / ASSIGNED / BEFORE SOURCE

Owner /root / fix/sales-native-product-card-20261128, continuation of #4324. User screenshot rejects the summary dialog and explicitly requests the same complete card and purchases as Warehouse. Prior search/menu deployment449b7489 remains technically verified; summary presentation is rejected by user, native routing NOT TESTED. Reuse existing CommerceLauncher warehouse initialProduct bridge, selecting basic or purchases tab; remove the custom summary/history renderer. Preserve all five-tab search, product/store identity, keyboard/scope fences, existing Warehouse edit permissions and all other owners. No financial action, schema, API or grant change. Common visual acceptance later. [Checkpoint](CHANGES/2026-11-28-sales-native-product-card.md).

Before-source evidence: read current rules, full active/historical/ownership registries, source history and related price-catalog/search checkpoints. Existing native full card supports initialProduct and openEdit(row,tab). CommerceLauncher already has a store-validated full-card event bridge. Implement one bounded route correction and actual DOM event regression, preserving current default basic tab and native permissions. Full CI, exact-main CI, guarded deployment and shared user acceptance required. NOT TESTED / NOT INSTALLED.

## Source prepared

Claim #4333 green CI46175339582 merged990278262 before source. Removed custom summary/history renderer. Card now dispatches the already-supported full Warehouse card event with actual product/store IDs, leaving CommerceLauncher and InventoryArchivePanel unchanged. Purchases reuse the actual Warehouse purchasesModal through a shared exported entry, with the same supplier/invoice/discount columns,365-day history and CSV. Native API calls remain pinned to current product/store/token and reject delayed results; changing report scope closes only the history opened by this feature. Existing price-catalog routing and native edit permissions stay unchanged. No new API/grant/business writer.

First prepared revision forwarded an initial purchases card tab; final source instead shares the exact Warehouse context-menu purchase-history implementation to meet both parts of the user's request. No production version of the intermediate change was released. Focused final tests/build recorded below. Full PR/main CI, exact guarded release and shared visual acceptance pending. NOT INSTALLED / NOT LAB PASS.

Final focused20PASS/0FAIL/0SKIP, including immediate stale-export rejection. Final frontend build PASS10.84s / entry-BHNK20K_.js (TABLE_SERVICE verified); exact served bundle and revision will be recorded after guarded release.
