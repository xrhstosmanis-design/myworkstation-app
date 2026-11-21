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
