# No13 · Business Picture purchase credit-note sign

Owner: /root, existing page13–14; helpers cost and batch_review. Branch: `fix/no13-credit-note-sign-20261121`. BEFORE-SOURCE claim21/11/2026. Explicit owner approval covers public publication of this bounded correction and its documentation. Existing overall financial owner and every other assignment remain unchanged.

## Existing evidence and causal defect

Read-only existing MYWORKSTATION LAB query21Nov07:45:46UTC, transaction_read_only=on:18 approved documents, one positive CREDIT_NOTE. Raw gross2135.8916 versus supplier-canonical signed gross2127.3488. CreditSeptember2026 net3.7800/VAT0.4914/gross4.2714. Actual Business Picture selected LAB01Sep–21Nov2026 ALL displayed2135.89, matching rawSQL. The owner-payments purchase aggregate currently sums stored amounts directly; existing supplier-control negates CREDIT_NOTE. Difference8.5428gross is confirmed; no new invoice/payment/stock action was used.

## Exact bounded source claim

Only change the three purchase SUMs in `server/src/routes/owner-payments.js` to the existing supplier-control CASE convention for totalNet/totalVat/totalGross. Preserve documentCOUNT, APPROVED/tenant/store/date predicates, cost computation, expense/payment treatment and every original record. Do not use ABS: already-negative stored credit amounts follow the same existing canonical negation convention. No schema/profile/pins, auth/permissions, fiscal, stock, supplier settlement or No14 changes.

Own new regression file proposed: `server/test/business-picture-purchase-credit-notes-postgres.test.js`. Execute real purchase SQL/handler with isolated native PostgreSQL, positive and negative credit semantics, invoice/count retention, day/month/total aggregation, draft/cancelled/foreign-company/other-store exclusion, unchanged-data fingerprint and actual CSV/print helpers. Existing PARTIAL/CENT/ZEROVAT, sales returns/void,500-pack and original-correction proofs are protected and not replayed merely for documentation.

## Status and acceptance

BEFORE SOURCE / NOT IMPLEMENTED / AWAITING CI AND LAB. Independent read-only causal/scope review agrees. Publish this claim to main before editing source/tests. Require targeted regression then exact fullCI, merge, successful fullmainCI and normal guarded deployment. After exact revision, read-only comparison of the SAME existing credit should show LAB gross2127.35, delta-8.5428, netdelta-7.56/VATdelta-0.9828. No new financial transaction is needed. Real CSV/print and nativePDF/physicalpaper remain separate acceptance; no overallNo13/14PASS fromCI. Manual updates only after actual scoped LABPASS. Manual/hosted backuprestore remains deferred to another day.

Read current AGENTS/commonrule, complete active/tracker/pending/numbered and relevant profitability manual internally with bounded output; reconcile existing evidence above. Shared continuation05 is the common coordination journal. No14 source#4123 mergedbe74d9a, mainCI44881589761/deployment acceptance still pending; do not confuse merge withLIVE.

## Implemented after claim merge

Before-source#4124/head911135c12133147d571ee11d9a6f952079577f4c/tree1953629b94b5a449f54b1cad5b80523fcc2134ec, docsCI44882696991SUCCESS(3requiredgreen/2docs-onlySKIP), merged3ea0ac417dc7c4d2f21ef31c31cc3be68ec68e40 BEFORE runtime/test edits. Public owner approval resolved the earlier bounded publication gate.

Runtime diff is exactly one line: three purchase SUM CASEs negate CREDIT_NOTE using the existing supplier convention. New test executes the real registered/business-picture handler and real tagged purchase SQL against native isolated PostgreSQL18.7/Node20.20.0. Baseline RED128.2714 versus expected119.7286 reproduces the8.5428gross error; identical assertions GREEN1PASS/0FAIL/0SKIP after the runtime change. Six actual purchase queries/eight handler calls including role/store denials; positive/negative credit, signed non-credit, approved/status/company/store/date controls, counts/day/month/total, actual CSV/print helpers and unchanged document fingerprint. Sales/cost/expense queries are deliberately stubbed empty, not claimed as exercised or reenacted. Native cluster stopped/removed.

Thirteen existing dates/owner-picture/print/provisional-value tests PASS. Six existing delegated company-owner report tests PASS on final retry. The initial combined run had13PASS plus one module-load failure from missing unchanged sparse middleware; first failed-file retry found another missing unchanged lib. Fetching the unchanged server/src tree fixed the checkout and rerunning ONLY the failed file yielded6PASS, with no source/assertion changes. Preserve those initial logs as setup failures, not claim an all-green initial run. Total20distinct tests PASS/0FAIL/0SKIP in final tested scope. Syntax and git diffcheck PASS. No client behavior changed, so full build is delegated to exact-sourceCI.

Logs: /tmp/no13-credit-red.log, /tmp/no13-credit-green.log, /tmp/no13-credit-regressions.log, /tmp/no13-credit-owner-regression.log, /tmp/no13-credit-owner-regression-final.log. Local files are diagnostic evidence only; no credentials or real business data entered synthetic tests. Full remoteCI/review/merge/deployment and same-existing-credit read-only LAB acceptance pending. NativePDF/physicalpaper and overall13–14 remain OPEN.

Independent final source review CLEAR: runtime3SUMs and real-handler/nativeSQL test inspected, no blocker or scope expansion; reviewer did not rerun tests.
