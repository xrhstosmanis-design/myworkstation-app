# Claude policy CI pilot on compact-registry main — 2026-11-08

Source: previous Draft PR #3718, carried onto main after successful merge #3719. Adds an actual isolated GitHub Actions test workflow, pure fail-closed dispatch/merge policy module, and policy tests. No Claude invocation, write token, merge or Render deploy. Updates CHECKPOINTS/ACTIVE_WORK_2026.md as required by the new checkpoint validator.

Acceptance: exact-head isolated policy tests and all required MyWorkStation CI jobs PASS. Previous #3718 CI #9416 failed under the obsolete large-list gate; do not interpret that as validation of this new PR. Any Chromium failure must be investigated before merge.

Do not merge or deploy until required CI and PR review gates are satisfied. Production data untouched.
