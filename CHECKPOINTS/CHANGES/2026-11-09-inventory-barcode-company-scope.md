# 09/11/2026 — INVENTORY-SCAN-WORKFLOW-01 / company-scoped barcode duplicate check

Retained owner /root. Read-only production diagnosis: barcode 52016165 has two active ProductBarcode owners outside the Rizareio company and zero within it. ProductBarcode uniqueness is (productId, barcode), not global barcode. The inventory product-create route incorrectly blocks creation based on other companies while product lookup correctly excludes those rows.

Scope: restrict duplicate checks for linked inventory product creation to the current company, retaining checks for inactive same-company owners and the existing transaction lock. No catalogue records changed. Validate same-company rejection and cross-company acceptance before release.
