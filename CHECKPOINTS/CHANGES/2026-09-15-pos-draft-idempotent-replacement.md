# POS draft idempotent replacement

- LAB invoice `ΔΑ0011467` exposed two inconsistent views: the document summary held one OCR result, while its purchase order contained the same six rows twice.
- Root cause: a successful retry could fill an existing `DRAFT` shell without first replacing its previous OCR rows.
- Every successful fill of the same linked POS draft now replaces its purchase-order rows in the same database transaction before inserting the new canonical result.
- The active V2.4.4 intake now derives stock multipliers from explicit descriptions (`3KGR`, `1KG`, `100TEM`) while retaining the invoice quantity and financial values.
- Supplier payment/credit linkage is unchanged. No stock posting, approval, invoicing, reversal, or finalization occurs.
- Targeted regression suite: 70/70 PASS.

