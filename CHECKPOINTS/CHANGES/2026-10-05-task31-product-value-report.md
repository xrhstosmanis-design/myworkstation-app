# Task31 — selected-store product value report

## Scope and authorization

User explicitly approved push/merge and all necessary tests, then instructed continuing without stops. Assignment was published as PR1772 before local source work. The initial documentation-only head passed classifier/Windows (build intentionally skipped); newer shared main caused a documentation conflict. Local implementation proceeded under the latest instruction while claim was awaiting shared merge. This source publication keeps the same named owner and PR; it incorporates current main and preserves all other claims. Initial claim checkpoint is historical, not current source/deployment status.

## Behavior and evidence

Commerce has a dedicated LOW_VALUE_PRODUCTS tab. Report GET uses the actual licensed selected store/company, refuses employees/Store Operators even with delegated module permission, and reads three queries in one RepeatableRead snapshot. Active store products, completed eligible sale lines, approved invoice evidence only; cross-store/company, draft/future/non-sale consumption excluded. Rolling history 7–365 days, stock coverage threshold 1–730 days, gross margin threshold 0–100%. Inconsistent sale totals (including a global discount without line allocation), VAT, quantities or units do not produce fabricated margin. Invoice net amounts preserve recorded discounts. Dimensions/packages require explicit evidence; documented zero cost is valid. Posted-order costs include excise and explicit factors/corrections. Reversal cost uses verified original sale date. Recipe material cost remains unknown. Provenance document numbers/dates are visible. No estimate is an instruction to delete a product.

UI has applied-threshold summary, search/filter, five-row pagination within an inner scroll area, loading/error retry, stale-request/store-response rejection and help. CSS scoped to this report; previous #30/TODAY/POS layouts remain intact. Existing supplier tests only receive the newly imported router stub; their assertions/data remain unchanged. No new schema, migration, data repair, permission/entitlement activation or write endpoint.

## Validation at source publication

Node20.20.2 production build PASS. Full server suite: 1863 PASS, 0 FAIL, 5 database-dependent skips. Isolated actual React DOM report controls: 4 PASS including parent, 0 failures. Cost arithmetic: 8 PASS, covering net VAT, returns, temporal cost, missing/invalid latest evidence, zero cost, grams/kg, packages, order corrections, recipes, zero movement, losses, inconsistent amounts and threshold bounds. Production handler + real module guard + real PostgreSQL SQL via Prisma/PGlite loopback: 4 PASS including parent, 0 FAIL/0 SKIP; TEMP tables only, each table count/digest unchanged after requests. This validates SQL semantics in WASM PostgreSQL, not native PostgreSQL runtime or production LAB. Native PostgreSQL CI remains required. Build-preparation's incidental kiosk audit patch was reverted and is not published. Lockfile/dependencies not changed by this feature.

A parallel PGlite regression invocation rejected concurrent connections (single-connection runtime), unrelated to production source; sequential reuse also retained prepared statements. Fresh individual PGlite runtimes subsequently passed #30 SQL/HTTP 4/4 and #29 SQL/HTTP 5/5, all zero failures/skips. No implementation assertions were changed to accommodate the runtime. No production DB URL/seeding/migration or protected LAB fixture replay was used.

## Acceptance remaining

PR/native PostgreSQL full CI and Windows checks; merge only after green exact head. Guarded Render deployment/exact health revision. Actual read-only LAB report, independent arithmetic comparison, search/thresholds/filters/error handling and stock/financial/control-terminal baseline verification. Owner without SuperAdmin and real devices/print NOT TESTED. Module catalog remains commercialReady:false and licenses unchanged. Entire task31 OPEN/ASSIGNED until actual acceptance and merged handoff; no manual PASS is added here.

## Dense history lookup

Historical invoice selection uses a date index/binary lookup and caches normalized cost per document within each product. The dense-history test independently checks 2,000 sale lines against 1,000 invoices and deterministic same-date creation-time ties. This avoids repeatedly scanning every prior invoice for every sale. Node20 full server suite after this change: 1863 PASS / 0 FAIL / 5 database-dependent skips; original 4 PostgreSQL/HTTP assertions remain green.
