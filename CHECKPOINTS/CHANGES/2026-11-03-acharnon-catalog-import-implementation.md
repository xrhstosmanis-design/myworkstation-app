# ACHARNON-CATALOG-IMPORT-01 — implementation prepared, AWAITING VALIDATION

Owner: current Acharnon activation page. Branch: work/acharnon-source-20261103.
Claim: PR #3616, head 59bf4bb3d303f28a7d873104bfca42f2d6ce9a32.
Recorded: 2026-11-03 19:10 UTC.

## Problem and bounded change
The actual Acharnon preview rejected all 3,325 prepared rows because the legacy importer only knows another store's department codes. The requested catalogue needs fresh program-generated SKUs, eleven exact saved departments and zero opening stock.

Add explicit ACHARNON_CATALOG_V1 dispatch only for ACHARNON_IMPORT. Its metadata binds company and store. SourceKey links aliases and remains a source reference, never a program SKU. Eleven department identities must match existing company records, including ID, description, register number, internal legacy code, commerce, rate, active and exemption fields. Unknown fiscal codes remain blank; no exemption is inferred. Preview reserves no SKU. The final transaction allocates numeric SKUs under the existing company product-sku advisory lock and reads the canonical numeric maximum. It requires an empty selected store, CREATE-only rows and stock zero; rejects replay, aliases shared between source rows, existing-company barcode collisions, foreign targets and delegated staff access. Existing full-import readback verifies persisted identities, prices, aliases and opening stock. No schema, production database migration, licensing, auth or fiscal-send change.

## Observed local evidence
Node 20.20.2. Before implementation, the two new Acharnon preview tests failed (profile missing and stale identity not rejected). After implementation: 30 PASS, 0 FAIL, 1 native PostgreSQL test SKIP across inventory-acharnon-source, inventory-source-workbook, inventory-archive-full-import, inventory-v2-import and product-cost-precision. git diff --check clean. Native PostgreSQL coverage was extended for all eleven departments, six-decimal costs, all aliases, atomic rollback of product/category/store writes, concurrent repeat, same-company cross-store numeric allocation, barcode-less replay and unchanged controls; NOT RUN locally because this sandbox cannot switch to an unprivileged PostgreSQL process. CI execution remains required.

## Process deviation and remaining gates
Local reversible source/test preparation began while claim PR #3616 was still awaiting CI/main after the user's repeated instruction to start. This did not satisfy the repository's claim-before-code sequence. Recorded explicitly; no claim that the sequence passed. No runtime branch publication/deployment or catalogue write occurred during local preparation. The ordinary exact-head PR/main CI, guarded deployment and measured LAB remain required before real-store import. No overall PASS, LAB PASS or LIVE claim.

## Catalogue residual
Canonical preparation: 3,325 selected nonzero-source-stock items, all proposed opening stock zero; 25 previously unresolved items and their 29 aliases were removed per user instruction. Thirteen barcode collisions link distinct source rows, often with differing prices/costs, and require a concrete business choice. Source aliases also contain legacy labels and scanner URLs. Current strict profile rejects nonnumeric aliases instead of silently discarding them. No real product has been imported. Do not silently select a price or use source codes as program SKUs.
