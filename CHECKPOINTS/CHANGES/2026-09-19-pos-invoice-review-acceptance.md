# POS Invoice OCR — review-based LAB acceptance

## Decision

LAB acceptance permits at most two uncertain product lines per invoice, only when the automatically-created, unapproved purchase draft visibly marks them **ΠΡΟΣ ΕΛΕΓΧΟ**. Any unresolved product line still fails acceptance.

## Implementation

- The POS V2.4.4 draft writer evaluates every product line before persistence.
- Low OCR confidence, missing numeric quantity/cost, uncertain package conversion, or an explicitly unverified numeric read persists as `NEEDS_REVIEW` with an operator-readable reason.
- The BackOffice OCR review panel renders `ΠΡΟΣ ΕΛΕΓΧΟ`, includes the reason, and counts flagged lines rather than describing them as fully checked.
- A normal saved line correction explicitly changes the line to `MATCHED`, clears the review reason, records audit evidence, and retains the existing supplier-scoped Invoice Learning calls.

## Safety

- Draft creation stays idempotent and unapproved.
- No stock, payment, fiscal, accounting, or myDATA operation is introduced by this change.
- A fresh POS submission and production verification are still required before LAB PASS may be claimed.

## Verification required

- Unit regression: two `NEEDS_REVIEW` lines are permitted; three or any unresolved line are not.
- Full server tests, production build, CI, deploy and a new supplier POS-front flow remain pending.
