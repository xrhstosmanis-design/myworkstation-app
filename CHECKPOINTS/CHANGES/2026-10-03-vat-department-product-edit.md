## 04/10/2026 - TODAY-02 supplier preservation - AWAITING CI / LAB

Owner continuation: `agent/today02-preserve-suppliers-20261004`, same TODAY scope. Production read-only observation: LAB store cmtpopbgo000trhb5ng9ytiru → full Backoffice → commercial functions → Management → VAT Departments → VAT 13% → 15 products → pencil LAB EXCEL TEST 1. Correct SKU/card opened. Cancel returned to same department. Save NOT TESTED.

Source FAIL before edit: saveEdit sent supplierCodes:[] while owner-products PATCH deactivates SupplierProductLink rows omitted from its payload. Catalog does not return supplierCodes. No production save was performed to reproduce this destructive effect.

Bounded correction: load the existing tenant-scoped product details before exposing the edit form, preserve its supplier IDs/codes in the draft and pass them unchanged to the existing card endpoint. Missing/malformed supplier data refuses to open the editor. No server/API, VAT assignment, stock, pricing rules, pagination or checkout changes. Preserve barcode/store metadata and all other existing payload fields.

Required regression checks: multiple supplier codes survive a name-only edit; unavailable details prevents editing; empty verified supplier list remains allowed; same department/page reloads after save. Local regression results: 28/28 targeted tests PASS on Node 24.19.0 (3 actual-handler supplier roundtrip cases plus 25 existing VAT/owner-products checks). Node20/full frontend build and full CI remain pending; package installation did not complete in the current environment. Production save, store-control readback and USER visual acceptance remain NOT TESTED; CI alone cannot close TODAY-02.

# 03/10/2026 — VAT Department product editing

Status: IMPLEMENTED / AWAITING CI

- Pencil action in VAT Department product list is now functional.
- Loads the authoritative company product card and allows editing core product fields.
- Save uses the existing owner-products card endpoint and refreshes the same VAT Department page.
- Existing VAT Department assignment is not silently derived from category and the central VAT mapping rule remains unchanged.
