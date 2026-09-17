# MANTZILAS POS-front code 00009 correction — 2026-09-17

## Current evidence

- **LAB FAIL:** a new POS-front read completed all 18 rows and the invoice totals, but supplier code `00009` was shown as `48 pieces / 65.5%` instead of the printed `24 pieces / 31%`.
- The other 17 rows are operator-confirmed as correct. This change must not alter them.
- The two representations have the same `13.49 EUR` net and `15.24 EUR` gross, so invoice-total reconciliation cannot distinguish them.
- BackOffice refresh recovery is not acceptance; the required correction must happen during the original POS-front read.

## Bounded change

- Add a MANTZILAS-only fallback for supplier code `00009` when the current row identifies COCA COLA ZERO in a 24-pack and its own arithmetic proves the exact half-quantity / `31%` alternative.
- Keep the existing same-document sibling proof as the generic first choice.
- Preserve row identity, full-row arithmetic and whole-invoice total reconciliation.

## Safety and acceptance

- No payment, credit, draft identity, stock posting, approval, finalization, fiscal or accounting behavior changes.
- PASS requires a fresh POS-front read to create all 18 correct rows, with `00009 = 24 pieces / 31%`, net `13.49 EUR`, gross `15.24 EUR`, and unchanged invoice totals.
- Focused POS invoice tests: **41/41 PASS**.
- Full server suite: **1292/1292 PASS**.
- Client production build and server/Prisma build: **PASS**.
- Status: **AWAITING commit, green CI, exact deploy and fresh POS-front LAB**.
