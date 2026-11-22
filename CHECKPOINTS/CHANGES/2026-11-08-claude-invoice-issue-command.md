# Claude issue-command execution trigger — 2026-11-08

Owner approved automated Claude code work on invoice finalization #28, and asked to start immediately. The one-shot `push` trigger from #3728 was merged but did not show a matching run via the connected GitHub status query.

Change: replace the push trigger with `issue_comment: created` on the existing Claude invoice workflow. Trigger job ONLY when GitHub actor `xrhstosmanis-design` comments exact `/claude-invoice-28` on coordination issue #3714 (not on a PR) on default branch. Keep manual `workflow_dispatch` as an alternative. This does not expose an unrestricted command interpreter.

The workflow retains the isolated branch, scoped implementation task, required compact registry and checkpoint, commit and Draft PR; no automatic merge, production deploy or financial transaction. Dispatch requires the updated workflow to be merged on the default branch first.

**Acceptance:** After merge, create exactly one owner-authored comment on issue #3714 and verify corresponding GitHub Action run, Claude step, push and Draft PR. Do not claim successful implementation without a real completed run and artifact. Any GitHub Action usage consumes resources; no new subscription or billable third-party account is authorized.
