# Claude read-only assignment dispatcher — inactive proposal (2026-11-08)

Status: DRAFT / NOT INSTALLED / NO EXECUTION. Coordinator: issue #3714. Depends on PR #3716 security review and an approved, safe OAuth credential.

## Objective
Translate explicitly authorized work requests for four allowlisted MyWorkStation tasks into bounded read-only Claude Code assignments, without granting writes, running deployments, sending email, or accessing production systems.

## Proposed mechanism (not active)
1. A GitHub Actions workflow would listen only to `issue_comment.created` on issue #3714, and only accept a strict command of the form `/claude-readonly TASK_ID` from repository owner `xrhstosmanis-design`.
2. Strictly allowlist these task IDs: `INVOICE-OWNER-FINALIZATION-01`, `AUTO-REPORT-OBSERVABILITY-01`, `OCR-CONFIDENCE-01`, `AI-WALLET-HISTORY-02`. Reject any extra text, newline, mentions, or unrecognized task.
3. Require an explicit per-task authorization before invoking Claude. A comment merely listing work items must not trigger a Claude run. The issue comment body is untrusted and must never become shell script or prompt instructions.
4. Use minimal permissions, separate concurrency group per task, 15-minute timeout, checkout without persisted credentials, and `Read,Glob,Grep` only. Never expose credentials or private data in logs.
5. Avoid `pull_request_target`, privileged write tokens, issue-comment supplied shell arguments, and any third-party unpinned code without review. The initial implementation must be security-reviewed and validated against the actual Anthropic Action interface before activation.
6. Log a short Greek summary and explicit blockers; no source edits, commits, PRs, issue comments, SMTP, external services, merge, deploy, or financial/stock changes.
7. Maintain distinct workstream owners and checkpoints; do not edit shared large tracker files concurrently.

## Authorization boundaries
This proposal itself is documentation only. It does **not** create a live workflow, invoke Claude, confirm a secret, authorize a paid invocation, or approve merge/deploy. The current PR #3716 workflow remains manual-only. No one should treat issue #3714 comments as an automatic trigger until a separately approved implementation is merged and independently tested.

## Before implementation
- Verify PR #3716 overall CI and OAuth credential rotation/revocation; the presence of a secret alone is not proof of a safe credential.
- Decide whether owner-issued command comments or a manual workflow dispatch should be the initial safe trigger. Require a fresh owner approval for each invocation and any associated cost.
- Add the actual workflow and the mandated active-list/checkpoint changes as one verified change set; run checkpoint policy and CI.
- Independently review trigger/permissions/prompt injection/secrets/concurrency, then request separate merge and first-run approval.
