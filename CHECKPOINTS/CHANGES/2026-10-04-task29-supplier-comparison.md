# Task #29 — Σύγκριση Προμηθευτών

## 04/10/2026 23:15 Athens — #29 LIMITED READ-ONLY LAB PASS / remaining ASSIGNED

Same owner `codex/task29-supplier-comparison-20261004`. PR1718 head7447d516 merged `e076548b4b10099c1f8940e18b9c13b55c487302`; PR CI4323/run37230194101 and main CI4324/run37230354263 SUCCESS (1818 tests PASS,0 FAIL,0 SKIP; isolated PostgreSQL/HTTP E2E/build/invariants). Guarded Render1983/run37230485716 SUCCESS and actual /api/health confirms exacte076548b before LAB. This supersedes the implementation's AWAITING CI/LIVE/LAB for the tested subscopes only.

Real cloudChrome, SUPER_ADMIN/support, MYWORKSTATION LAB / storecmtpopbgo000trhb5ng9ytiru, no physical POS: dedicated comparison opens,48 existing products load, refresh reloads48; product search ΑΡΑΒΙΚΗ returns2, SKU100028971 returns1, nonexistent query gives the correct empty state. Historical basis selection changes the visible basis and preserves matching evidence; the available sample has the same last/best cost. Switching to ΕΡΓΑΣΤΗΡΙΟ ΑΠΟΜΟΝΩΣΗΣ ΕΤΙΚΕΤΑΣ immediately clears prior LAB prices and ends with no approved purchases; returning restores48/default filters. Every product has only1 valid supplier; no cheapest badge/delta/savings claim. Example SKU100028971 ΑΡΑΒΙΚΗ ΠΙΤΑ ΓΑΛΟΠΟΥΛΑ / ΓΕΩΡΓΙΑΔΟΥ ΕΛΕΝΗ / B1970 /27Sep2026:1.250EUR perpiece, source note stored purchase conversion, difference— and explicit second-supplier requirement. This verifies the rendered single-price flow, not independent numerical reconciliation of original invoice lines.

Fresh shift controls before20:01:11Z and after20:14:06Z: MAIN2 transactions/cash2.40/cards+IRIS0/total2.40/open27Sep20:24/last01Oct12:51; LAB-POS-02 2 transactions/cash0/cards+IRIS0/total0/open26Sep01:33/last—. Fresh stock read after20:15Z: TEST1=11, TEST2=−2, last sale01Oct12:51:17, matching baseline. No transaction/stock/payment/invoice/approval/fiscal action. Independent Audit/StockMovement counts NOT TESTED.

Screenshot task29-supplier-comparison-1791144467123.jpg at23:07:47Athens captures the real installed single-price screen. Reveals dark subtitle on navy due to commercial-tools.css load order. Bounded follow-up in this change scopes header typography more strongly, fixes singular Greek counts and renames recorded correction evidence truthfully; no cost/access/read handler change. Frontend build/TABLE_SERVICE guard PASS. Follow-up CI/exact deploy and fresh visual readback remain required; no USER/VISUAL PASS.

Remaining: suitable existing approved purchases from at least2 suppliers for one product, independent net/discount/package evidence, live latest-vs-historical difference/tie/invalid-unit cases, independent Owner/adversarial tenant/module denial, live errors/mobile and explicit owner screenshot confirmation. No fabricated purchase/payment solely for evidence. Whole29 stays open. Next action: green follow-up CI, exact LIVE and screenshot readback, then identify an existing eligible multisupplier pair read-only. Same owner retained until named takeover. Protected Gates1–8/#20/#21/#14/TODAY/other claims unchanged. Tested instructions: docs/manual/supplier-comparison/PASS.md. All five closure records and numbered PDF synchronized here.

## Historical pre-implementation / superseded by newest record above

## 04/10/2026 — #29 Σύγκριση Προμηθευτών / ASSIGNED

Owner `codex/task29-supplier-comparison-20261004`, user requested another free numbered task22:29 Athens and confirmed start22:36. Scope: read-only comparison of existing APPROVED purchases for the selected owned store, equal base units/package conversion, net cost after recorded discounts, latest versus historical minimum, truthful ties/incomplete units, reachable dedicated screen with product search. No supplier/product editing, new invoices/approvals, orders, price changes, payment/stock/fiscal writes. Existing #21 supplier balances and #14 Internet search PASS protected; TODAY UI and other owners unchanged. Reference style explicitly requested22:37: supplied product-edit screenshot, dark blue heading, white body, readable fields/table and green primary buttons. Source findings: old comparison is nested under inventory intercepted by archive; old query mixes units and omits store/discount/document-type filters. LAB comparison correctness NOT TESTED; no PASS. Checkpoint `CHECKPOINTS/CHANGES/2026-10-04-task29-supplier-comparison.md`. Next: bounded #29 read model/access correction, CI, exact LIVE, read-only LAB acceptance.

## Pre-change gate / 04 October 2026

