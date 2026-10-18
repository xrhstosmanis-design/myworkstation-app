## 18/10/2026 13:32 Europe/Athens — WHOLESALE-ORDER-LOCK-SNAPSHOT-01 / EXECUTOR RECOVERED / ASSIGNED / NATIVE NOT TESTED

User says «ΞΕΚΙΝΑ» again. Retained owner codex/wholesale-suite-20261017, follow-up source fix/wholesale-order-lock-snapshot-20261018. Executor recovered to an older local snapshot; gitstatus showed only generated untracked package-lock.json. Restored exact remote receiptPR2694/head6f3ffb09 and reconciled current maina4d4efef; prior failed local update did not survive. No follow-up source/test edit yet. Shared record/PDF regeneration is now possible and clears the technical outage blocker after green claim merge; no user reapproval required. Independent source-level RR/advisory/higher-tier race analysis and exact old CI/release evidence below remain unchanged. Full product OPEN; hosted/LAB NOT TESTED.

Three workers: field_sales owns only order lib/unit tests after claim merge; b2b_site owns only deterministic registered native HTTP regression; wholesale_core reviews lock/snapshot invariants read-only. Coordinator owns common records, isolated runtime setup, old-failing/new-passing native receipts, review and publication. Bounded order ReadCommitted + existing checked-row SHARE locks, no quote-endpoint isolation change and no financial/stock/fiscal/publicauth/offline/standalone/production DB/server/backup action. Existing5-concurrent submissions, exactNET/GROSS, tenant/store/product/role checks, immutable replay/current scope, changed-payload conflict and atomic rollback controls protected. Next action green merge recovered claimPR2694 with regenerated trackerPDF, then add native regression proving originalRR fails, implement RC and require corrected full CI. Prior blocked status is historical, not a release of ownership.

## 18/10/2026 13:19 Europe/Athens — WHOLESALE-ORDER-LOCK-SNAPSHOT-01 / PENDING CLAIM / EXECUTOR BLOCKED / DO NOT MERGE BEFORE PDF REGENERATION

Retained owner codex/wholesale-suite-20261017. SourcePR2692/maina4d4efef passed PRCI39117550996 and exactmainCI39118006237/job117647740030 with2972PASS/0FAIL/0SKIP plus6backup/all required jobs. Ordinary release39118364642 succeeded; Render deploydep-dba9nleq1p3s73as1r3g is live at exacta4d4efef, finished10:15:26Z. Separate hosted functional/LAB acceptance remains NOT TESTED. Prior scoped native proofs remain valid; full product is OPEN.

Final source review independently confirmed by coordinator, pricing and order workers: RepeatableRead starts the advisory-lock waiter's snapshot before the predecessor commits. T1 holds originaltierP1 SHARE locks; a higher eligible tierP2 INSERT can commit independently. T2 starts afterP2 but beforeT1commit and waitskey. Its subsequent stale snapshot can miss the accepted order yet seeP2, returning PRICE_CHANGED before uniqueness retry; the UI would incorrectly unlock as if nonaccepted. This is concrete causal source evidence, not a reproduced native FAIL yet. Do not call the correction implemented or source acceptance complete.

Pending bounded follow-up branchfix/wholesale-order-lock-snapshot-20261018: change only order transaction to ReadCommitted, keeping advisory key serialization, current authorization, mandatory SHARE locks on company/store/customer/association/list/product/store-membership/chosen tier, exact decimal amounts, atomic request/event and bounded retries. The lookup after lock then sees committed predecessor; locked master data plus final batched tier query define coherent pricing. Quote endpoint remains RepeatableRead; later tier insertions are not serializably prevented. Order worker owns lib/unit tests; coordinator owns deterministic registered native HTTP test/docs/review; pricing worker reviews read-only. No other owner is taken over.

Required native regression: gate T1 after old-tier pricing and before actual request INSERT via transaction proxy (real PostgreSQL, no pricing stub); insert higher eligible tier through another connection; start same-key T2, verify its advisory wait via pg_locks, releaseT1, require201+200sameorder/originalsnapshot and one event. Prove oldRR fails and correctedRC passes, retaining existing scope/rollback/ledger controls and fullCI before merge. No financial/stock/fiscal/publicauth/offline/standalone/module/productionDB/backup/restart change.

