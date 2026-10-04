# #27 — optional existing expense document / same owner continuation

ASSIGNED codex/task27-expense-document-20261004, same #27 page. Base cd415305; health b8f685ce53851a5944dc834788313debfdc444ba observed 04/10. Prior bounded LAB PASS protected; new expense-document UI NOT TESTED.

Code inspection: OwnerPaymentQuickActions OTHER/UTILITIES always send NO_DOCUMENT. StorePosPaymentsModal attaches photos only. Existing store-transactions DOCUMENT API already validates same company/store, supports OTHER_EXPENSE and requires an idempotency key. Overview exposes DRAFT/APPROVED documents. This scope changes only optional document selection for Owner OTHER/UTILITIES actions; no TODAY-09 landing layout, POS modal, server, stock, invoice finalization, fiscal or licensing change.

Preserve existing no-document payments, supplier modal and all other categories. Only APPROVED existing documents offered; server remains authority. Partial/duplicate/inconsistent links keep unknown VAT under existing report guard. Selecting a document does not create/approve an invoice or default the amount. No production financial action is authorized for diagnostic evidence; no repeat payment. Historical-cost, partial allocation policy, independent Owner and full #27 remain OPEN.

Acceptance: CI/build; exact deployed revision; read-only LAB form open/select/clear, no submit, verify approved options and warnings with fresh two-till controls. This proves form only, not saved document payment or positive VAT. Any transactional acceptance needs a separately documented scenario and fresh before/after evidence. No new PASS/manual claim until actual observation. Same page retains ownership; next action complete bounded client change and CI.

Local Node20: frontend build and TABLE_SERVICE bundle guard PASS; 22 existing report/date/print/payment-evidence regressions PASS, git diff --check PASS. Full GitHub CI remains required; no new live or saved-payment PASS.

## Publication / retained ownership
PR1706 merged 1a4fe59ae5c0d706f38026280f411bd604cb90ff after full PR CI37226180353 SUCCESS. Main CI37226345081 SUCCESS; guarded Render run37226486682 SUCCESS; /api/health independently confirms exact1a4fe59ae5c0d706f38026280f411bd604cb90ff. The available browser shows the canonical Platform Admin login form; no authenticated LAB/independent Owner session is available. No credentials or production transactions entered.

Same #27 page retains ownership. Optional document selector implementation is not a LAB PASS, saved expense/positive VAT remain NOT TESTED. Protected earlier report PASS unchanged. Next action after exact runtime verification: authenticated read-only LAB OTHER/UTILITIES select/clear/cancel with fresh two-till controls; do not submit a payment merely for evidence. Other #27 inputs remain OPEN.
