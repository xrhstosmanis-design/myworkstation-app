# Compact active work registry migration — 2026-11-08

Owner requested a smaller Markdown status file to avoid repeated updates of the large historical active list. Added `CHECKPOINTS/ACTIVE_WORK_2026.md`; updated the checkpoint policy's required active-list path and added precedence guidance to `AGENTS.md`. Historical list remains unchanged; `docs/roadmap/OPEN_WORK_TRACKER.md` remains authoritative for ownership and PASS.

Scope: CI policy and documentation only. No POS, inventory, invoices, production data, Claude execution, merge or deploy changed.

Acceptance: full required CI PASS on exact PR head; verify existing checkpoint-policy tests and that implementation changes require both new compact registry and checkpoint. If tests or references fail, amend on this branch. Do not merge until reviewed. Existing PR #3718 remains blocked on its own head until it incorporates the new policy after merge.
