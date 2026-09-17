# MANTZILAS 00009 + CORONA joint final normalization — 2026-09-17

## Current LAB evidence

- **LAB PASS:** fresh POS-front invoice `12665` completed automatically with 18 rows and code `02410` CORONA now shows `24 pieces × 0.98 EUR`, net `23.52 EUR`.
- **LAB FAIL:** in the same fresh read, code `00009` COCA-COLA ZERO regressed to `48 pieces / 65.5%`, net `13.49 EUR`, instead of `24 pieces / 31%`.
- The two code `00009` representations have identical net/gross economics. Provider reread therefore remains nondeterministic unless the proven correction is enforced in the same final packaging-normalization stage that owns CORONA.

## Bounded change

- Consolidate both current-invoice proofs in `applyMantzilasPackaging`, the final MANTZILAS row-normalization stage.
- Preserve the existing exact CORONA `02410` piece proof.
- For code `00009` only, require COCA-COLA ZERO x24 identity plus one of the exact equivalent arithmetic states:
  - `48 × 0.814583` at `65.5%` → `24 × 0.814583` at `31%`, or
  - `2 × 19.55` at `65.5%` → one x24 package at `31%`.
- Also keep an already-correct `24 × 0.814583 / 31%` row as pieces so a stale KIB token cannot multiply it again.

## Protected behavior and acceptance

- Preserve 18 rows, CORONA `02410 = 24 × 0.98`, all other packaging rules, net/EFK/taxable/VAT/gross values, and whole-invoice totals.
- No payment, credit, draft identity, stock posting, approval, finalization, fiscal or accounting behavior changes.
- PASS requires one fresh POS-front read where both rows are simultaneously correct:
  - `00009 = 24 pieces / 31%`, net `13.49 EUR`, gross `15.24 EUR`.
  - `02410 = 24 pieces × 0.98 EUR`, net `23.52 EUR`, gross `35.71 EUR`.
- Focused invoice/POS recovery tests: **104/104 PASS**, including both rows in the same normalization pass and negative controls for unrelated codes/cartons.
- Full server suite: **1294/1294 PASS**.
- Client production build and server/Prisma build: **PASS**.
- PR **#931**, CI **#2417** and exact production revision `6b7b33a3f4f8be88fe7816b0cd677891ce14c915`: **PASS**.
- **FINAL POS-FRONT LAB PASS:** fresh invoice `12665` completed automatically with 18 rows and `POS_BACKGROUND_COMPLETE`.
- The same saved draft shows both protected rows correct simultaneously:
  - `00009 = 24 pieces / 31%`, net `13.49 EUR`, gross `15.24 EUR`.
  - `02410 = 24 pieces × 0.98 EUR`, net `23.52 EUR`, EFK `5.28 EUR`, taxable `28.80 EUR`, gross `35.71 EUR`.
- Invoice total `429.27 EUR` versus line sum `429.26 EUR`: difference `0.01 EUR`, within the visible `0.05 EUR` tolerance.
- No approval, finalization or stock posting was performed during acceptance.
- Status: **LAB PASS**.