BLOCKER: exec-server transport disconnected during the attempted local claim update. Root recovery and independent worker pwd/gitstatus probes cannot produce output. Local command completion/file state unknown; no follow-up source/test edit has been made or authorized by a merged claim. This text is saved directly on receiptPR2694 to preserve findings. Existing tracker PDF still represents the prior CI receipt and could not be regenerated during the outage; this PR MUST remain unmerged until executor recovery, gitstatus inspection, reconciliation with latest main, complete record/PDF regeneration and green claim CI. After claim merge implement only the scoped fix and deterministic regression, require fullCI and exact release before functional acceptance. Owner retained, no handoff or duplicate claim. SourcePR2692 is saved; receiptPR2694 is OPEN/BLOCKED. Checkpoint CHECKPOINTS/CHANGES/2026-10-18-wholesale-orders-core.md.

# Wholesale core: implementation specification

## Current implementation — 18 October 2026

The shared quote/SUBMITTED-request slice is merged in source a4d4efef after PR2692/headc735afe8/fullCI39117550996 passed2972/0/0 tests plus6backup checks, including native PostgreSQL concurrency and rollback. Exact main CI/release and hosted/LAB acceptance are pending; full product remains OPEN. ClaimPR2691/CI39116588681 merged3a2835bd before source. Authoritative pricing requires explicit NET/GROSS, selected store and active membership; atomic immutable order snapshots support bounded same-key retries without financial/stock/fiscal posting. Mounted UI preserves unresolved body/key and locks its own navigation. No offline/reload/crash recovery is implemented. The B2B customer site, field-sales identity/application and standalone packaging are still OPEN. Historical planning and first-release evidence below are retained as dated context; this entry is current. See CHECKPOINTS/CHANGES/2026-10-18-wholesale-orders-core.md.

Started 2026-10-17 23:58 Europe/Athens. Documentation only; no implementation or operational acceptance is asserted.

## Status and execution gate

The owner requested an integrated and independently sold wholesale product, a customer B2B site and a field-sales application. This specification translates the shared core requirement into bounded work. It does not publish a claim, transfer ownership, enable a module, create a service or authorize a production transaction.

Repository `AGENTS.md` requires the exact owner, branch, scope and checkpoint claim to merge into `main` before source changes or state-changing LAB actions. Current preparation has not satisfied that gate. The historical phase-one owner `agent/wholesale-b2b-20261001` remains named in `CHECKPOINTS/CHANGES/2026-10-01-wholesale-b2b-phase1.md`; an explicit reconciled handoff is required. Publication was blocked by automatic approval review; no alternate publication path is part of this plan.

## Verified source baseline

Read-only inspection of the local main checkout found:

| Area | Present code | Operational evidence |
|---|---|---|
| Wholesale bootstrap | `server/src/wholesale-b2b-bootstrap.js` creates WholesaleCustomer, WholesalePriceList, WholesalePriceListProduct, WholesaleCustomerPriceList at runtime | Source only; no schema bootstrap executed |
| Master routes | `server/src/routes/wholesale-b2b.js`: list/create customers, list/create lists, upsert product tier, assign customer list | No native HTTP/LAB acceptance observed |
| Access | `server/src/index.js` mounts `/api/wholesale` after `auth` and `requireCompanyModule("CORE")`; router allows SUPER_ADMIN, OWNER, ADMIN, MANAGER and rejects STORE_OPERATOR | No standalone wholesale entitlement |
| UI | `client/src/components/commerce/WholesaleB2BPanel.jsx`, opened through CommerceLauncher | Customer and price-list forms only |
| Existing retail wholesale | `server/src/routes/price-catalog.js`, `server/src/routes/store-pos.js`: CustomerWholesalePrice associated with Customer and Product, scoped to current store | Existing tests and historical proofs must be preserved; not rerun here |
| Orders and balances | No wholesale core quote/order/dispatch/receivables lifecycle in the inspected wholesale files | Planned |

The checkout is shallow. Main history since the original phase-one work must be read before code changes; this document does not claim that historical check is complete.

Known source defects: customer listing does not join the saved price-list association; empty customer-list selection does not unlink; form reset uses React `event.currentTarget` after an asynchronous boundary; saved product tiers have no listing route. Cross-company customer/list/product checks exist in route logic, but independent foreign keys do not enforce matching company IDs.

