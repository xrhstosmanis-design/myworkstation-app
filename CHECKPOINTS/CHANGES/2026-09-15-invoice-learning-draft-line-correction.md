# Invoice Learning draft-line correction — 2026-09-15

## Scope

Allow an operator to correct one invoice-draft line without developer help.

## Operator flow

- Select the invoice line.
- Correct the invoice quantity, invoice-unit price, stock conversion, and decimal discounts.
- Inspect the converted quantity, per-stock-unit price, and line value before applying.
- Optionally save unit, conversion, and discount as a central supplier rule.

## Safety

The correction is a draft-only action. It does not post stock, accounting, payment, invoice approval, or a final purchase document.

## Regression guard

Converted quantities are retained as converted values during the Lab render and are not reconstructed again from the converted unit price.
