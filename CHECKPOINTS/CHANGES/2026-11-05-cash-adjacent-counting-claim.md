## 05/11/2026 — CASH-ADJACENT-COUNT-21 / RETAINED OWNER / BEFORE-SOURCE CLAIM / AWAITING LAB

Parent: CASH-UNIFIED-AUDIT-15 remains OPEN and assigned to the retained cash audit owner. This owner-directed bounded task continues PR #3657 (DRAFT; no merge) to detect potential cash-counting errors between immediately consecutive CLOSED shifts of the same company/store/terminal, with strict carried closing/opening equality, current six-check cash arithmetic, opposite nonzero cash differences and no existing manual OFFSET. No secondary owner or competing scope.

Read-only example: night -344.00 EUR / next morning +343.08 EUR; candidate common amount 343.08 EUR, separate night residual -0.92 EUR and morning residual 0.00 EUR. This is a *candidate*, not proof of a physical counting mistake, not a final balance adjustment, employee charge or automatic OFFSET. Ambiguous triple overlaps must not be allocated.

Evidence as at 05Nov: 8 isolated helper tests PASS in V8; full Node20/DB/HTTP CI and MYWORKSTATION LAB NOT TESTED. PR CI run 41927565706 FAIL at the mandatory active-list checkpoint gate; its native tests SKIPPED. The source PR stays DRAFT. Protect all actual cash/card/IRIS values, raw audit, immutable reviews/ledgers, roles/store permissions, fiscal, stock, invoice, provider, paid-AI and outbound actions. No production operation was performed.

Sequence: publish this intact documentation claim and relevant checkpoint to main with applicable green CI; synchronize all three central registries and generated tracker PDF; then rebase PR #3657 and run complete Node20/native/PG/HTTP CI, isolated LAB, guarded release and separately verified read-only selected-store acceptance. Parent CASH-UNIFIED-AUDIT-15 remains OPEN until all evidence and final audit criteria are met.

Checkpoint: CHECKPOINTS/CHANGES/2026-11-05-cash-adjacent-counting.md.
