# MANTZILAS legacy cached-line reread — 2026-09-17

## LAB evidence

- POS-front invoice `12665` reached `AWAITING_APPROVAL / POS_BACKGROUND_COMPLETE` with 18 rows and totals `365.75 / 429.26 EUR`.
- The completed draft still contained the legacy ambiguous row `00009 = 48 pieces / 65.5%` instead of the printed `24 pieces / 31%`.
- Code `433` also remained at 6 stock pieces instead of the previously confirmed `2 × 6PK = 12`.
- The durable handoff had reused an older total-reconciling cached table, so the current-image corrective reread and the new scaled-ambiguity repair were bypassed.

## Bounded correction

- Detect the exact legacy MANTZILAS ambiguity from same-document rows `00160` and `00009`, plus the stale six-pack signature.
- On BackOffice refresh, reclaim only that completed draft and reread its archived source with `resumeStoredProductLines=false` and `replaceExistingDraft=true`.
- Preserve a successful `SIBLING_PRICE_DISCOUNT_SCALE_VERIFIED` correction instead of running the older raw-row economics parser over it again.
- The reread is guarded by a versioned one-attempt strategy marker and keeps the same payment, job and draft identities.

## Safety and LAB acceptance

- No new upload or payment; no credit, stock, approval, finalization, fiscal or accounting mutation.
- PASS requires 18 rows, taxable `365.75 EUR`, gross within `0.05 EUR` of `429.27 EUR`, `00009 = 24 pieces / 31%`, `13192 = 12` stock pieces, `433 = 12` stock pieces and `02410 = 24` stock pieces.
- Status: **LAB FAIL / AWAITING tests, CI, exact deploy and one BackOffice refresh of the existing draft**.

## LAB result after PR #925

- **LAB FAIL:** after the deployed `V9` recovery and BackOffice refresh, persisted order line `00009` was still visible as `48 pieces / 65.5%`.
- The recovery scan considered the oldest 50 jobs first, so a recent completed draft could be omitted from the bounded scan.
- The ambiguity predicate inspected only `AiReaderJob.resultJson.productLines`; it could miss the wrong values already persisted in `PurchaseOrderLine` when the legacy cache lacked the sibling/evidence fields.

## Bounded follow-up

- Prioritize recent `AWAITING_APPROVAL` jobs inside the existing 50-job bound.
- Verify the exact MANTZILAS `00009 = 48 / 65.5%` signature against the linked draft and sibling `00160` when cached evidence is incomplete.
- Advance the one-attempt strategy to `V10`; reuse the same archived image, payment, job and draft.
- Focused tests `79/79`, full server suite `1290/1290`, client build and server build PASS locally.
- Status: **LAB FAIL / AWAITING green CI, exact deploy and one BackOffice refresh of the same draft**.
