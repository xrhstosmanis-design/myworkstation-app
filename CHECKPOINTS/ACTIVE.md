Active checkpoint: `CHECKPOINTS/CHANGES/2026-09-06-module-access-role-matrix.md` (with unified list `CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md`)

Current branch: `agent/module-access-role-verification-20260906`

Current goal: complete the read-only role matrix verification for `MOD-01` / `DEV-12`. Super Admin sees permanent access, owners follow the effective company/store entitlement and expiry, and employees remain blocked from sensitive modules unless they have an explicit limited permission.

Rule: every code/configuration PR must update the active unified list and add a checkpoint under `CHECKPOINTS/CHANGES/`. CI enforces the rule. Completed, evidenced items are marked `ΟΚ`; untested work remains `ΣΕ ΔΟΚΙΜΗ`.
