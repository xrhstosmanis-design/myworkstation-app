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
