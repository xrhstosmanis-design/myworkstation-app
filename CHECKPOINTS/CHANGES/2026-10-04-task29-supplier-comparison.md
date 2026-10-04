# Task #29 — Σύγκριση Προμηθευτών

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
