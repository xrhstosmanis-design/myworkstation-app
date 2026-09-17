# MANTZILAS FAST invoice total versus account balance — 2026-09-17

## Current LAB evidence

- **LAB FAIL:** fresh POS-front FAST read of MANTZILAS invoice `12424`, dated `11/09/2026`, selected `4,531.01 EUR` as the total.
- The selected value is the printed customer **new account balance**, not the invoice amount.
- The same original prints an auditable VAT-summary total: net `264.27 EUR` + VAT `54.47 EUR` = invoice gross `318.74 EUR`.
- Supplier, document number and document date were read correctly.

## Bounded correction

- For MANTZILAS only, recover the gross invoice amount from the printed VAT-analysis `TOTALS` row when the three amounts independently satisfy `net + VAT = gross` to cent precision.
- Explicitly tell the FAST reader never to use previous/new account balance, running balance, deposit/returnable-packaging balance or similar ledger values as `totalGross`.
- Preserve the existing provider fallback when the printed VAT-summary proof is absent or incomplete.

## Protected behavior and acceptance

- Preserve the LAB-passed joint normalization for codes `00009` and `02410`, all packaging/economics rules, and the existing supplier-wide behavior across stores.
- No payment, credit, draft identity, stock posting, approval, finalization, fiscal or accounting behavior changes.
- CI PASS is not LAB PASS.
- After green CI, merge and exact deploy, PASS requires a fresh POS-front read of invoice `12424` showing supplier MANTZILAS, number `12424`, date `11/09/2026` and total `318.74 EUR` before choosing Paid or Credit.
- Focused invoice/checkpoint tests: **65/65 PASS**, including the exact printed `318.74 EUR` versus `4,531.01 EUR` account-balance case and negative controls.
- Full server suite: **1295/1295 PASS**.
- Client production build and server/Prisma build: **PASS**.
- Status: **AWAITING CI, merge, exact deploy and POS-front LAB**.
