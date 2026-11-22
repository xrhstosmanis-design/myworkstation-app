# Claude #28 — prevent duplicate BackOffice UI work and make PR fallback explicit — 2026-11-08

**Status:** AWAITING CI; LAB NOT TESTED; owner invoice finalization #28 remains OPEN.

## Evidence
- GitHub Actions run [#42515007903](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/42515007903) successfully completed Claude code changes, checkpoint gate, commit and `git push`, but `gh pr create` failed because the repository disallows GitHub Actions-created PRs.
- The pushed branch `claude/invoice-owner-finalization-42515007903` duplicates the bounded lineAudit UI already in Draft PR #3737. Coordinator retained it as evidence and did **not** create a duplicate PR, merge, or repeat the run.
- The previous general-purpose Claude prompt did not prevent repeated work on already-claimed UI scope.

## Change
- Explicitly exclude `client/src/components/commerce/installPurchaseOrdersSuite.js` and `server/test/purchase-order-reopen-ui.test.js` from the next Claude #28 coding step. The UI scope belongs to PR #3737.
- Require the next incremental work to focus on server-side authorized cancellation/voiding of previously posted invoices (including inverse stock, idempotency, per-line audit), or narrowly scoped native-DB guard tests if an implementation is premature.
- If GitHub Actions again refuses PR creation after a successful push, emit a clear warning and preserve the already-pushed branch for the connected ChatGPT coordinator to create one Draft PR. Do not rerun Claude to address PR permissions.
- Preserve owner-only exact issue comment trigger, task isolation, current workflow permissions, no automated merge/deploy, and existing timeout.

## Verification needed
Exact-head CI PASS for this workflow change; verify no unapproved extra Claude invocation from merging this branch. No actual live invoices, payments, inventory, financial data or Render services changed in this checkpoint.
