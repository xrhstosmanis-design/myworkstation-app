# Claude policy CI pilot — 2026-11-08

Scope: isolated GitHub Actions test workflow for the pure Claude automation policy. No Claude invocation, no write token, no merge, no Render deploy. Source copied byte-for-byte from PR #3717. The workflow is triggered by PR changes or manual dispatch after installation.

Checkpoint-policy caveat: repository policy may require a synchronized edit to the large CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md for workflow changes. Do not merge until exact-head CI and checkpoint compliance are verified. Do not rewrite that large file from a truncated API fetch.

Owner approved future automated merge/deploy, but this PR only validates the policy test runner. Production service remains untouched.
