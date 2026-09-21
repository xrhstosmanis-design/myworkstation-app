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

## 2026-09-21 stale OCR header-total repair

- Live evidence after successful central Learning save: a fresh POS attempt at
  `11:53` remained empty and failed at `POS_BACKGROUND_AI_RECHECK`.
- Root cause: the saved Learning document retained the earlier OCR header total
  `55.25`, so exact replay was rejected before its 11 confirmed rows could be
  reconciled against the trusted POS total `53.91`.
- Exact replay now keys on supplier + invoice number and then independently
  requires every confirmed row equation and the complete learned-row gross to
  reconcile with the POS total within `0.05`. A stale OCR header cannot hide a
  fully verified table; a mismatched table still fails closed.
- Regression coverage includes the real DELTA quantities, discounts and stale
  `55.25` header with reconciled `53.91` rows.
- Targeted exact-Learning tests `6/6` and full server suite `1381/1381` PASS.

## 2026-09-21 exact-result mutation repair

- Fresh live attempt at `12:26` still failed safely with zero rows after the
  stale-header fix, proving that exact Learning resolution alone was not enough.
- Root cause: the exact, fully balanced Learning rows were subsequently sent
  through generic OCR supplier-profile recovery and complete-image verification,
  which could reinterpret the rows or remove their verification proof.
- An exact central Learning invoice is now a terminal AI-recheck result. It is
  saved as `AI_COMPLETE` without generic OCR mutation only after the resolver
  has independently validated supplier, invoice number, every confirmed row
  equation and the full gross total.
- Targeted tests `7/7`; full server suite `1382/1382` PASS.
