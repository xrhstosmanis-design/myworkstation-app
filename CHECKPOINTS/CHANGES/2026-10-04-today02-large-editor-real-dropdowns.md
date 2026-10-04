# 04/10/2026 — TODAY-02 large product editor / real category and VAT dropdowns

Status: IMPLEMENTED / AWAITING CI / LAB / USER ACCEPTANCE.

Scope is limited to TODAY-02 in the VAT Department product editor. The editor is enlarged and restyled to match Central Product Management: larger readable labels, 54px controls, clearer spacing and actions.

Category is no longer free text: the editor derives the real category id/name pairs from the tenant owner-product catalog and saves both categoryId and categoryName. VAT is no longer a numeric free-text field: the editor lists the tenant's active VAT departments and writes the selected department's real vatRate.

The supplier-preservation correction merged in PR #1694 is retained unchanged: product details must load supplierCodes before the editor opens and the save roundtrips those supplier links. Barcode/store metadata and existing product-card payload fields remain preserved. No stock, sale, payment, invoice or fiscal logic is changed.

PR #1704 first CI #4280 and second CI #4281 stopped at the mandatory checkpoint policy before build/tests; #4281 explicitly reported that a new file under CHECKPOINTS/CHANGES was required. This checkpoint satisfies that gate. Merge is forbidden until replacement CI is green. LIVE publication, LAB save/readback and explicit USER visual acceptance remain required before TODAY-02 can be marked PASS.
