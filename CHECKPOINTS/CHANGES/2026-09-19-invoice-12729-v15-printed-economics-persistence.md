# Invoice 12729 V15 printed-economics persistence — 2026-09-19

## Evidence and root cause

- Post-deploy LAB screenshot of the existing draft `12729` still showed package quantities as `1 / 2 / 3`, zero excise and missing discounts.
- The full MANTZILAS reread can reconstruct a balanced printed row with `recoverMantzilasEconomics`, but that reconstruction set `sourceColumnsVerified=true` without a persistence-safe `quantitySource` marker.
- The persistence gate therefore rejected the reconstructed row set and the worker fell back to the legacy finalizer, which discarded package, discount and excise metadata again.

## Bounded correction

- Mark only four-equation, printed-column MANTZILAS reconstruction as `MANTZILAS_PRINTED_ECONOMICS_VERIFIED`.
- Permit that marker only together with `sourceColumnsVerified=true` and the independent invoice-total reconciliation.
- For `replaceExistingDraft` recovery, prohibit the lossy legacy finalizer entirely. If a full printed table is not safe, retain the existing draft and fail rather than overwrite it with incorrect data.
- Advance the one-time same-draft recovery strategy to V15, preserving the original attachment, OCR job, credit identity and draft.

## Regression contract

- Exact invoice `12729` keeps ten rows, stock quantities `20, 1, 24, 24, 24, 24, 12, 48, 8, 12`, discounts `22, 0, 17, 17, 17, 17, 0, 0, 31, 0`, excise, and `164.66 + 35.42 = 200.08 EUR`.
- A balanced printed-column recovery is accepted for persistence; unverified or materially mismatched rows are still rejected.
- No second upload, approval, finalization, payment, inventory, fiscal, accounting or myDATA mutation.

## Verification

- Focused invoice/POS regressions `50/50`: PASS.
- Complete server suite `1317/1317`: PASS.
- Production client/server/Prisma build and diff checks: PASS.
- CI, merge, exact deploy and same-draft LAB verification remain required.
