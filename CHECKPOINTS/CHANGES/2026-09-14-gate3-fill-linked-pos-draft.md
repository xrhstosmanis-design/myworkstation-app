# 2026-09-14 — Gate 3: background OCR fills the linked POS draft

## LAB evidence

- Invoice 2612188 completed its provider attempt and failed at 20:17 with `POS_FAILED / POS_BACKGROUND_FAILED` and a generic internal error.
- The POS flow creates the safe empty draft before OCR. The product-line endpoint then rejected every write merely because that draft was already linked.

## Fix

- A completed `AI_COMPLETE` background worker may write V2.4.4 lines only when the same job has a durable `posHandoff` and is linked to a still-DRAFT `POS_OCR_DRAFT` document.
- Every other write to an already-linked document remains blocked with 409.
- The following POS intake step remains responsible for atomically replacing the draft order lines.

## Safety / validation

- Same job, draft, payment and source pages. No new charge, stock, approval or finalization.
- 46/46 targeted invoice, worker and linked-draft tests PASS.
