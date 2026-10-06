# 06/10/2026 — Bulk Price maximized scroll regression

LIVE regression matrix after the global commerce scroll fix:

- Master Catalog: PASS — lock, do not modify.
- Τιμές ανά κατάστημα: PASS — lock, do not modify.
- Μαζική αλλαγή τιμών: FAIL — normal window scrolls, maximized window still clips the lower action/value/submit region.

The bulk workflow is in `OwnerProductCenter` (`.bulk-price-workflow`). Scoped CSS correction only: in maximized commerce mode let the bulk workflow use natural/max-content height and visible overflow so the parent `.commerce-hub` (already the bounded vertical scroll container) can scroll the whole form. Keep `.bulk-check-list` independently bounded for product results. No changes to Master Catalog, store prices, handlers, routes, permissions or pricing logic.

Requires green CI and LIVE bulk-only verification through the final submit button.
