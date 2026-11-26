# POS myDATA date review — 26 November 2026

Follow-up to the existing POS first-payment and duplicate-review scope, for coordination with the recorded owner. Baseline at verification: main 5ccecad. Production reports a duplicate hold when the POS date differs from a candidate inbound record. Exact original identity for the reported transaction is unverified.

Local candidate: offer review only for a unique verified-supplier, same-store candidate with matching invoice number and corroborating amount when the dates differ. Display both dates and repeat the exact existing precheck after operator confirmation. Preserve paid, ambiguous, foreign, and previously linked holds and existing payment idempotency.

Evidence: nine mounted workflow tests pass locally. An isolated PostgreSQL-engine PGlite run passed the new alternate-date proposal, canonical recheck and zero-payment assertions. Native Prisma/PostgreSQL CI and hosted LAB remain NOT TESTED. No production payment, stock, or invoice mutation. No release until required CI and guarded deployment verification; LAB acceptance requires one cash movement and safe replay against one existing invoice.
