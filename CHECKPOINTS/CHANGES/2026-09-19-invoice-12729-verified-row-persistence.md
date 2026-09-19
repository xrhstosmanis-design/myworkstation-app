# Invoice 12729 verified-row persistence — 2026-09-19

## LAB evidence

- One and only one POS-front credit submission of `5936.jpg` created invoice `12729` for MANTZILAS.
- The POS returned immediately and the same draft completed as `AWAITING_APPROVAL / POS_BACKGROUND_COMPLETE` without a second upload or BackOffice refresh.
- The draft contained all 10 physical rows and the correct taxable/net total `164.66 EUR`, but displayed gross `200.09 EUR` instead of printed `200.08 EUR`.
- Package stock quantities were persisted as invoice quantities (`1 / 2 / 3`) and printed discounts/excise were lost. The UI nevertheless labelled the `0.01 EUR` difference as agreement, so this is **LAB FAIL**, not acceptance.

## Root cause

- The complete MANTZILAS reread had already verified the current-image row arithmetic and packaging.
- Those rows used safe quantity markers such as `AI_PRINTED_ROW_FULL_MATH_VERIFIED`.
- `verifiedPrintedTableForPersistence` accepted only `AI_COMPLETE_PRINTED_TABLE_VERIFIED`, so the worker incorrectly sent the already verified rows through the legacy finalizer again.
- The second transformation discarded original price/discount/excise/package metadata while retaining a close gross total.

## Bounded correction

- Accept only the explicit safe complete-row marker set when every row also has `sourceColumnsVerified=true` and the full invoice total reconciles within `0.05 EUR`.
- Preserve the verified current-document fields unchanged through POS persistence.
- Apply one deterministic final-line cent residual only when the complete line sum differs from the confirmed invoice total by at most `0.05 EUR`. Invoice `12729` therefore keeps net `164.66`, VAT `35.42` and gross `200.08`.
- Advance the MANTZILAS reread strategy to V14. At startup, reread a recent unapproved completed draft when either reconciliation failed or persisted `4PACK / 6PACK / KIB` descriptions prove the stock multiplier was lost.
- Replace the same draft atomically from the original durable attachment; never create another invoice, credit, payment or job.

## Exact regression contract

- Supplier: MANTZILAS; document `12729`; date `2026-09-17`; credit.
- Ten physical rows.
- Stock quantities: `20, 1, 24, 24, 24, 24, 12, 48, 8, 12`.
- Discount 1: `22, 0, 17, 17, 17, 17, 0, 0, 31, 0` percent.
- Net/taxable `164.66 EUR`, VAT `35.42 EUR`, gross `200.08 EUR`.
- The printed `48 TEM` row remains 48 and is never multiplied again.
- Unverified or materially mismatched tables remain blocked.

## Safety boundaries

- Existing draft remains unapproved and unfinalized.
- No second upload, payment, stock movement, fiscal command, accounting entry or myDATA transmission.
- Automatic reread is limited to recent MANTZILAS POS OCR drafts that are still `DRAFT / AWAITING_APPROVAL` and have the durable original handoff.

## Verification

- Exact `12729` regressions: PASS.
- Focused invoice/POS regressions `49/49`: PASS.
- Complete server suite `1316/1316`: PASS.
- Production client/server/Prisma build and diff checks: PASS.
- Green CI, merge, exact deploy and post-deploy same-draft evidence remain required before LAB PASS.
