# 2026-09-14 — Restore the proven LAB FAST header window

## LAB evidence

- Before the recovery work, invoice 2612188 returned its basic FAST header in about 7 seconds.
- After PR #828, the next LAB attempt failed with an internal error instead of restoring that behavior.
- The short 9-second Azure cutoff could force the fallback even though the established Azure invoice path may legitimately need longer.

## Αλλαγές

- The dedicated Azure FAST-header allowance is restored to 40 seconds, covering the existing Azure polling window.
- Only FAST-header calls receive a 60-second POS request budget; every other POS API call keeps the existing 30-second default.
- The fallback remains bounded to 15 seconds, keeping the full FAST provider path inside the dedicated client budget.
- Price, discount and background V2.4.4 logic is unchanged.

## Safety

- This stage only reads the selected pages and basic header fields.
- No payment, credit, draft, stock, approval or finalization is executed.
- Existing payments and drafts are untouched.

## Validation

- Regression coverage verifies the dedicated request budget and unchanged 30-second default.
- LAB repeats only the initial two-page header read, without pressing a payment option.
