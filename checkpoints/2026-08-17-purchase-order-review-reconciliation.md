# Checkpoint — Purchase Order OCR Review Reconciliation — 2026-08-17

## Locked PASS behavior
- POS supplier invoice uses structured V2.4.4 productLines only.
- No raw OCR/IBAN/header lines become products.
- Stock is posted only at finalization.
- Box/package quantities remain economic invoice quantities; stock posting converts to pieces with the locked pack rules.
- Invoice total mismatch tolerance is 0.05 EUR.
- Above tolerance normal finalization is blocked; Owner/Manager/Admin override requires a reason and is audited.

## Fix in this checkpoint
Real BackOffice test showed six valid purchase rows while the OCR review panel displayed `Δεν αναγνωρίστηκε ακόμη πραγματική γραμμή προϊόντος`.

Root cause: the review client required `ocrLineType === PRODUCT`, while the OCR-lines API did not return `ocrLineType`.

Fix:
- OCR-lines API now classifies a row with description + positive quantity + positive unit cost/gross value as `PRODUCT` and exposes `ocrSequence`.
- Added a BackOffice reconciliation companion that reads the authoritative PurchaseDocument gross total through supplier detail, sums real OCR purchase-row gross amounts, and displays Invoice Total / Lines Total / Difference / tolerance 0.05 EUR.
- The companion repairs the stale empty-state message when economic product rows exist.
- Existing parser, V2.4.4 data, stock conversion, override and finalization rules are unchanged.

## Test after deploy
Open the same order/invoice `01ANOS9911` in BackOffice → Παραγγελίες & Αγορές.
Expected:
1. The OCR review must not say there are no product rows when the six economic rows exist.
2. It must show the real row count/status.
3. A reconciliation panel must show invoice total, lines total, absolute difference, and tolerance 0.05 EUR.
4. If difference > 0.05 EUR it must show `ΧΡΕΙΑΖΕΤΑΙ ΕΛΕΓΧΟ`; if within tolerance it must show `ΣΥΜΦΩΝΕΙ`.
5. Do not change V2.4.4 parsing, pack conversion or stock posting during this test.
