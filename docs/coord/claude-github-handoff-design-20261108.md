# Claude Code GitHub handoff — design checkpoint (2026-11-08)

Status: DESIGN ONLY / NOT ACTIVE. Central issue: #3714.
Owner: ChatGPT coordinator. Repository: xrhstosmanis-design/myworkstation-app.
This document is not an executable GitHub Actions workflow. No Claude invocation, deployment, merge, SMTP, or production mutation is authorized.

## Verified
- Existing CI: `.github/workflows/ci.yml`; workflow triggers push main, pull_request main, workflow_dispatch.
- No `.github/workflows/claude.yml`, `claude-code.yml`, or `claude-code-review.yml` on main when checked.
- Anthropic official documentation: https://code.claude.com/docs/en/github-actions
- Official action supports `@claude` issue/PR comments, and either `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`. App installation alone is insufficient; repository workflow and corresponding Actions secret are required. OAuth subscription usage still has usage limits; verify account applicability before activation.
- Official action enforces triggering actor write access and bot allowlist; automatic issue comments from a bot may not trigger. Do not assume ChatGPT-created comments can launch Claude without a verified trusted triggering identity.
- Existing invoice owner claim: PR #3715 (docs-only, OPEN). Latest owner decision: operator finalization remains, owner/authorized manager later corrects or cancels, with controlled stock reversal and preservation of payment/photo records. Do not override this with the earlier approval-before-stock concept.
- AI Wallet: draft PR #3713, CI run 42467742452 SUCCESS; hosted LAB not verified.
- OCR: PR #3706, #3709; confirm owner/checkpoint before editing.
- Reports: issue #2704; observability design only.

## Proposed initial rollout — gated, not yet implemented
1. Verify GitHub App scope, repository Actions secrets *presence only* (never retrieve or print secret values), account billing/usage implications, and required workflow permissions.
2. Build a minimal, manual-triggered or trusted-comment-triggered read-only Claude workflow. Require a single approved task ID and restrict permissions to `contents: read`, `issues: write` only if comments are necessary; no `contents: write` initially. No access to Render, DB, SMTP, production secrets, deployment workflows.
3. Enforce an explicit allowlist for task IDs and actor, concurrency per task, timeout, bounded token/tool budget, no pull_request_target untrusted checkout, no auto-merge/deploy, and no execution of issue text as shell.
4. First smoke test: Claude reads the designated checkpoint and reports only status/next step for task #28, no source edits. Confirm action actually starts, posts correct result, and stops without side effects.
5. After evidence and separate owner approval, extend to code-writing branches/PRs with minimal scoped permissions. Require independent review and CI, and separate owner approval for push/PR/merge/deploy as applicable.

## Four tracked workstreams
- IMMEDIATE: invoice owner finalization/correction, PR #3715, task #28.
- HIGH: automatic email reports observability, issue #2704.
- HIGH: invoice OCR multi-page/confidence, PR #3706/#3709.
- ACTIVE: AI Wallet history, draft PR #3713.

## Gate before workflow creation/activation
- Authentication method chosen and configured by authorized owner; never store token in repository text.
- GitHub Actions billing and Claude usage understood.
- Actor trust boundary established for coordinator-triggered actions; bot limitations resolved.
- Explicit approval for an actual executable workflow, PR, merge and initial test.
- Follow AGENTS.md ownership/claim rules, protect giant shared tracker files, preserve exact history.
