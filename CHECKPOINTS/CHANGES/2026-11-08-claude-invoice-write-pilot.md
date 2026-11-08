# Claude invoice write pilot — 2026-11-08

The second manual read-only Claude pilot showed PASS in the owner's GitHub screenshot; the owner now requested progression to implementation.

This change introduces a separate, manual-only, owner-actor-gated workflow for INVOICE-OWNER-FINALIZATION-01. Claude edits a unique work branch; workflow commits and creates a **Draft PR** only after changed compact registry and new checkpoint are present. No auto-merge or production deploy. CI, code review and LAB acceptance remain separate.

Potential blockers to validate in CI/pilot: GitHub token permissions to push/create PR, correct action behavior with allowed Bash/Edit/Write tools, checkpoint-policy compliance, scope isolation, usage limits, and no secret exposure. Do not claim the workflow is operational before actual successful dispatch and PR creation. Do not run against live data.

Exact-head CI required before merge.
