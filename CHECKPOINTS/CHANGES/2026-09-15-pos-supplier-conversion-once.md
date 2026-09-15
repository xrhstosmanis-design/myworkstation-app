# 2026-09-15 — POS supplier conversion exactly once

## LAB evidence

The recovered Coffee Union draft now has all seven invoice rows and reconciles at 1,380.45 € versus the printed 1,380.44 €, but stock quantities are multiplied twice: 36,000,000 g instead of 36,000 g and 240,000 pieces instead of 2,400 pieces.

## Root cause

The supplier-profile rule converted `quantity` and `unitCost` into stock units and also persisted `stockUnitsPerInvoiceUnit`. The order review correctly multiplies invoice quantity by that field, so the already-converted values were converted a second time.

## Change

- Preserve printed invoice quantity and package unit cost on the purchase line.
- Store the conversion factor only in `stockUnitsPerInvoiceUnit`.
- Retain derived stock quantity as audit evidence, not as invoice quantity.
- Add a regression test preventing quantity and unit cost conversion inside the supplier profile.

## Safety

The document remains DRAFT. No payment, stock movement, approval or finalization behavior changes.
