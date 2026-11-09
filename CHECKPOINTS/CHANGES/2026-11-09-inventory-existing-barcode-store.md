# 09/11/2026 — INVENTORY-SCAN-WORKFLOW-01 / existing barcode unavailable in stocktake store

Retained owner /root. Rizareio reports barcode 52016165 blocked by global duplicate validation even though the item is absent from local lookup. The exact product owner and store state are unverified.

Scoped fix: exact barcode lookup for active same-company products missing from the current store; explicit confirmation before adding the existing item to the scoped store and draft; preserve existing prices, stock, barcodes, company isolation and permissions. Require active scoped grant, transaction-time draft validation, retry safety and test cases for other-company, inactive and ambiguous matches. Never automatically reactivate an explicitly disabled store item. No production write or acceptance yet.

09/11/2026 — INVENTORY-SCAN-WORKFLOW-01 / exact existing barcode store assignment implemented through `eff05d16`. Explicit assignment, scoped active grant and draft lock, existing records preserved. CI and live Rizareio verification pending.
