# STORE-CATALOG-APPEND-XLSX — #3811
Assigned to /root on branch feat/store-catalog-append-3811. Support adding new products from Excel to an existing selected store catalog with multiple barcodes per product. Validate VAT mapping and collisions before writes. Existing LAB acceptance pending.

Implementation candidate: explicit store-bound, create-only Excel profile, primary and additional barcode validation, existing VAT department validation and transaction-assigned SKUs. Local parser checks passed for leading zeros, alias ordering, duplicate rejection and target binding. CI and existing LAB pending.

First CI exposed a duplicate SKU lock and a source-test harness regression; both corrected while preserving the existing first-import behavior. Separate device setup browser timeout also observed. Fresh CI pending.

14/11/2026: #3813 merged with CI #9692 PASS. Isolated checks 22/22 PASS including the native PostgreSQL import suite, plus a synthetic XLSX round-trip preserving leading zeros in both barcodes. Hosted UI import and barcode lookup remain pending.

14/11/2026 — Hosted LAB PASS for #3813 in ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ as Super Admin. Preview showed 1 CREATE, 0 UPDATE and 0 invalid. One final submission. Exact searches for 0020261114381 and 0020261114382 each returned the same single synthetic item. Production stores were outside the test scope.
