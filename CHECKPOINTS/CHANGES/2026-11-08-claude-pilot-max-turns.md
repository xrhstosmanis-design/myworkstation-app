# Claude pilot max-turns fix — 2026-11-08

Run #42491919612 reached Claude action and returned `subtype: success`, `is_error: false` after 9 turns. The action failed because configured `--max-turns 8` was exceeded. OIDC token, GitHub app token and Git authentication succeeded. No claim is made about future billing or write access.

Change only `--max-turns 8` to `--max-turns 20` in the manual read-only workflow. Permissions, task allowlist, timeout, actor gate, and allowed tools unchanged. Update small active registry and this checkpoint.

Acceptance: exact-head MyWorkStation CI PASS, merge, and one owner-triggered read-only run for INVOICE-OWNER-FINALIZATION-01 with successful job conclusion. No Claude writes, merge automation, Render deploy or financial data mutations.
