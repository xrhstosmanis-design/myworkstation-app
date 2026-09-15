# POS complete FAST page-line reuse — 2026-09-15

## LAB evidence

Invoice 2612188 successfully recognized both selected pages and all four header fields, but its existing DRAFT remained at zero lines in `POS_QUEUED / POS_RECOVERING` for more than six minutes.

## Root cause

The FAST Azure calls had already normalized product rows for each page, but the response discarded those rows. The durable worker then uploaded and read both images again through the slower full-provider retry path.

## Change

- Return normalized product rows with successful Azure FAST page results.
- Keep the rows with their originating selected page in the POS client.
- Persist and reuse the combined rows only when every selected page supplied non-empty safe rows.
- Fall back to the existing full OCR path whenever the cached set is incomplete.

## Safety

No new payment, payment mutation, stock posting, approval, or finalization behavior is introduced. The existing duplicate-payment guard and DRAFT workflow remain unchanged.

## Verification

CI must pass before merge. Final validation is one LAB reread of invoice 2612188 using the existing payment, followed by confirming all rows and the printed total in BackOffice without finalization.
