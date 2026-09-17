# MANTZILAS leading-zero code identity — 2026-09-17

## LAB evidence

- The cent-level fail-closed gate correctly rejected the unsafe table and left invoice `12665` at `0 items / 0.00 EUR`.
- Background status was `POS_FAILED / POS_BACKGROUND_FAILED` at stage `AI_RECHECK_INTERNAL [discount-verification]`.
- MANTZILAS uses display-padded numeric supplier codes such as `0168` and `00009`; vision may return the same printed numeric identity as `168` or `9`.

## Bounded correction

- Numeric-only supplier codes are compared after removing display-only leading zeroes.
- Alphanumeric codes remain exact.
- The row index must still match, each target remains unique, every row equation must balance, and the whole invoice must still reconcile within `0.05 EUR`.

## Safety and LAB acceptance

- No payment, credit, stock, approval, finalization, fiscal or accounting behavior changes.
- PASS requires all 18 rows and gross `429.27 EUR` within `0.05 EUR`; failure must remain `0 items` rather than publish shifted lines.
