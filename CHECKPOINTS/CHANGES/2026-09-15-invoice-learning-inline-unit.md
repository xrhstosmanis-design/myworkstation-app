# Invoice Learning inline unit fallback

## LAB evidence

The FRESH MILK LOGISTICS credit note exposes code, description, quantity, unit price,
discount, VAT and line value as declared columns. `ΤΕΜ` is printed inline in each
product row rather than supplied as a dedicated column, so the supplier-map editor
could not satisfy its former mandatory `UNIT` validation.

## Change

- Require supplier code, description, quantity and unit price when saving a map.
- When no unit column is selected, persist `readingRule.defaultUnit = "ΤΜΧ"`.
- During declared-column recovery, use the printed inline piece token as the anchor.
- Keep the existing quantity/price/value reconciliation gate; unbalanced lines remain
  unchanged for manual review.
- Apply the same behavior to both the local and centrally published map editors.

## Safety

This change does not post stock, finalize or approve a purchase, create an invoice,
or change any payment/credit transaction. It only affects OCR draft interpretation.

## Verification

- `node --test server/test/invoice-central-column-learning-v1.test.js`
- JavaScript syntax checks for both supplier-map editors.
