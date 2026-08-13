Status: implementation in progress

Current head before PR: `e8d4b1f64429d1af7f2436c264ad3c320c2333fe`

Implemented:
- `/api/store-pos/sales/journal` reuses authoritative Sale/SaleLine/Payment records.
- BackOffice sales journal UI renders item names, quantities, payment split, total and state.
- Regression tests added for data contract and route mounting.

Pending before list removal:
- CI must pass.
- Merge to main / Render deploy.
- Live KAT test must confirm a real sale appears with item + quantity + payment in BackOffice journal.
