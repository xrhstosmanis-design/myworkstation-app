# MANTZILAS corrective reread authority — 2026-09-17

## LAB evidence

- POS-front reading completed 18 rows but produced net `358.19 EUR` and gross `434.07 EUR` against printed gross `429.27 EUR`.
- Visible neighboring-row drift affected codes `00009`, `08162`, `11` and the six-pack conversion for `433`.
- The first-pass rows had been marked source-verified, so the later focused current-image correction was rejected whenever it tried to replace their wrong per-row gross values.

## Bounded correction

- Keep the unique row identity requirement: current-image index and supplier code must identify the same unclaimed row.
- Allow that identity-locked, fully balanced current-image row to replace a wrong first-pass source row even when its gross changes.
- Keep the existing atomic whole-invoice gate: all 18 unique rows must pass and their total must match the printed invoice.
- Add a MANTZILAS-specific cent-level final gate so a table with a `4.80 EUR` mismatch can never be published merely because it is within the generic POS review tolerance.

## Safety and LAB acceptance

- No payment, credit, stock, approval, finalization, fiscal or accounting mutation changes.
- PASS requires 18 unique rows and printed gross `429.27 EUR` within `0.05 EUR`; code `0168` must remain net `9.60 EUR` / gross `11.90 EUR`, and the four learned stock rows must retain their confirmed quantities.
