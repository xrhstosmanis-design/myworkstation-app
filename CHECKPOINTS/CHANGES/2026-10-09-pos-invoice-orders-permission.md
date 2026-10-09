## 09/10/2026 — POS-INVOICE-ORDERS-01 / IMPLEMENTED / AWAITING FINAL CI & LAB

PR #1986 full CI #4957 / run 37982996072 PASS on `13648a66`, including PostgreSQL tests, invariants and HTTP E2E. Rebased on newer main `4a69eb4` to preserve the independent AI-credit docs claim; source implementation unchanged. Final-head CI required before merge; physical LAB remains NOT TESTED.

Owner `feat/pos-invoice-orders-permission`. Claim merged in PR #1985 (`4cd333b`). Added POS «Τιμολόγια / Παραλαβές» using the existing `backofficeMenu.orders` checkbox for employee/manager operators. Server rechecks persisted profile on every invoice request, restricts company/store/order/line and keeps INVENTORY entitlement. Existing invoice settlement/duplicate/OCR totals/unresolved/stock posting guards remain. Email, whole-order deletion and global product-card tools are unavailable in this entry. No new checkbox.

Barcode permission also guards generated/provided barcode creation from an unresolved invoice line, in addition to resolve-existing addBarcode. Isolated negative regression covers both modes.

Existing editor uses operator request/session, isolated modal selectors and own-store filters; closing/revoking aborts pending requests and retains mounted cart. Runtime access failure denies entry. Operator identities remain in posting/audit records; User foreign keys use null for operator credentials. Shared assistant uses scoped request; global packaging rule editing stays outside this entry.

Validation: Node 20 frontend/server builds PASS; full local server suite 1978 PASS / 0 fail / 4 isolated-DB skips (1982 tests); 61 invoice/permission regressions PASS; actual POS+editor isolated DOM test PASS including new invoice creation, hidden/granted/revoked permission, fresh-access denial, edit save, product search/new line, return with cart unchanged and no checkout/email/fast-recovery. These fixture results are not LAB PASS. Full CI/invariants/isolated PostgreSQL E2E required before merge. Exact deployed release and authenticated physical LAB acceptance NOT TESTED. No production financial/stock transaction performed. Checkpoint `CHECKPOINTS/CHANGES/2026-10-09-pos-invoice-orders-permission.md`.

## 09/10/2026 22:25 Europe/Athens — POS-INVOICE-ORDERS-01 / ASSIGNED / NOT TESTED

Owner `feat/pos-invoice-orders-permission`. Explicit owner request: POS button «Τιμολόγια / Παραλαβές» opens the existing orders/invoice editor for the operator's own store. Enable solely through existing Operator → Access → backofficeMenu.orders («Παραγγελίες»); no second checkbox or broad Backoffice access. Preserve mounted POS/cart/shift and existing invoice settlement, duplicate, unresolved-line, total reconciliation and stock-posting guards. No OCR algorithm, automatic payment, fiscal, existing supplier/payment or other assigned scope takeover.

New bounded entry + authorization scope: fresh server profile check, employee and manager StoreOperator sessions, store/company/resource isolation and module/license gates; existing editor reused with operator token (never admin localStorage token); revoked access hides/closes workspace and denies APIs. Preserve separate barcode/retail/product permissions and email/central features. Required acceptance: granted/denied/revoked access, cross-store/company/order/line negative checks, open/edit/save/return with unsent cart retained, original admin paths preserved. Isolated fixtures/CI are not LAB PASS; physical authenticated LAB and exact release remain NOT TESTED. No production writes or old invoice resubmission for evidence.

Checkpoint `CHECKPOINTS/CHANGES/2026-10-09-pos-invoice-orders-permission.md`. Publish this independent claim to main before source changes. Other owners, Gate3 assistant PASS and POS auxiliary/header USER PASS remain protected. Next: implement bounded bridge and guarded reuse, test, full CI, exact healthy release then acceptance.

