# Claude issue dispatch — implementation checkpoint 2026-11-08

PR #3717. Owner-approved scope: commit/push of **inactive read-only** dispatch mechanism only. No merge, deploy, workflow invocation, secret changes, or charge.

## Implemented
- `docs/coord/claude-readonly-issue-dispatch-INACTIVE.yml`: a concrete GitHub Actions template intentionally stored outside `.github/workflows/` and additionally protected by job `if: false`.
- Exact issue #3714, repository and actor gate, explicit owner association, strict command allowlist, bounded execution, restricted tools, no persistent checkout credentials.
- User comment content is provided via environment, never interpolated into a shell command; the prompt receives only a validated fixed task identifier.

## Explicit non-goals and blockers
- This template is **not** a live trigger and will not launch Claude, even if the issue receives comments.
- The source template has not been executed. Syntax/action compatibility and real authentication are NOT VERIFIED.
- `tools/verify-checkpoint-policy.mjs` requires updating `CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md` for any YAML implementation change. This PR does not alter that large shared file; CI checkpoint gate may therefore FAIL. Do not bypass the validator or overwrite the file from a truncated fetch.
- Before enabling: complete safe full-file append with byte preservation, independent security review, CI PASS, safe credential rotation verification, separate merge approval, and separate per-invocation approval.
- GitHub Actions issue_comment workflows require default-branch installation; the draft branch itself cannot activate this template.

No source edits or production changes are authorized by this checkpoint.
