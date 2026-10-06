# 06/10/2026 — Bulk Price dedicated maximized scroll region

LIVE after PR #1792 remains FAIL: in maximized mode the form reaches only the start of step 3/4 and the submit button is still below the unreachable viewport. Master Catalog and Store Prices remain PASS and are locked.

Second scoped approach: mark only the bulk form with `bulk-price-scroll-region`. When that marker is present inside a maximized commerce shell, `OwnerProductCenter` becomes a bounded flex column and the bulk form itself becomes the single vertical scroll owner (`overflow-y:auto`, `min-height:0`, stable gutter, bottom space). Header/tabs remain fixed. This avoids changing Master Catalog, Store Prices, Offers, Excel/Barcode or Inventory.

No pricing logic, handlers, routes, permissions or API behavior changes. Requires green CI and LIVE verification that scrolling reaches the final Apply button.
