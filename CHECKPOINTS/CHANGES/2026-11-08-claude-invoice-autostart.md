# One-shot Claude invoice auto-start — 2026-11-08

Owner requested immediate Claude implementation start without another manual Run workflow click.

Existing manual workflow `.github/workflows/claude-invoice-write-pilot.yml` was installed by #3725, and push authentication fix #3726 merged as `79570d2fce507ac490919e2ede4d58e4da4e1e12`. First prior run #42504018843 completed the Claude implementation step but failed on git push authentication; this fix has not yet been verified by a successful push/PR.

Change: add a narrowly scoped `push` trigger for `main` **only when this workflow file changes**. This merge will be the only intended auto-start. Keep existing `workflow_dispatch` for future explicit executions, owner actor gate, unique run branch, bounded Claude tools, Draft PR output, no automatic merge/deploy, no live financial operation.

Acceptance: inspect Actions run immediately after merge; confirm Claude step, exact branch, push, Draft PR. If the trigger does not start or push fails, do not claim completion. Check GitHub Actions permissions rather than repeating the work blindly.

This is owner-authorized code execution. It may consume existing Claude usage. No production Render deployment requested by this checkpoint.
