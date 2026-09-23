# 2026-09-23 — Workforce AI draft employee/week fix — AWAITING CI + LAB

## LAB failure

- The structured AI preview was generated, but saving it as DRAFT returned «Δεν βρέθηκε εργαζόμενος Workforce v2.».
- The preview also incorrectly used 23/09–29/09 instead of the selected calendar week 21/09–27/09.

## Root causes

- The AI apply route did not attach the authenticated request user to the Workforce validation context.
- AI interpretation used the selected day as the first day instead of normalizing it to Monday.
- Payload employee/template membership and assignment dates were not revalidated immediately before persistence.

## Fix

- Preserve the authenticated user for post-save Workforce validation.
- Normalize every weekly AI preview and DRAFT to Monday–Sunday.
- Load approved leave from the normalized week start.
- Restrict cross-store employees to active `canSchedule` access.
- Reject stale employees, inactive templates, or dates outside the selected week before creating a DRAFT.

## Verification

- Targeted Workforce schedule tests: PASS.
- Node syntax check: PASS.
- Diff validation: PASS.
- Pending: green CI, merge, exact Render revision verification, then LAB retry.
