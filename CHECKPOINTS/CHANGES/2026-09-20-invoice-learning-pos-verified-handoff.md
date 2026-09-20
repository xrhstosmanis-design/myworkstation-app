# Invoice Learning → POS verified handoff

## Evidence

- Invoice Learning read DELTA invoice `28897` as 11 printed rows and `53.92 €`
  against the photographed payable total `53.91 €` (accepted one-cent rounding).
- The first POS handoff kept the linked draft empty and reported
  `POS_BACKGROUND_AI_RECHECK` because the learned profile required a verified
  complete printed table, while the already-reconciled rows had not yet been
  sent through the current-image verifier.

## Change

- A confirmed central supplier profile now requests complete current-image
  verification whenever any extracted row lacks source-column verification,
  even when its aggregate already reconciles within tolerance.
- The existing fail-closed persistence gate remains unchanged: every row must
  pass printed arithmetic/footer verification before the existing POS draft is
  filled.
- No payment, stock, fiscal, accounting, myDATA, approval or finalization path
  is changed.

## Verification

- Targeted POS/profile tests: `73/73` PASS.
- Full server suite: `1367/1367` PASS.
- Pending: green CI, merge, exact Render revision, then one POS retry of invoice
  `28897` using the existing empty draft/recovery path.