Read current AGENTS, active board/history, PENDING, numbered register, supplier PASS/manual and Task21 checkpoint. Current main9e7b94037b08585065375fe383ddb358acd01348; recent changes camera, TODAY02/03/04 and #27 expense forms, no #29 claim. The fetched full active list is retained for coordination; only relevant comparison/supplier checkpoints affect this independent scope.

Protected: Gates1–8 historical PASS, #20 gift stock, #21 supplier balances/export, #14 Internet search. No changes to supplier-control reports/editor, inventory postings/approval or other claimed scope.

## Baseline findings

- Production LAB browser via Platform Admin support, company MYWORKSTATION LAB, store cmtpopbgo000trhb5ng9ytiru, operator SUPER_ADMIN/support; no physical POS action.
- MAIN2 transactions/cash2.40 EUR/cards+IRIS0/total2.40, LAB-POS-02 2/cash0/cards0/IRIS0/total0/expenses120 observed before read-only investigation; TEST1stock11 and TEST2stock−2. Fresh financial delta independently NOT TESTED until after readback.
- Current entry: CommerceLauncher → Other commercial functions → CommerceHub. Inventory is intercepted to InventoryArchivePanel, so the old nested SupplierPriceComparisonPanel is not reached in the observed navigation.
- Source-only FAIL risk: GET comparison uses every company store, min unitCost, only PACKAGE conversion, no line netAmount/quantity, no credit exclusion or product/supplier tenant joins. UI names every value per piece and single supplier as cheapest.
- Actual comparison values / multivendor outcomes / roles NOT TESTED. No data created to manufacture evidence.

## Acceptance after green CI and exact LIVE

Open dedicated #29 screen from existing commercial hub; select LAB; refresh/search/empty state; verify visible units and document evidence, no null→zero or stale-store results. Independently compare available approved lines, record exact tested limits. Refresh both POS controls and reference stock. No supplier/payment/stock writes. Owner screenshot confirmation is required for VISUAL PASS; isolated tests alone never LAB PASS.

## Current status

ASSIGNED / IN PROGRESS. No implementation yet, no final or limited PASS. Next action: read existing purchase unit/discount semantics and implement one bounded read-only comparison correction.


## 04/10/2026 — #29 implementation / AWAITING CI, LIVE and LAB

Same owner `codex/task29-supplier-comparison-20261004`; assignment PR1716 merged8a7f766 after CI4315 PASS. Dedicated CommerceHub comparison tab, selected-store INVENTORY entitlement/tenant scope, approved INVOICE-only read model, recorded pack corrections or explicit purchase factors, document-weighted net costs, latest/historical basis with matching document/date, ties and single-price/incomplete-data safeguards. User reference style applied only to this new panel. No write handler/migration, no changes to other owners or #21/#14.

Local Node20.20.2: 12 targeted tests PASS; frontend build/TABLE_SERVICE guard PASS; generated Prisma locally without DB mutation. Full server1818 tests:1817 PASS, one efood legacy-schema PostgreSQL test cannot connect to intentionally non-production localhost:1. Full isolated PostgreSQL CI, merge, exact deploy and actual read-only LAB still required; no new LAB/VISUAL PASS. Checkpoint `CHECKPOINTS/CHANGES/2026-10-04-task29-supplier-comparison.md`.

## Exact implementation boundaries and evidence

- Only existing GET /api/commerce/supplier-price-comparison changes. Uses requireStoreModule(INVENTORY), req.targetStore company/id, tenant joins for Product/Supplier and store-scoped purchase/correction/original-order reads.
- Documents must be APPROVED INVOICE, so credits and drafts cannot become cheapest quotes.
- For direct document lines, sum recorded netAmount / sum known base quantity per product/supplier/document. PACKAGE only converts with positive explicit unitsPerPackage to PIECE; kg/g and litre/ml compare in their respective base dimensions.
- PURCHASE_ORDER stores financial quantities even when the line unit says PIECE. Read the recorded PURCHASE_PACK_CORRECTION cost or positive stored source-order conversion factors, including recorded excise; no description heuristics, schema changes or correction execution.
- Latest includes newest document even if invalid, remains null with reason. Best historical document is independently identified. Zero/negative/missing/nonfinite costs and unknown dimensions are never ranked. Duplicate product rows aggregate once per document; documentDate, createdAt and ID provide stable order.
- Frontend clears rows per request/store, uses keyed store remount and stale-request/unmount guard, shows error/empty/search-empty states. No cheapest badge or savings claim with fewer than two comparable suppliers; equal minima are explicitly tied.
- This is an independent new task29 panel/access entry. TODAY modules/product/supplier editors and supplier-control balances untouched. No manual entry until real LAB PASS.

## Validation limits

The first local broad run lacked generated Prisma (environment prerequisite); after local build:server,1817/1818 passed, only legacy efood PostgreSQL test failed on deliberately unavailable local DB. This is not a source/production efood failure. Remote CI's isolated PostgreSQL is authoritative before merge. No production database connection/seeds/migrations, no financial or stock operation.
