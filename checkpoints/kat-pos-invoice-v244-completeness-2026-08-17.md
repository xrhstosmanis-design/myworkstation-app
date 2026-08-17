# KAT POS Invoice V2.4.4 completeness checkpoint

Date: 2026-08-17

Locked PASS before this checkpoint:
- POS supplier invoice structured V2.4.4 flow
- no anchors/IBAN as products
- owner/manager override for invoice-total difference > 0.05 EUR with mandatory reason and audit
- case-to-piece stock conversion, idempotent correction

Change in this checkpoint:
- AI product-table recovery is triggered when product-line gross total differs from invoice total by more than 0.05 EUR, not only when all numeric fields are zero.
- recovery prompt requests ALL visible product rows.
- recovered rows can be appended when they were missing from the first pass.
- completeness metadata stores gross total before/after recovery, difference, and completion state.

Primary commits:
- 9b16d9ca116c5a7f1b06d9ff49808191923195bf
- 7c62ef5c367d0f6c8cae101d0270c2fe5f75b752

Next real test:
Upload a fresh invoice image through POS -> Payments -> Supplier payment and verify recovered productLines reconcile to the header invoice total within 0.05 EUR before BackOffice finalization.
