# MANTZILAS 12424 existing-draft line recovery — 2026-09-17

## Current LAB evidence

- **LAB PASS:** PR `#933`, CI `#2421` and exact production revision `59cc0f4655dfcca4c9dd4ce9f1d450ae8f6e1558` corrected the FAST header of invoice `12424` to supplier MANTZILAS, date `11/09/2026`, and gross `318.74 EUR`; the printed account balance `4,531.01 EUR` is no longer selected.
- **LAB FAIL:** after the user selected credit once, the same draft remained at zero lines in `POS_QUEUED / POS_RECOVERING` from approximately `17:13` through `17:27` UTC.
- The draft and its original attachment still exist. The user must not upload the invoice again, create another credit, delete the draft, approve it or post stock.

## Root cause and bounded correction

- The FAST Azure pass retained candidate product rows but reconciled them against Azure's wrong header total before the independently verified MANTZILAS VAT-summary total replaced it. The candidates were discarded and never rechecked against `318.74 EUR`.
- Preserve Azure candidate rows until the final confirmed total is known, then accept them only when their complete gross sum reconciles within `0.05 EUR`.
- For an already-created MANTZILAS POS draft, run the same bounded central Azure pass first against the stored original attachment and confirmed draft total instead of repeatedly spending the long OpenAI path first.
- Skip a second provider discount pass only for MANTZILAS rows whose current Azure source columns are already independently verified; unresolved rows retain the existing verification path.

## Protected behavior and acceptance

- Preserve invoice `12665` LAB PASS, including `00009 = 24 pieces / 31%` and `02410 = 24 pieces × 0.98 EUR`, plus all other packaging/economic rules.
- Preserve the corrected `12424 = 318.74 EUR` header.
- Reuse the exact existing draft, attachment and credit handoff. No duplicate payment/credit, new draft, stock posting, approval, finalization, fiscal or accounting action.
- CI PASS is not LAB PASS.
- PASS requires exact deploy followed by refresh/recovery of the existing draft `12424` into its printed rows and totals without another POS submission.
- Focused regression tests: **94/94 PASS**.
- Full server suite: **1296/1296 PASS**.
- Client build and server/Prisma build: **PASS**.
- Status: **LAB FAIL / implementation verified locally; awaiting CI, exact deploy and existing-draft LAB recovery**.
