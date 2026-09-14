# 2026-09-14 — Gate 3: preserve provider timeout through Azure fallback

## LAB evidence

- LAB was running merge cb1850b from PR #831.
- A refresh at 08:20 did not update the existing 2612188 draft, which remained at 0 lines / 0,00 € with updatedAt 08:04.
- This excludes deployment lag and shows the stored failure was not eligible for the guarded recovery.

## Αλλαγές

- Azure all-pages fallback now rethrows actual provider timeout errors instead of replacing them with a generic OCR recovery error.
- The exact generic all-pages message already stored by the current LAB job is admitted to transient recovery.
- No other OCR, payment or configuration error is added.

## Safety

- Same job, draft, photos and existing payment.
- No FAST-header, price, discount, quantity, payment, stock, approval or finalization calculation changed.
- Recovery remains tenant/store scoped and requires the durable POS handoff.

## Validation

- Regression coverage verifies preserved timeout identity and exact recovery eligibility.
- LAB refresh should reclaim the existing failed draft without a new upload.
