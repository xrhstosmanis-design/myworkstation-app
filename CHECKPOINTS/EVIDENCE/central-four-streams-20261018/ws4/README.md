# WS4 isolated actual-source diagnostic

Repository: xrhstosmanis-design/myworkstation-app
Snapshot revision: 25ce0fc2f60502b123f25324fef4205463596174
Source files fetched by exact revision through GitHub connector. The capability helper is copied verbatim with .mjs extension; source-read snapshot is unmodified text.

Reproduce: node --test diagnostic.test.mjs
Runtime executed: Node v24.19.0 (repository requires Node20 for release; this is a diagnostic, not release CI).
Result: 5 tests PASS, zero failures, zero skips. Full output: result.tap.

Four executed behavioral tests invoke the actual capability helper. Coverage: six exact help phrases, all64 exposed-tool subsets,18 appended qualifier/action/injection negatives plus3 actual CR/LF negatives, and unknown adapter descriptions. One additional test inspects the actual strict source-reader schema as text; it does NOT execute Zod or underlying domain parsers.

No implementation defect reproduced in these checks. No provider, business data, database, credentials, session, production, registry or application code was touched.

Integration gap: strict supported source names currently enumerate cash_details, sales_by_product, stock_by_product, sales_by_store, consumption_details and business_records. The proposed margin_review, supplier_order, staffing_analysis and cash_reconciliation adapter names are absent; unknown names do not advertise new capabilities. This means new workstream computations cannot be claimed integrated merely because guidance exists; adapters require owner-coordinated contracts and implementation.

Limitations: no dispatcher/API/native PostgreSQL/permission reauthorization execution, no numeric reconciliation, no file-byte acceptance, no hosted/mobile/physical observation. Existing owner's full tests were read but not replayed. These five diagnostic PASS results are not LAB/LIVE/USER PASS or full CI, and do not release ownership.
