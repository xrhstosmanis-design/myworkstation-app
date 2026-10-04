# #27 — optional existing expense document / same owner continuation

ASSIGNED codex/task27-expense-document-20261004, same #27 page. Base cd415305; health b8f685ce53851a5944dc834788313debfdc444ba observed 04/10. Prior bounded LAB PASS protected; new expense-document UI NOT TESTED.

Code inspection: OwnerPaymentQuickActions OTHER/UTILITIES always send NO_DOCUMENT. StorePosPaymentsModal attaches photos only. Existing store-transactions DOCUMENT API already validates same company/store, supports OTHER_EXPENSE and requires an idempotency key. Overview exposes DRAFT/APPROVED documents. This scope changes only optional document selection for Owner OTHER/UTILITIES actions; no TODAY-09 landing layout, POS modal, server, stock, invoice finalization, fiscal or licensing change.

Preserve existing no-document payments, supplier modal and all other categories. Only APPROVED existing documents offered; server remains authority. Partial/duplicate/inconsistent links keep unknown VAT under existing report guard. Selecting a document does not create/approve an invoice or default the amount. No production financial action is authorized for diagnostic evidence; no repeat payment. Historical-cost, partial allocation policy, independent Owner and full #27 remain OPEN.

Acceptance: CI/build; exact deployed revision; read-only LAB form open/select/clear, no submit, verify approved options and warnings with fresh two-till controls. This proves form only, not saved document payment or positive VAT. Any transactional acceptance needs a separately documented scenario and fresh before/after evidence. No new PASS/manual claim until actual observation. Same page retains ownership; next action complete bounded client change and CI.

Local Node20: frontend build and TABLE_SERVICE bundle guard PASS; 22 existing report/date/print/payment-evidence regressions PASS, git diff --check PASS. Full GitHub CI remains required; no new live or saved-payment PASS.

## Publication / retained ownership
PR1706 merged 1a4fe59ae5c0d706f38026280f411bd604cb90ff after full PR CI37226180353 SUCCESS. Main CI37226345081 SUCCESS; guarded Render run37226486682 SUCCESS; /api/health independently confirms exact1a4fe59ae5c0d706f38026280f411bd604cb90ff. The available browser shows the canonical Platform Admin login form; no authenticated LAB/independent Owner session is available. No credentials or production transactions entered.

Same #27 page retains ownership. Optional document selector implementation is not a LAB PASS, saved expense/positive VAT remain NOT TESTED. Protected earlier report PASS unchanged. Next action after exact runtime verification: authenticated read-only LAB OTHER/UTILITIES select/clear/cancel with fresh two-till controls; do not submit a payment merely for evidence. Other #27 inputs remain OPEN.

## 04/10 ~22:12 Athens — before read-only LAB form review
Authenticated SA through canonical Platform Admin -> MYWORKSTATION LAB -> ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ full BackOffice. Health exact4f31ebfd936c07d9c92b98284751d595f7c26b66 (contains PR1706). Store cmtpopbgo000trhb5ng9ytiru, cloud browser, physical POS/SKU/quantity/payment method N/A; no submit authorized. Fresh shift controls: MAIN2 transactions/cash2.40/cards+IRIS0/total2.40, opened27Sep20:24,last01Oct12:51. LAB-POS-02 2transactions/cash0/cards+IRIS0/total0,opened26Sep01:33,last—. New selector NOT TESTED before opening. Actions limited to open/select/clear/cancel and refresh controls; no financial or stock write.

Actual read-only LAB: OTHER opens with8 options, default no-document. Selected existing B1970/31.01 then cleared; amount stayed blank; canceled without submission. Screenshot task27-expense-document-lab.jpg shows grid overflow from long select options, so overall selector acceptance LAB FAIL, no PASS/manual claim. Fresh control reload afterward keeps MAIN2/2.40 andPOS02 2/0/opening/last unchanged. B1970 was only a local selector demonstration, not asserted to be an eligible expense or VAT evidence. Bounded causal fix minWidth0 on selector label/select, width100%/border-box. No payment/API/report behavior change. AWAITING CI/exact deploy/review.
