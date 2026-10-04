# 04/10/2026 — TODAY-04 fast product search

Status: IMPLEMENTED / AWAITING CI / LIVE / USER ACCEPTANCE.

LIVE observation: the bulk-price tab waited on the full owner product catalog before rendering product choices. The catalog endpoint performs a rich joined query and returns up to 500 rows, making the initial tab unnecessarily slow for this workflow.

Correction: TODAY-04 no longer auto-loads the full catalog when the bulk tab opens. The user searches by description/SKU with at least two characters and only matching catalog results are loaded. Existing selected product IDs, store selection, preview endpoint, price calculations and commit behavior remain unchanged.

No price was committed. Merge only after green CI; LIVE speed and selection/preview must then be visually accepted.
