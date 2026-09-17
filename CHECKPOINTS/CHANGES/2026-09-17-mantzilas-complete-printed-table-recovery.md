# 2026-09-17 — MANTZILAS complete printed-table recovery

## LAB evidence

- Fresh invoice `11998` was submitted exactly once from the POS front.
- The fast header was correct: supplier MANTZILAS, date `04/09/2026`, gross `330.37 EUR`, settlement with credit.
- The durable background ended in `POS_BACKGROUND_AI` instead of completing automatically. This is a LAB FAIL; preserved payment/draft safety is not acceptance.
- Printed source truth: 14 physical rows, taxable/net `272.43 EUR`, VAT `57.94 EUR`, gross `330.37 EUR`.

## Repair

- The full-image verifier must return every physical row even when the first OCR guide omitted one.
- A replacement table is accepted only when indexes are contiguous, every row independently balances quantity, original price, discounts, net, excise, taxable value, VAT and gross, the VAT footer agrees by rate, and the aggregate agrees with the POS-confirmed total.
- The repaired table retains current-image supplier codes, descriptions and printed units so central MANTZILAS packaging rules can run without historical economics.
- No payment, credit, approval, stock posting, finalization, fiscal or accounting mutation is introduced.

## Verification

- Added exact invoice `11998` regression with all 14 printed rows and VAT footer `24%: 204.74 + 49.14 = 253.88`, `13%: 67.69 + 8.80 = 76.49`.
- Negative control rejects a 13-row candidate even though every included row balances.
- Focused invoice/POS tests: `55/55` PASS.
- Full server suite: `1302/1302` PASS.
- Client production build and server/Prisma build: PASS.
- Awaiting commit, green CI, merge, exact deployed revision and recovery/retest from POS front. BackOffice refresh is not acceptance.