## Canonical identity and isolation

- Company identity comes from the authenticated server principal. Never accept body `companyId` as authority. Super Admin support targeting must use an existing explicit validated company context, not an unrestricted body override.
- Product identity is existing `Product.id`; store availability and stock remain `StoreProduct`; barcodes remain `ProductBarcode`. Do not create another product or stock catalog.
- Existing retail identity is `Customer`; phase-one B2B identity is `WholesaleCustomer`. These are separate models today. Never silently merge on name or tax ID or redirect POS pricing to B2B tables. A later explicit verified mapping can link them without rewriting historical transactions.
- WholesaleCustomer is company-wide master data. Store-specific documents, availability and operational lists require an explicit validated store. Missing store selection must not silently turn an operational screen into an all-company query.
- B2B principals resolve exactly their linked customer on the server. Field-sales principals resolve a server-owned assignment set. Existing management tokens are not reusable customer or field-sales credentials.
- A suspended company, expired license or revoked principal must be rejected server-side. Offline drafts cannot bypass these checks at synchronization.
- Composite tenant foreign keys or equivalent transactional validation must protect every new cross-reference. No global public identifier lookup should reveal another company's entity.

## Follow-up read-only monetary evidence - 18 October 2026

After the first source slice, read-only investigation confirmed that `server/src/routes/price-catalog.js` derives saleNet from salePrice divided by (1 + VAT rate/100), and derives wholesaleNet from existing CustomerWholesalePrice the same way. `server/src/routes/store-pos.js` multiplies the resolved unit price by quantity and sums payable lines without adding VAT again. Existing retail salePrice and retail customer-specific wholesalePrice therefore carry gross semantics.

The separate WholesalePriceListProduct.unitPrice currently has no pricing consumer beyond bootstrap, upsert and saved-tier listing. Its monetary basis remains unclassified; gross retail semantics cannot be transferred to it by assumption. The next quote slice must add explicit nullable NET/GROSS metadata and preserve legacy numeric values; only explicitly classified selected tiers can be quoted. New writes without a declared basis must not leave a stale classification valid. No classification, migration, tax-policy decision or quotation implementation was performed in this investigation.

## Commercial and valuation decisions

The following proposed defaults require a recorded decision before the corresponding monetary implementation:

| Topic | Proposed contract | Decision still required |
|---|---|---|
| Currency | EUR for first release; explicit currency on quote/order | Whether multi-currency is required |
| Price basis | Candidate: explicit NET metadata for new B2B prices; response shows NET, VAT and GROSS | Existing salePrice and tier semantics must first be verified; metadata migration/defaulting requires approval of the documented evidence; never reinterpret old values automatically |
| Units | Existing product base unit; package quantity converted with an explicit stored conversion snapshot | Source of units/conversions and whether fractional quantities are permitted by product |
| Tier selection | Highest eligible minimumQuantity in the customer's active list | Treatment of duplicate product lines and customer-specific overrides |
| Discounts | A fixed tier price takes precedence; otherwise one applicable tier or list percentage, without implicit stacking | Existing payload accepts fixed price and discount together; choose rejection or explicit precedence |
| Fallback | No eligible agreed price returns an explicit quote error until fallback policy is configured | Retail fallback must be deliberate and declare gross/net conversion |
| Rounding | Decimal arithmetic; unit precision four decimals, totals two; round per line then sum | Accountant-approved VAT/discount order and fiscal provider compatibility |
| Credit | Quote displays verified exposure; submission can require manager approval above limit | Definition of exposure, overdue policy and authoritative receivables ledger |
| Inventory | Draft/submit does not post stock; reservation/dispatch are separate later transitions | Reservation expiry, backorders, partial dispatch, negative-stock policy |

Proposed new wholesale price metadata migration: add an explicit price-basis marker without changing old numeric values, classify existing records only from verified provenance, block quote use of unclassified values, and introduce new NET values only after the recorded policy decision. Existing retail salePrice interpretation is not inferred here.

Money and quantity cross the API as validated decimal strings. Reject NaN, Infinity, negative quantities, unsupported scale, excessive values and unknown units. Client totals are display-only; the server recalculates on submission. Never claim fiscal validity from a commercial quote.

