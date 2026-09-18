# Preserve verified MANTZILAS table at POS persistence — 2026-09-18

## LAB evidence

- Status: **LAB FAIL** on exact production `0230624780a5103f3088b880111a4ec2ef2f3af9`.
- Invoice `12674` remains one unapproved 13-line credit draft at net `331.09 EUR` / gross `374.12 EUR`, while the printed invoice gross is `366.47 EUR`.
- The two printed Red Bull rows, supplier codes `00206` and `11`, each contain `24 TEM`; the retained draft incorrectly exposes `576` pieces on both.
- The retained draft shows zero discounts on every row although the physical invoice contains balanced printed discounts including `31%` and `19%`.
- The new complete reread was rejected with a reported `120.28 EUR` difference, leaving the prior draft unchanged. This was the correct safe fallback but not an acceptable invoice result.

## Root cause and bounded correction

- The complete MANTZILAS verifier can publish only a contiguous physical table whose individual row equations, VAT-footer groups and independent invoice total agree within `0.05 EUR`.
- The POS background worker subsequently passed that already verified table through the older heuristic finalizer. That second interpretation could expand printed piece quantities and erase or shift current-row discount economics before the worker's replacement comparison.
- Recognize an authoritative table only when every row carries both `sourceColumnsVerified=true` and `quantitySource=AI_COMPLETE_PRINTED_TABLE_VERIFIED`.
- Reconcile that table again against the independently confirmed invoice total and bypass heuristic finalization only when the difference remains at most `0.05 EUR`.
- A partial, unverified or total-mismatched table still follows the existing guarded finalizer and cannot use this path.
- Advance the one-attempt existing-draft recovery marker from V11 to V12 so the archived current image can repair the same draft after deployment.

## Protected behavior

- Preserve the exact physical rows, supplier codes, printed quantities, units, original values, discounts, excise, net values, VAT rates and gross values produced by the verified current-image table.
- Preserve the verified MANTZILAS package rules, including `12798` and `12718` as 12-piece cartons, without hardcoding invoice economics.
- Preserve the same supplier, document number, date, source image, AI job, unapproved draft and settlement identity.
- No new upload, duplicate payment, duplicate credit, duplicate draft, approval, finalization, stock posting, fiscal, accounting, myDATA or historical-invoice mutation.

## Verification and LAB acceptance

- Focused reconciliation, persistence, recovery, multipage and central-column regressions: `110/110 PASS`.
- Syntax and diff checks: PASS.
- Full server suite: `1305/1305 PASS`.
- Production client/server/Prisma build: PASS.
- Require green CI, merge and verification of the exact deployed revision before LAB.
- LAB acceptance for `12674`: same single unapproved draft; `13` physical rows; both Red Bull rows at `24` pieces; `12798` and `12718` at `12` stock pieces; printed discounts present on their correct rows; totals reconcile to printed net `324.31 EUR`, VAT `42.16 EUR`, gross `366.47 EUR`; no stock posting or finalization.
