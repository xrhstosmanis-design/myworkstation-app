# MANTZILAS CORONA 02410 piece-unit correction — 2026-09-17

## Current evidence

- **LAB PASS:** the fresh POS-front recovery completed invoice `12665` with 18 rows; supplier code `00009` is now shown as `24 pieces / 31%`, net `13.49 EUR`, gross `15.24 EUR`.
- **LAB FAIL:** supplier code `02410`, `CORONA ΦΙΑΛΗ 0,33ML`, is shown as `576 pieces` at `0.040833 EUR` even though the verified printed row is already `24 pieces` at `0.98 EUR`, net `23.52 EUR`.
- The failure is a stock-unit presentation conversion (`24 × 24`) applied after the authoritative printed-row reread. The invoice economics stayed `23.52 EUR` net and must remain unchanged.

## Bounded change

- For MANTZILAS code `02410`, accept the row as pieces only when the current row itself identifies CORONA bottle `0.33` and the fully verified printed arithmetic proves exactly `24 × 0.98 = 23.52`.
- Remove the stale carton multiplier for that proven row and expose one stock unit per printed piece.
- Do not alter any other MANTZILAS package rule or any invoice amount, discount, excise, VAT or gross value.

## Safety and acceptance

- No payment, credit, draft identity, stock posting, approval, finalization, fiscal or accounting behavior changes.
- Existing working behavior to preserve: all 18 rows, `00009 = 24 pieces / 31%`, and the invoice economics produced by the same POS-front read.
- PASS requires a fresh POS-front read to show `02410 = 24 pieces`, unit cost `0.98 EUR`, net `23.52 EUR`, with no change to the row's remaining economics or the other 17 rows.
- Focused invoice/POS recovery tests: **104/104 PASS**.
- Full server suite: **1294/1294 PASS**.
- Client production build and server/Prisma build: **PASS**.
- Status: **AWAITING commit, green CI, exact deploy and POS-front LAB**.
