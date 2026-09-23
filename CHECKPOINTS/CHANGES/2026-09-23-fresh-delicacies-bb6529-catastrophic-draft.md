# Fresh Delicacies ΒΒ 6529 — LAB FAIL and bounded containment

## Real LAB evidence

- New normal LAB POS 2 submission, invoice ΒΒ 6529, printed 14 physical lines and gross 47,02 €. The automatic BackOffice draft contains 16 lines, net 15.437,10 € and gross 17.443,47 €.
- Visible corrupt examples include quantity 5001 and unit cost 401 € on printed 5,00 × 1,40 €, quantity 5001 on another row, and unit cost 1201 € on a printed 1,20 € row. Duplicate product rows are present.
- The subsequent full image reread reported `POS_BACKGROUND_AI_RECHECK` failure because it could not safely improve the draft; the existing 16 lines were preserved. **LAB FAIL**. No approval, stock posting or second submission is authorized as part of diagnosis.

## Bounded containment

- In the existing POS background path, a supplier profile requiring a complete printed table may not persist a *nonverified* table whose gross exceeds both 3× the operator-confirmed invoice total and that total by 500 €. This would have prevented the ΒΒ 6529 inflation from becoming a purchase draft.
- Full tables verified against the operator-confirmed total and ordinary bounded review differences remain eligible. Internal row arithmetic alone cannot excuse a catastrophic header difference, even when at most two rows are marked uncertain. Other supplier profiles retain their existing flow. The existing ΒΒ 6529 draft remains untouched.
- This gate cannot fix OCR punctuation, duplicated rows or create a correct draft; it is a containment step, **not LAB PASS**. The original image and provider candidate need line-level forensic replay before a reading change.

## Verification and next acceptance

- Targeted test uses the actual printed total and visible corrupted gross values, and checks the verified, reviewable and other-supplier boundaries. CI, exact deploy and a new front-of-POS invoice are pending.
- LAB PASS requires one genuinely new invoice submission to create one automatic draft with all physical rows, no duplicates and at most two individually marked uncertain lines. The printed row arithmetic, tax and total must reconcile before approval. No reupload of ΒΒ 6529 and no approval, payment or stock action for diagnostic testing.

## 2026-09-23 follow-up: deployed and forensic evidence

- PR #1125 passed CI #2873 and merged as `160073630755794e2486ae4eb6f4c2be697cd1b6`. A refreshed production `/api/health` displayed that exact revision. The containment is deployed; the existing draft is still LAB FAIL.
- The original 900×1600 receipt image is available. Its 14 printed rows have quantities and unit prices: `G09.00938` 5×1.40=7.00; `G09.00944` 1×1.90=1.90; `C08.00807` 2×1.20=2.40; `G09.00916` 4×1.20=4.80; `G09.00920` 2×1.20=2.40; `G09.00927` 3×1.20=3.60; `G09.00937` 1×1.20=1.20; `G09.00945` 1×1.30=1.30; `G09.00946` 2×1.30=2.60; `G09.00910` 3×1.20=3.60; `G09.00935` 1×1.20=1.20; `G09.00919` 2×1.20=2.40; `G09.00922` 1×1.20=1.20; `G09.00901` 5×1.20=6.00. Net 41.60; printed VAT 5.42; gross 47.02. These are diagnostic ground truth, never a supplier learning template to inject into a new invoice.
- Local independent OCR of that photo produced such tokens as `5,001 1,401 0,001 7,001 13,00`: the vertical separator after a two-decimal value can resemble an extra `1`. Reproducing the bad *structured* row in `finalizeV244ProductLines` (`quantity=5001`, `unitCost=401`, `netAmount=7001`, `grossAmount=7911.13`) retained the inflated values and inferred a nonexistent 99.65% discount. This establishes the downstream amplification risk; it does **not** establish which provider or parsing step generated the original structured fields in production.
- An attempt to inspect another live administrative browser tab was rejected by automatic approval review because the broad dashboard could expose unrelated customer and employee data beyond this invoice investigation. No further browser inspection of those tabs was attempted. The exact ΒΒ 6529 job's provider raw row text / structured output is still missing. Do not alter the shared OCR parser or add invoice-specific historical economics on speculation. Next bounded change requires only that job's original extraction and full reread diagnostics, scoped to the LAB invoice, then a replay test across suppliers. LAB PASS still requires a genuinely new invoice.
