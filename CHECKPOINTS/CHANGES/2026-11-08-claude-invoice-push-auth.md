# Claude invoice push authentication — 2026-11-08

Run #42504018843 reached the Claude implementation step and completed it, but failed at the commit/push/PR step with `remote: Invalid username or token` and `fatal: Authentication failed` (exit 128). The workflow's checkout uses `persist-credentials: false`; a prior `gh auth setup-git` did not provide valid push credentials.

Change: explicitly attach a temporary Basic authorization header derived from the GitHub Actions job token for the single `git push` command. Do not log the token/header or persist credentials. Keep owner gate, task scope, draft PR only and no deploy.

Validation: exact-head CI, then a new owner-triggered workflow run. A successful push is not assured if repository Actions token settings deny writes; in that case stop and report the permission blocker. Do not bypass branch protections.
