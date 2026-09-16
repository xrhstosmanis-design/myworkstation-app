# STEFANIDIS hidden discount recovery — 2026-09-16

## LAB evidence

- POS invoice `43243` completed with 16 lines and the correct printed total tolerance.
- Line 8, `340061124 LAYS PRAWN 120G (C20U)`, was economically balanced but semantically wrong.
- The print shows quantity `2`, original unit price `1.420 EUR`, initial value `2.84 EUR`, discount `15%` / `0.43 EUR`, and net `2.41 EUR`.
- The draft instead stored net unit cost `1.205 EUR` with discount `0%`, hiding the real supplier discount.

## Bounded change

- For a line with no structured discount, inspect the provider's full raw row even when a positive unit cost already exists.
- Replace that price and restore the discount only when the printed arithmetic independently proves quantity × original price, discount percentage/amount and net value.
- Lines that already contain a verified discount retain the existing path.

## Safety

- No existing draft, payment, stock, approval, finalization, fiscal or learning data is changed.
- The current invoice `43243` remains unapproved.
- The fix applies only to future/rerun reads and remains fail-closed when raw arithmetic is ambiguous.

## Required validation

- Regression fixture must recover `1.420 EUR → 15% / 0.43 EUR → 2.41 EUR`.
- All existing discount, POS and server tests plus client/server builds must pass.
- CI PASS is not LAB PASS. After deployment, delete only the unapproved test draft/source and rerun once from POS while preserving the existing payment.
