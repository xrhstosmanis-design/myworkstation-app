Active checkpoint: `CHECKPOINTS/CHANGES/2026-09-12-invoice-line-correction-audit.md` (with unified list `CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md`)

Current branch: `feature/invoice-line-correction-audit`

Current goal: record every confirmed invoice-line correction and supplier-learning result atomically in the central Audit without changing stock.

Rule: every code/configuration PR must update the active unified list and add a checkpoint under `CHECKPOINTS/CHANGES/`. CI enforces the rule. Completed, evidenced items are marked `ΟΚ`; untested work remains `ΣΕ ΔΟΚΙΜΗ`.
