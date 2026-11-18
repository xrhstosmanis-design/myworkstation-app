# WAREHOUSE-INVOICE-REVIEW-UI-01

Owner /root, same user-approved conversation, 18 November 2026. BEFORE SOURCE / NOT TESTED.

User screenshots show oversized archive filters/footer, missing VAT department/category/subcategory in draft line matching and zero display markup for previously matched products. Scope: compact shared archive layout, dependent taxonomy controls for both existing/new draft products, read-only markup derived from invoice per-stock-unit gross cost and effective store retail. Preserve explicit retail proposals, package/discount/excise arithmetic, store/company/role checks, original description, barcode matching, original settlement, no automatic product/price write on opening.

Read current AGENTS/common rules, full tracker/pending/active content internally and relevant invoices/inventory manual and source. Existing #4029 technical LIVE, common LAB acceptance pending. Previous linked green checks and manual markup/package PASS retained. Invoice/OCR extraction, No2 monthly report, table service and automatic-report owners untouched.

Publish claim before implementation. Validation: actual mounted editor/read-only display, selected-store and category relation rejection, preserve financial/stock behavior and frontend build/full CI. No financial/stock or finalized invoice operations in hosted tests. New acceptance stays AWAITING COMMON LAB until observed.

## Source candidate / AWAITING COMMON LAB

Claim #4039 merged893e009c after green docs CI44398751052. Implemented compact shared filters/header/footer (two desktop control rows), dependent taxonomy editor for existing/new products, current selected-store taxonomy/retail reads, explicit submit-only atomic store overrides plus audit, and persisted VAT department for newly created products. Already-linked grid markup derives from proposed retail when present or existing store retail and actual gross invoice cost divided by stock quantity. No opening/markup-display price writes, OCR changes, financial/stock posting or finalization. Existing store overrides leave other stores and global product intact. Staff cannot alter taxonomy via line PATCH; old staff flow remains.

Local build/TABLE_SERVICE PASS. Actual JSDOM editor, stale selection, dependent category controls, markup grid render and existing barcode-save regression PASS; isolated native PostgreSQL taxonomy test added for CI. Local runtime Node24.22.1 (Node20 authoritative CI still required), no local PostgreSQL configured: native tests explicitly skipped locally, not LAB PASS. Full PR/main CI and exact deployed health remain mandatory before common LAB acceptance.
