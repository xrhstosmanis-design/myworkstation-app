## Λεβεντόπουλος — complete printed-table fail-closed

### LAB evidence

- Diagnostic invoice `ΤΔΛΠΧ14 15` has a printed final amount of `194,77 €` and nine physical rows.
- A free-form OCR numeric scan combined values from different cells/rows. It produced mathematically plausible but false quantities and prices, and a background reread then presented a 17-line / `428,18 €` candidate.

### Safe rule

- `ΜΜ` is never treated as quantity. The supplier profile declares `ΠΟΣ1` as the quantity column and ignores `ΜΜ` / `ΠΟΣ2`.
- Free-form numeric scanning for this layout is disabled. It cannot mark a line as source-column verified.
- A Λεβεντόπουλος candidate may fill or replace a POS OCR draft only when the complete printed-table verifier has independently validated every row, VAT footer and the operator-confirmed total.
- Any incomplete or mismatched reread fails closed and leaves the linked draft, payment/credit identity, stock, fiscal/accounting and myDATA state unchanged.

### Validation

- Focused POS line-contract and completeness tests pass locally.
- Awaiting GitHub CI, merge, deploy and one LAB reread of the existing diagnostic attachment. The existing draft is not deleted or modified by this change.
