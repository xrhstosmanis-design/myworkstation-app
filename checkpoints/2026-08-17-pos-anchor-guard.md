# MyWorkStation checkpoint — POS OCR anchor guard

Date: 2026-08-17

Safe state after fixing false `anchor N` product rows in POS OCR -> Purchase Orders flow.

- Anchor placeholders are forced to INFO/non-product rows at DB bridge level.
- Existing NEW POS_OCR_DRAFT anchor rows are neutralized.
- INFO rows are deleted from PurchaseDocumentLine bridge and cannot affect stock/finalization.
- Supplier learning and V2.4.4 reader remain untouched.
- Previous auto-close POS payment modal fix remains active.

Code commit: 8a640b4947866cc7a2d1282e6ef9b7e54a70ed9d
