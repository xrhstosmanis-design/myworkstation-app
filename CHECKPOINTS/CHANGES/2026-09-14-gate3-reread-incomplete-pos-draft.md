# Gate 3 — safe reread of an incomplete POS draft

- LAB invoice 2612188 recovered the same paid draft and attachments, but the stored OCR result contained only 24 lines / 1.465,98 € instead of 38 lines / 608 pieces / 2.369,99 €.
- A completed POS draft with an explicit reconciliation mismatch is claimed once and reread from the original durable page attachments.
- The reread replaces lines only inside the same DRAFT purchase order transaction and only when it reconciles or strictly improves both coverage and amount difference.
- An equal or worse reread leaves the existing draft lines untouched.
- The original `paymentTransactionId` is reused. No new payment, credit, stock update, approval or finalization is performed.

LAB acceptance: invoice 2612188 remains the same draft and payment, and reaches 38 lines / 608 pieces / 2.369,99 € before any approval.
