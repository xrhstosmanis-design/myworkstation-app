# POS invoice — central two-line review rule — 2026-09-23

## Standing owner decision and fresh evidence

- The owner's 2026-09-19 rule allows up to two identified uncertain or incorrect lines per invoice, visibly **ΠΡΟΣ ΕΛΕΓΧΟ**, corrected before approval. This includes a 20-product invoice; it is not a demand for perfect OCR before creating a draft.
- **LAB FAIL:** LAB POS 2 Leventopoulos invoice shown as `ΤΑΜΠΧ14 15` remains `POS_FAILED` with zero products after the global exact-total gate. A zero-line read exceeds the review allowance; the image alone does not prove which source rows or values are missing. Do not delete or resubmit the invoice.
- The older Leventopoulos `ΤΔΛΠΧ14 15` checkpoint expects nine physical rows and `194,77 €`, but the screenshot's identifier differs. Do not assume these are the same invoice without checking the original document/job.

## Bounded correction

- Record the standing review rule in the root `AGENTS.md` and active list, so other pages and future work preserve it.
- A centrally learned complete-table profile may preserve a reviewable POS draft despite a header mismatch only when the candidate contains actual product rows, all other rows retain independent printed arithmetic proof, and at most two present rows are explicitly unverified. The unverified markers persist to BackOffice review.
- Zero-line reads, three uncertain rows and corrupted verified arithmetic remain blocked. No amount is invented to force reconciliation.

## Safety and acceptance

- Reuse the same draft/settlement identity. No duplicate upload, payment, approval, stock, fiscal, accounting or myDATA operation.
- The Leventopoulos screenshot is still **LAB FAIL**; this policy change cannot reconstruct the missing physical rows without a verified read of the stored image.
- Require targeted/full tests, green CI, merge and exact deployed revision. LAB PASS requires one genuinely new POS submission, a single automatic draft containing every physical product row with at most two marked **ΠΡΟΣ ΕΛΕΓΧΟ** and no unresolved product. Operator correction precedes approval.