## Proposed API contracts

These are planned contracts, not live endpoints except the existing master paths identified above. Prefix `/api/wholesale`; management routes retain existing authentication and licensing until a separately reviewed additive entitlement design is implemented. Responses use `{items, page, pageSize, total}` for paginated lists and `{error, code, details?}` for structured failures. Whitelist request properties and bound arrays, search length and page size.

### Slice 1: stabilize existing masters

- `GET /customers?page=1&pageSize=50&q=...`: own-company customers plus nullable `priceListId`, `priceListName`, `priceListActive`; joins explicitly constrain company. Mark inactive assigned lists accurately rather than silently deleting history. Pagination must be backward compatible with the current UI.
- `PUT /customers/:customerId/price-list` body `{priceListId: string|null}`: explicit null unlinks only the own-company association; non-null requires an active own-company list and customer. Validate and mutate transactionally; unknown/foreign customer returns 404, invalid list returns 400 without mutation. Missing property is invalid, not an unlink instruction. Return `{customerId,priceListId}`.
- `GET /price-lists/:listId/products?page=1&pageSize=50`: own-company list and product joins; return persisted tier `id,productId,sku,name,minimumQuantity,unitPrice,discountPercent,updatedAt` without rewriting prices.
- Preserve existing creation/tier routes. Capture the form DOM reference synchronously before awaiting; retain submitted values on failure and reset only after confirmed success. Add request cancellation or generation guards where context changes could expose stale results.

### Slice 2: authoritative quote

`POST /quotes` body:

```json
{"customerId":"customer-id","storeId":"store-id","items":[{"productId":"existing-product-id","quantity":"2.0000"}]}
```

Return `{quoteId,expiresAt,currency,priceBasis,customerId,storeId,items,totals,warnings}`. Each item returns productId, unit/conversion, baseQuantity, selected price source/tier, decimal unitNet, discountNet, netTotal, vatRate, vatTotal and grossTotal. Totals are net, VAT and gross, with tax subtotals. quoteId binds normalized items, actor scope, customer, store, pricing version and expiry. Verify all products are active and eligible in the explicit store. Quote has no stock, financial or fiscal side effects.

### Slice 3: submitted commercial orders

The shared first-order contract for all three participants is:

```json
{"clientOrderId":"stable-client-id","customerId":"customer-id","storeId":"store-id","items":[{"productId":"existing-product-id","quantity":"2.0000"}],"notes":"optional","quoteId":"server-issued-quote-id"}
```

- `POST /orders` accepts that contract. Actor and channel BACKOFFICE/B2B/FIELD_SALES derive from server credentials, never a trusted client field. B2B adapter derives customerId from authentication; sales adapter verifies the customer's active assignment. Server recomputes prices and rejects a stale quote with 409 PRICE_CHANGED and a new reviewable quote. First successful request returns 201 `{id,revision,status:"SUBMITTED",...}`. Submission creates a commercial order only: no stock, sale, financial or fiscal posting.
- `GET /orders?storeId=...&status=...`: management requires explicit store; B2B implicitly constrains linked customer; sales implicitly constrains assignments. Detail lookup `GET /orders/:id` enforces the same scope.
- An optional DRAFT editor and draft API are a later slice and must not change the initial shared SUBMITTED contract. Locally prepared items are not an accepted server order.
- Later edits require expectedRevision and an explicitly legal editable state. Atomic compare-and-swap returns 409 STALE_REVISION for concurrent changes.
- Later `POST /orders/:id/cancel` requires `{clientOrderId,expectedRevision,reason}` and an authorized unfulfilled source state. Cancellation of a dispatched/fiscalized document is outside this slice.

Unique `(companyId, principalId, operation, clientOrderId)` plus a canonical payload hash provides replay safety. Same key and payload return the original committed response; changed payload returns 409 IDEMPOTENCY_CONFLICT. Atomically commit order, items, replay record and audit. Concurrent identical requests must not create duplicate orders. Principal identity persists across credential refresh and must not be a short-lived token value. Avoid leaking other-tenant idempotency records.

### Later lifecycle

