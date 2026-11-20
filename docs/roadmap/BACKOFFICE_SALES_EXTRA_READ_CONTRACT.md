# No5 — additional native sales read contract

18 November 2026. CENTRAL-BACKOFFICE-ACCESS-01 remains ASSIGNED/OPEN. This is a source audit for the next independent batch, not implemented grants or LAB acceptance. Baseline local885e3af / remote22f8fffc, exact tree708eeb3263fc0291ec20ee1632dcf8e6c729d511. Existing advanced analytics/sales rights retain their behavior.

## Actual Owner panes

O10 in BACKOFFICE_OWNER_VIEW_COVERAGE.md has two functioning native readers. `client/src/components/commerce/installSalesAnalysisSuite.js` calls `/api/commerce/sales/unsold-products` for the unsold tab and combines `/api/commerce/sales/advanced-report` with `/api/store-pos/sales/journal` for the journal tab. Do not mount the DOM installer or combine these requests for a user holding only one new right.

| Native reader | Native source / scope | Required delegated boundary |
| --- | --- | --- |
| GET /api/commerce/sales/unsold-products | commerce-v1.js: selected active owned store; SALES_ANALYTICS; explicit Greece calendar from/to; active StoreProduct/Product; NOT EXISTS completed Sale in same company/store/interval; id/sku/name only | One independent selected-store read, exact single storeId/from/to, no unknown/duplicate/array parameters, valid actual calendar range. Live license/module/account/grant/revision checks before and after result. No product cost/barcodes/global catalogue, no implicit advanced-report permission. |
| GET /api/store-pos/sales/journal | store-pos-sale-display.js: STORE_MODE middleware; selected store optional for Owner; actual ISO instants default30days, latest500 POS/EXCHANGE/POS_REVERSAL rows; all statuses; scoped Store and Customer joins; payments/lines per sale; StoreTransaction actor-name subquery | Explicit single selected store and explicit interval mandatory for delegate. Dedicated early read projection before native ensureAudienceColumn ALTER. Strict response DTO with native financial/customer/actor information visibly described in permission; reject arbitrary query/body/mixed company scope. Do not grant current shift cancellation/return/fiscal operations. |

## Journal fidelity and limits

Native journal includes receiptNumber, total/subtotal/discount, audience, occurredAt/createdAt, status, transactionMode/delayedReason, reversalState/reversalKind/originalSaleId, fiscalStatus/source, storeName/customerName, actorName, payments(method/amount) and lines(id/productId/description/quantity/unitPrice/lineTotal). Native normalization adds display summaries and movement type. A read implementation should explicitly retain the financially relevant columns and bounded nested data, never spread arbitrary DB rows. Original/referenced identifiers must not reveal foreign entities through inconsistent historical links; redact unavailable references while retaining the allowed sale. Joined display names must retain company/store scope. Stored line description and transaction actor are historical text of an owned sale, not authority to load people/product details.

The native journal performs `ensureAudienceColumn()` at the start of GET. The delegated path must not call it, bootstrap, reconcile online sales, issue receipt/provider calls, alter stock, audit financial mutations or attach any action controls. Missing required installed schema must refuse clearly rather than migrate on read. Default Owner path remains unchanged.

Native unsold list is unbounded; a delegated bounded implementation must advertise its window and never silently label a partial list complete. Journal is a native latest500 window, not a full ledger; preserve that label and actual timezone/interval semantics. No export or broad report-family right is implied.

## Required acceptance before publication

Use mounted exact-route tests with real authorization and strict DTO validation, plus native PostgreSQL evidence for own/foreign/sibling rows, inconsistent joins, duplicate parameters, literal-bound date ranges and completed/noncompleted sales semantics. Revoke/change revision during read and prove no late payload. Test SALES_ANALYTICS versus STORE_MODE independently, all inactive license/session states, no implicit old-profile rights and unchanged Owner behavior. UI must clear on store/account/capability/date changes and discard delayed responses. Browser evidence is automatic in CI where available; human checks join the one final existing-LAB session. Do not repeat prior sale/invoice/return transactions.

Implementation, actual hosted read acceptance and both new independent capability keys remain NOT TESTED/OPEN. No source/permission/runtime behavior changed by this audit.
