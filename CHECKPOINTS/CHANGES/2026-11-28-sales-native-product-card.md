# Sales right-click → native Warehouse product card and purchases



## 28/11/2026 — Sales native warehouse card/purchases correction / ASSIGNED / BEFORE SOURCE

Owner /root / fix/sales-native-product-card-20261128, continuation of #4324. User screenshot rejects the summary dialog and explicitly requests the same complete card and purchases as Warehouse. Prior search/menu deployment449b7489 remains technically verified; summary presentation is rejected by user, native routing NOT TESTED. Reuse existing CommerceLauncher warehouse initialProduct bridge, selecting basic or purchases tab; remove the custom summary/history renderer. Preserve all five-tab search, product/store identity, keyboard/scope fences, existing Warehouse edit permissions and all other owners. No financial action, schema, API or grant change. Common visual acceptance later. [Checkpoint](CHANGES/2026-11-28-sales-native-product-card.md).

Before-source evidence: read current rules, full active/historical/ownership registries, source history and related price-catalog/search checkpoints. Existing native full card supports initialProduct and openEdit(row,tab). CommerceLauncher already has a store-validated full-card event bridge. Implement one bounded route correction and actual DOM event regression, preserving current default basic tab and native permissions. Full CI, exact-main CI, guarded deployment and shared user acceptance required. NOT TESTED / NOT INSTALLED.
