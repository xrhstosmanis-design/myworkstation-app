Active checkpoint: `CHECKPOINTS/CHANGES/2026-09-12-full-product-card-invoice-supplier.md` (with unified list `CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md`)

Current branch: `fix/backfill-supplier-by-invoice-code`

Current goal: repair legacy invoice supplier links by an exact unique tenant SKU when the old invoice line has no product id.

Rule: every code/configuration PR must update the active unified list and add a checkpoint under `CHECKPOINTS/CHANGES/`. CI enforces the rule. Completed, evidenced items are marked `ΟΚ`; untested work remains `ΣΕ ΔΟΚΙΜΗ`.
