# 09/11/2026 — Inventory same-draft product attachment

Retained INVENTORY-SCAN-WORKFLOW-01. Reconcile existing #3702 with main d99c1f9ba25d11997f4a8dc78d2604352660b94e after integration of #3701. Only existing attachment source/tests and the compact active register are carried forward. Existing barcode-store assignment, QR/PIN counting and prior receipts are distinct. Delegated detail pagination and line lookup are preserved.

Staff attachment remains scoped to the originating draft/store, requires live inventory.count and products.create grants inside the transaction, verifies active product/store membership, and returns the existing line on replay. No count, stock, grants, or financial write is part of the attachment.

Exact full CI and hosted delegated acceptance pending. Require saved-product same-draft attachment, no cross-draft navigation leak or duplicate, and unchanged stock/count controls. The #3696 report and file acceptance is separate.