First-release entry is SUBMITTED. Planned subsequent progression: SUBMITTED → CONFIRMED → PICKING → DISPATCHED → COMPLETED. An optional later draft editor may precede submission, with explicit authorized cancellation/partial-fulfillment rules. Each transition has legal source states, actor rights, expected revision, idempotency and transactional audit. Confirmation snapshots customer identity, address, tax and pricing. Dispatch posts stock through the existing stock service once, only after a dedicated acceptance gate. Completion/invoicing cannot be inferred from one another. Invoice issuance, myDATA, returns, collections and accounting use their existing owned modules through reviewed integration contracts; they are not implemented by adding an order status.

## Implementation sequence and boundaries

1. Publish reconciled ownership and evidence claim; inspect current history and relevant manuals. Current preparation stops before this execution gate.
2. Fix existing master association/UI defects and saved-tier visibility; preserve existing routes and retail pricing.
3. Settle valuation decisions; implement a pure pricing resolver and a read-only authoritative quote endpoint.
4. Add isolated SUBMITTED order service and backoffice view. B2B and sales channels integrate with this service rather than creating duplicate order tables.
5. Add tenant-scoped B2B and seller identity/assignment endpoints with separate access tests. Do not expose management price-catalog endpoints containing purchase cost to customers or sellers.
6. Add reviewed standalone entry, commercial entitlements and branding/domain management without requiring retail POS usage or duplicating the repository. Standalone does not automatically mean offline.
7. Implement reservation/picking/dispatch, fiscal integration, receivables/collections and returns as independently claimed bounded slices.
8. Run complete end-to-end acceptance before describing the product as ready to sell. Local tests/CI are not LAB or USER PASS.

## Acceptance matrix

| Slice | Required positive proof | Required negative/control proof |
|---|---|---|
| Master association | Assign → readback → reload; explicit null unassign; active list selection | Foreign company references rejected; missing property does not unlink; failures preserve original link |
| Master UI | Creation resets after success without exception; persisted association and saved tiers visible | Failed save preserves values; delayed old-context response discarded; forbidden role denied |
| Tier persistence | Zero fixed price and supported quantity precision survive roundtrip | Invalid numeric/ambiguous price input rejected; no retail price change |
| Quote | Boundary quantities select intended tier; explicit unit conversion; agreed decimal/VAT fixtures | Foreign/inactive customer/product/list/store; missing store; stale price; cost data excluded |
| Submitted order | Real registered HTTP route and isolated native PostgreSQL transaction create expected SUBMITTED order/items | No StockMovement, sale, payment or fiscal delta; foreign actor cannot read/change order |
| Replay/concurrency | Concurrent same-key requests return one order; independent keys work | Different payload reuse 409; stale edit 409; transaction failure leaves no partial records |
| Channel access | Portal only linked customer; seller only assigned customers; management own company | Forged customer/actor/channel/company rejected; revoked assignment/session/license rejected |
| Lifecycle | Each approved legal transition and audit occurs once | Illegal transition, duplicate dispatch, missing revision, expired offline authority refused |
| Existing behavior | Current POS wholesale/customer-switch/promotion and store isolation regressions pass | No new POS repricing, fiscal dispatch, production seed or credential change |

Use real mounted UI tests and registered route/native database tests; source-string assertions alone are insufficient for the new behavior. Required repository build, server suite, production invariants and isolated E2E checks must pass. After approved merge and ordinary guarded exact-revision release, perform scoped LAB tests with required before/after evidence and publish manual/checkpoint/tracker synchronization only for actually observed acceptance.

## Protected ownership and release rules

Preserve all existing claims in OPEN_WORK_TRACKER, PENDING_WORK and KAT_ACTIVE, particularly fiscal/RBS/Netlink, myDATA/invoices/OCR, inventory, payments/financial reporting, retail POS, standalone online ordering, assistant, authentication and production deployment. Shared files such as index.js, module-catalog.js, CommerceLauncher and bootstrap dependencies require the coordinator to serialize changes. Each participant owns separate new core, portal or seller files; no concurrent edits to an assigned scope. This plan does not transfer an existing owner's responsibility.

No production database migration, runtime bootstrap, seed, real sale, payment, stock posting, invoice finalization, backup change, server restart or deployment was performed for this specification. All new wholesale capabilities remain PLANNED / NOT TESTED until implemented and accepted with evidence.
