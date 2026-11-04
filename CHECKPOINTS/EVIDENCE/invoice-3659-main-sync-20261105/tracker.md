## 05/11/2026 — CASH-ADJACENT-COUNT-21 / RETAINED OWNER / BEFORE-SOURCE CLAIM / AWAITING LAB

Parent: CASH-UNIFIED-AUDIT-15 remains OPEN and assigned to the retained cash audit owner. This owner-directed bounded task continues PR #3657 (DRAFT; no merge) to detect potential cash-counting errors between immediately consecutive CLOSED shifts of the same company/store/terminal, with strict carried closing/opening equality, current six-check cash arithmetic, opposite nonzero cash differences and no existing manual OFFSET. No secondary owner or competing scope.

Read-only example: night -344.00 EUR / next morning +343.08 EUR; candidate common amount 343.08 EUR, separate night residual -0.92 EUR and morning residual 0.00 EUR. This is a *candidate*, not proof of a physical counting mistake, not a final balance adjustment, employee charge or automatic OFFSET. Ambiguous triple overlaps must not be allocated.

Evidence as at 05Nov: 8 isolated helper tests PASS in V8; full Node20/DB/HTTP CI and MYWORKSTATION LAB NOT TESTED. PR CI run 41927565706 FAIL at the mandatory active-list checkpoint gate; its native tests SKIPPED. The source PR stays DRAFT. Protect all actual cash/card/IRIS values, raw audit, immutable reviews/ledgers, roles/store permissions, fiscal, stock, invoice, provider, paid-AI and outbound actions. No production operation was performed.

Sequence: publish this intact documentation claim and relevant checkpoint to main with applicable green CI; synchronize all three central registries and generated tracker PDF; then rebase PR #3657 and run complete Node20/native/PG/HTTP CI, isolated LAB, guarded release and separately verified read-only selected-store acceptance. Parent CASH-UNIFIED-AUDIT-15 remains OPEN until all evidence and final audit criteria are met.

Checkpoint: CHECKPOINTS/CHANGES/2026-11-05-cash-adjacent-counting.md.

## 05/11/2026 — INVOICE-CREDIT-THIRD-HEADER-01 / SOURCE CANDIDATE / AWAITING NATIVE CI AND LAB

Retained owner /root, implementation fix/invoice-credit-third-header-20261104. Before-source claim #3652 merged 4fa7ffa4bb0420487b072770a61080ee8bd9bd6f after applicable documentation CI41922045801. No ownership transfer or change to any peer scope. Parent duplicate/triple consolidation remains OPEN.

Candidate derives a version-bound server capability only for an additional unpaid NEW/DRAFT credit whose series alone differs from the established paid canonical. Same company/store/supplier/VAT/type/day/exact cents/numeric suffix and the original applied-credit proof are required. The writer recomputes candidates under existing locks and retains flat-family/posting checks. Explicit originals/MARK/header/reason AND the canonical table selection are mandatory, including an empty extra. Root identity, spelling, payment, signed OFFSET/CASH_RETURN audit, original positive transaction, rows, files and stock are not rewritten. No credit writer, money writer, schema, provider or posting changes.

The new negative actual-writer test exposed a date/amount mismatch that the old near-receipt heuristic did not always flag. Within established paid-credit continuation only, nonexact additional headers now require review; only the narrow series-only capability can release the settled-credit block. Initial paid-credit header correction, paid extras, other differences, stale proof and malformed families remain denied; existing positive-invoice manual continuation is covered.

Local Node22.16.0 actual-helper/preview/writer synthetic-query regressions: 52 PASS, 0 FAIL, 0 SKIP. Selected new actual-writer regression against exact old server blob a57006f failed with INVOICE_CREDIT_REVIEW_REQUIRED (0 PASS/1 FAIL); candidate passes. Syntax and git diff --check pass. These are isolated local engineering checks, NOT PostgreSQL, Node20, browser, hosted, financial or LAB acceptance. Four new native PostgreSQL groups use the actual OFFSET/CASH_RETURN writer, concurrent third/retry, complete-row preservation, denied variants and stale proof; a mounted actual-dialog test covers capability flags, explicit confirmations/root choice, empty extras and stale responses. Native and mounted suites are prepared but NOT EXECUTED locally: this environment has neither isolated PostgreSQL/Prisma nor React/esbuild/jsdom. Required full native Node20 PR/main CI must execute them without skips before merge/release.

Current candidate does not change production or any business record. Historical hosted third-member FAIL and existing pair PASS remain intact. Shared registries retain their complete histories; existing manuals and accepted PDF snapshots retain their baseline because no new functional PASS exists. No original credit/payment is replayed to manufacture acceptance evidence.

Single next action: run exact full native PR CI and resolve failures before source merge; then exact main CI, ordinary guarded healthy release and one separately measured synthetic LAB acceptance with before/after/control. Do not mark task 3 complete from this candidate or CI alone. Checkpoint CHECKPOINTS/CHANGES/2026-11-04-invoice-credit-third-header.md.

