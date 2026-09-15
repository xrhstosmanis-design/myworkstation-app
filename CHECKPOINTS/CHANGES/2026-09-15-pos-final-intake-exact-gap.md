# 2026-09-15 — POS final-intake exact-gap recovery

## LAB evidence

The Coffee Union POS draft ΔΑ0011467 reaches the final order with the correct stock-unit conversions but only six rows. The displayed rows total 1,246.38 € while the authoritative linked draft total is 1,380.44 €. The missing 134.06 € gap uniquely matches the printed repeated FR1500 cup charge (134.07 € including invoice rounding).

## Change

- Apply the strict exact-gap recovery at the final `/pos-intake` boundary, immediately before product matching and atomic draft-line replacement.
- Restore a row only when exactly one existing line matches the complete gross gap within 0.05 €.
- Require the restored line sum to reconcile to the authoritative invoice total within 0.05 €.
- Leave ambiguous or non-reconciling cases unchanged for manual review.
- Advance the POS reread strategy to `FINAL_INTAKE_EXACT_GAP_V7` so the existing DRAFT is processed once with the new rule.

## Safety

- Existing supplier payment is reused and never duplicated or changed.
- No stock movement is posted.
- The purchase document remains DRAFT and is not finalized.
- Existing lines are replaced atomically only in the already-authorized reconciliation reread.
