# Owner authorization and staged automation requirements — 2026-11-08

Owner decision in coordination conversation: authorize Claude as technical executor for MyWorkStation, including automated code edits, branch creation, commits, pushes, PRs, merge and production deploy without individual approval for each routine operation. This is an **authorization record and implementation specification**, not proof that the mechanism is installed or enabled.

## Scope and precedence
- Priority 0: INVOICE-OWNER-FINALIZATION-01 (#28); priority 1: AUTO-REPORT-OBSERVABILITY-01 and OCR-CONFIDENCE-01; priority 2: AI-WALLET-HISTORY-02.
- Existing PR #3716 manual read-only handoff and PR #3717 inactive template remain disabled pending implementation. Do not interpret this file as a workflow trigger.
- Preserve distinct branch/owner/PR per task and avoid concurrent writes to shared tracker/active-list files.
- Every change needs auditable commits, tests, and CI status. Merge must be conditional on required checks passing and branch protections; do not bypass protections.
- Production deployment must verify target service/environment, deployed revision, health checks, and rollback capability. If health or checks fail, stop and report; never force success.
- Never publish secrets, credentials, private financial data or full large files in logs. Rotate/revoke any previously exposed OAuth credential before real invocation.
- Keep irreversible operations (payments, fiscal receipts, destructive data migrations, inventory corrections, real customer emails) outside the authorization for code merge/deploy. Require distinct explicit authorization for such business operations.
- Check Claude/Anthropic account usage limits and any billing implications before enabling invocation; the owner has not authorized a new paid plan or unbounded spending.

## Required implementation gates
1. Read-only inventory of GitHub branch protection, workflows, secrets *names only*, Render services and deployment triggers.
2. Design separate execution and deploy workflows with minimum required permissions; no direct write to main from Claude.
3. Implement allowlisted task dispatch and isolated per-task execution, with provenance of each request.
4. Integrate protected PR checks and controlled merge; production deploy only after successful merge and approved deploy workflow conditions.
5. Verify in an isolated test, inspect logs and permissions, and record a rollback rehearsal before enabling production automation.
6. Record exact evidence, CI, service revision and operational state; never claim production automation active based on this document alone.

Status: SPECIFICATION ONLY / NOT ENABLED / NO CLAUDE INVOCATION / NO DEPLOY.
