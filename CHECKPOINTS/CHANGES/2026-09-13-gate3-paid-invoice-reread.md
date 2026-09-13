# Gate 3 — paid invoice reread, 2026-09-13

User instruction: delete only the incorrect unposted draft and its source photos; preserve the payment and allow a fresh POS / BackOffice read without a new payment. Quick POS handoff remains unchanged. Push and merge authorized after green CI.

## Changes

- Draft deletion retains the linked supplier payment and invoice identity, clears its deleted-document/photo pointer, audits the preserved payment ID, and deletes source attachments/jobs. Finalized, invoiced and stock-posted orders still cannot be deleted.
- Duplicate precheck uses an exact invoice number (including legacy explicit invoice descriptions), tenant/supplier identity and the oldest active payment. Existing documents still block duplicates. A missing draft permits reread with the same payment only after store/supplier/amount validation.
- Shared POS/BackOffice intake serializes invoice identity, validates/locks the existing payment and links it to the new draft. Already paid invoices cannot become new credit. No change to original payment amount, actor, session, method or timestamp; no cash drawer request on reuse.
- Printed retail/unit/quantity/purchase columns can recover Items-only Azure responses using current-source header evidence and a balanced same-row equation. No old invoice prices/quantities are learned. The existing central supplier correction profile remains shared across entry points.
- Arithmetic mismatch triggers recovery even when every numeric field is nonzero. Discount verification uses only rows assigned to the corresponding page, so page 2 rows cannot be rewritten from page 1.
- The pre-existing main CI failure was caused by two missing Premium correlation constants. Main independently fixed these in a4189180; incorporated latest main through c0e7c33c unchanged, including all newer Premium work.
- Restore the active list's previously truncated middle from exact matching git history (df63b6bc), retaining current prefix/suffix and all new checkpoints.

## Validation

- Local server build and client build PASS; server tests 1175/1175 PASS (local Node 24; required CI uses Node 20).
- Functional parsing fixture checks all 38 printed rows, retail vs purchase price, quantities totaling 608 and invoice sum 2369.99; changed future quantities/prices come only from the new row.
- New isolated real HTTP E2E covers paid draft deletion, source/job removal, unchanged original payment, second-user reentry, mismatch rejection, one payment and no draft stock posting. This runs in CI, never production.
- CI / merge / Render: pending. CI #2071 started after incorporating current main. The new main c0e7c33c contained literal backslash-n separators in its Premium test; normalized these to actual newlines without changing any assertions or feature behavior.
- LIVE parsing and complete Gate 3: pending user test. Latest original screenshot still shows 2363.28 and 6.71 difference; do not call this resolved based on fixture tests alone.
- Existing historic duplicate payments stay untouched, pending controlled audited financial correction.
