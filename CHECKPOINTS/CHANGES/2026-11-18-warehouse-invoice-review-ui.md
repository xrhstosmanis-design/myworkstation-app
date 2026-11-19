# WAREHOUSE-INVOICE-REVIEW-UI-01

Owner /root, same user-approved conversation, 18 November 2026. BEFORE SOURCE / NOT TESTED.

User screenshots show oversized archive filters/footer, missing VAT department/category/subcategory in draft line matching and zero display markup for previously matched products. Scope: compact shared archive layout, dependent taxonomy controls for both existing/new draft products, read-only markup derived from invoice per-stock-unit gross cost and effective store retail. Preserve explicit retail proposals, package/discount/excise arithmetic, store/company/role checks, original description, barcode matching, original settlement, no automatic product/price write on opening.

Read current AGENTS/common rules, full tracker/pending/active content internally and relevant invoices/inventory manual and source. Existing #4029 technical LIVE, common LAB acceptance pending. Previous linked green checks and manual markup/package PASS retained. Invoice/OCR extraction, No2 monthly report, table service and automatic-report owners untouched.

Publish claim before implementation. Validation: actual mounted editor/read-only display, selected-store and category relation rejection, preserve financial/stock behavior and frontend build/full CI. No financial/stock or finalized invoice operations in hosted tests. New acceptance stays AWAITING COMMON LAB until observed.

## Source candidate / AWAITING COMMON LAB

Claim #4039 merged893e009c after green docs CI44398751052. Implemented compact shared filters/header/footer (two desktop control rows), dependent taxonomy editor for existing/new products, current selected-store taxonomy/retail reads, explicit submit-only atomic store overrides plus audit, and persisted VAT department for newly created products. Already-linked grid markup derives from proposed retail when present or existing store retail and actual gross invoice cost divided by stock quantity. No opening/markup-display price writes, OCR changes, financial/stock posting or finalization. Existing store overrides leave other stores and global product intact. Staff cannot alter taxonomy via line PATCH; old staff flow remains.

Local build/TABLE_SERVICE PASS. Actual JSDOM editor, stale selection, dependent category controls, markup grid render and existing barcode-save regression PASS; isolated native PostgreSQL taxonomy test added for CI. Local runtime Node24.22.1 (Node20 authoritative CI still required), no local PostgreSQL configured: native tests explicitly skipped locally, not LAB PASS. Full PR/main CI and exact deployed health remain mandatory before common LAB acceptance.

## Combined source reconciliation

CI44400676745:6274PASS/1FAIL/3optionalSKIP. New native PostgreSQL and editor/markup tests passed; old supplier route harness lacked imported taxonomy schema. Dependency added, assertions retained. Main advanced to a9639f31 with No4 atomic line-transfer/shared helpers, CSV status and No2 claim. Preserve incoming helpers/atomic batch and integrate taxonomy inside shared patchPurchaseLine; preserve all peer tests/checkpoints. Reopened #4040 after no new run: merge conflict confirmed and resolved. New exact full CI required; prior partial result is not green or LIVE. No2 opening semantics remain with their owner.


## Technical release — 19/11/2026 00:15 Europe/Athens / AWAITING COMMON LAB

PR #4040 merged885f00f047cfe0a734cc0d526c68f01b4d7e279d after exact candidate8c359c7e full CI44403379025: all five jobs SUCCESS,6278 application PASS/0FAIL/3optionalSKIP plus8backup PASS. Exact main CI44405403976: all five SUCCESS,6279 application PASS/0FAIL/3optionalSKIP plus8backup PASS. Native PostgreSQL taxonomy/control/rollback, existing/new product persistence and staff/supplier regression tests executed successfully. Source and merged main seven warehouse/invoice runtime blobs independently identical; Epsilon PDF and No4/No13–14/No2 peer work retained.

Normal guarded release44408590060 SUCCESS. Render dep-dbv23qgu01pc73cj5cmg LIVE18/11 22:13:53.886UTC =19/11 00:13:53 Athens, exact885f00f047cfe0a734cc0d526c68f01b4d7e279d. Independent public no-cache check22:15:32UTC: /api/health200/ok=true/exactrevision and HTML200; linked entry-BZAeJSRd.js200 contains po-line-taxonomy, linked entry-j8b_acYn.css200 contains compact search/margin selectors. Both entry assets were discovered from actual public main JS. Other split entry/CSS assets also200. No new financial/stock operation performed. Four post-live error-log entries were existing operator-required POS rejections; no DB timeout in that bounded error-log window. Health alone is not a database or functional acceptance.

Current main documentation-only descendants through75d79fe75 retained. No manual deploy hook, workflow bypass or permission change. New user acceptance remains AWAITING COMMON LAB: compact visible product area and footer at the user's resolution, edit existing/new product taxonomy and reopen, already-matched markup displayed without opening/saving lines. Prior PASS behaviors retained; no new manual PASS or completion of broader invoice/warehouse work declared.
