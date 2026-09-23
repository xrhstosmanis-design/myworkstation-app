# Leventopoulos POS visible draft after total gate — 2026-09-23

## Evidence: LAB FAIL

After PR #1113 deployed at `35ab1b50`, a new LAB POS 2 submission `ΤΑΠΠΧ14 15` still showed `POS_FAILED / POS_BACKGROUND_FAILED` and zero persisted rows in BackOffice. The precise supplier total error originates after the background reader produces a nonempty candidate and before it stores product lines. We have no direct view of that candidate's physical row count or correctness; zero stored rows cannot establish zero recognized rows. Earlier deleted jobs must not be resurrected.

## Bounded correction

Remove the extra supplier-specific blanket header-total rejection from the background draft creation. Preserve the existing corrupt verified-row rejection, empty-candidate rejection, safe reread rule, and exact learned TALOS validation. Save actual OCR candidate rows with their original amounts in the unapproved POS draft. The already mounted purchase-order total guard intercepts `FINAL` before posting and requires reconciliation within €0.05 or explicit authorized owner/manager override; unresolved products remain blocked. No approval, stock, fiscal, payment or myDATA operation is made in this diagnostic flow.

## Acceptance

Local verification: targeted 13/13, full server 1428 passed / 1 skipped / 0 failed, `git diff --check` passed. CI, exact deploy, and real POS LAB remain outstanding.

Targeted tests, full server suite, green CI, merge and verification of the exact deployed revision are required before LAB. One genuinely new front-of-POS submission must create one BackOffice draft automatically with every printed physical row, at most two identified uncertain/incorrect rows marked ΠΡΟΣ ΕΛΕΓΧΟ with reasons, no unresolved products and a clearly visible financial difference until operator correction. A populated draft alone is not LAB PASS. No second upload or refresh can substitute for the initial creation test.
