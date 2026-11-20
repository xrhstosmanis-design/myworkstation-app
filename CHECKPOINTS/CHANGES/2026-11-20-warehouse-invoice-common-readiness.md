# Warehouse / invoice review — grouped acceptance readiness

20/11/2026 07:19 EET. Owner: same /root warehouse/invoice conversation. Existing CENTRAL-WAREHOUSE-FILTER-PARITY-01, WAREHOUSE-INVOICE-REVIEW-UI-01 and INVOICE-REVIEW-LINKED-LINE-01 retained. No new implementation or reassignment of No2/No5/No14.

## Current evidence

Latest main a020ce84e1688a16f2c3620ed62f6eefcd459a82 includes No5 changes around archive/store authority. Compared against our deployed885f00f0: compact CSS, invoiceLineTaxonomy helper and taxonomy validator are unchanged. Invoice line editor/grid remain unchanged; surrounding monthly inspection entry changed independently. Compared against05b5b350, both linked-line review bootstrap files are unchanged. Do not repeat the original A71942 transaction or change its saved status/amount.

Targeted actual mounted/predicate/regression tests on this exact current main with Node20:33 tests,32PASS/0FAIL/1nativePostgreSQLSKIP. Covers report/store parent visibility, stale company/API/authority responses, archive dependent taxonomy/VAT, explicit merge preview, barcode-to-existing save, taxonomy category relation/store boundary, linked markup without mutation and tissue/banner mismatch regression. No DATABASE_URL was available locally; the native skip is not a new PostgreSQL PASS. Reuse earlier successful full-CI native evidence from #4040/#4061 and current No5 source CI as their own scoped results.

At check start Render still reported LIVE9246dfcb70d514c10e7264e6c48a9e5a487fbed9. No5 mainCI44679627084 was running; this page neither triggers its deployment nor marks No5 accepted. All local operations used synthetic fixtures. No hosted login, invoice, payment, approval, stock or permission action. No application source change needed.

## One grouped session, alongside No5

- In the existing LAB, inspect desktop and narrow-screen archive layout: compact filters/footer leave useful product space, search/category/subcategory/status/VAT/Margin remain available and horizontal controls remain reachable. Reuse prior POS filter PASS; inspect only the new geometry/control changes.
- Use the single agreed LAB draft and product sample. For existing/new item, verify VAT department/category/dependent subcategory prefill, explicit save and reopen in the same store. Capture required fresh baseline and store/control metadata before any save or one new synthetic item; no finalization or stock/payment action. No new sample identity is invented here.
- On already-linked rows, observe markup without opening or saving lines, using the existing invoice unit/package/gross cost and store retail. Reuse automatic genuine-mismatch and barcode regressions rather than repeat financial operations.
- Owner/Manager/authorized staff expectations are checked in the same role sequence as No5. No new login request now. Staff restrictions remain; no new category permission is inferred from invoice edit permission.

The real A71942 read-only snapshot/replay proof (FINAL,7rows,113.11; old6/106.91 versus new7/113.11) remains the19Nov evidence in the prior checkpoint. It is not a current financial balance assertion. The actual user-tab visual result remains pending the common session. No new manual PASS or broader invoice/warehouse closure.
