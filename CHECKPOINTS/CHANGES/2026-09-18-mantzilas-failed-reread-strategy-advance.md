# Advance a safely failed MANTZILAS reread to V12 — 2026-09-18

## LAB evidence

- Status: **LAB FAIL** after exact production `324ee1cc744f4ec0c17ae88f3aa1085e3379d1f6`.
- After BackOffice refresh, invoice `12674` remained unchanged at update time `18/09/2026 08:18`, with 13 rows, net `331.09 EUR`, gross `374.12 EUR` and the old `7.65 EUR` invoice warning.
- Its durable job remained `POS_FAILED / POS_BACKGROUND_FAILED` and still displayed the previous safe rejection: 13 candidate rows with difference `120.28 EUR` were inferior, so the existing lines were retained.
- The new V12 persistence logic was deployed, but no V12 reread ran; the unchanged timestamp proves this is recovery eligibility, not a new row-reading result.

## Root cause and bounded correction

- Existing-draft strategy advancement was restricted to a completed `AWAITING_APPROVAL` job.
- Invoice `12674` is instead `POS_FAILED` precisely because the earlier V11 reconciliation reread safely rejected an inferior replacement.
- The generic retry classifier correctly excludes this non-transient result, so refresh could not reclaim it for the newly deployed V12 strategy.
- Permit a single strategy advance only when all of these are true: status is `POS_FAILED`; an existing purchase draft is linked; the previous marker is `RECONCILIATION_REREAD`; its strategy differs from the current strategy; and the stored error exactly identifies the safe-inferior-reread guard.
- Claim the same durable job as `POS_REPROCESSING`, stamp V12 with reason `PREVIOUS_SAFE_INFERIOR_REREAD`, force a current-image reread and replace only the same draft if the existing safety comparison passes.
- Ordinary provider, validation and non-retryable failures remain unchanged and blocked.

## Protected behavior

- Preserve the source image, supplier, invoice number/date/total, AI job, purchase document, unapproved draft and settlement identity.
- Preserve the verified-table persistence gate: every row must be fully marked and the table must still match the independent total within `0.05 EUR`.
- Preserve the same-draft atomic replacement, inferior-result rejection and all tenant/store/background capability boundaries.
- No new upload, duplicate payment, duplicate credit, duplicate draft, approval, finalization, stock posting, fiscal, accounting or myDATA mutation.

## Verification and LAB acceptance

- Focused reconciliation, recovery, persistence, multipage and column regressions: `111/111 PASS`.
- Syntax and diff checks: PASS.
- Full server suite: `1306/1306 PASS`.
- Production client/server/Prisma build: PASS.
- Require green CI, merge and exact deployed revision before another refresh.
- LAB acceptance remains: same single unapproved `12674` draft; 13 physical rows; Red Bull `00206` and `11` at 24 pieces; `12798` and `12718` at 12 stock pieces; printed discounts on the correct rows; net `324.31 EUR`, VAT `42.16 EUR`, gross `366.47 EUR`; no stock posting or finalization.
