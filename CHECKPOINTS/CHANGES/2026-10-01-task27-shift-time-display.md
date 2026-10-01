# #27 — shift time display follow-up

Same page; print/daily PASS source9e2c351/docsPR1627 protected. Observed fresh UI display3h difference with same money/counts. StoreTransactionsPanel when uses toLocaleString without timeZone; browser timezone dependence is confirmed code cause. Bounded display-only fix: explicit Europe/Athens and visible time-zone label. No timestamp write, sale, invoice, shift closing, auth, licensing or report calculation changes.

Baseline MAIN2/cash2.40/card+IRIS0/total2.40/UTC-like open27Sep17:24/last01Oct09:51; LAB-POS-02 2/all0/open25Sep22:33/last—. Expected Athens presentation MAIN27Sep20:24/last01Oct12:51 andPOS0226Sep01:33. Raw DB timestamps independently NOT TESTED; SKU/quantity/payment/physical POS N/A. CI/build/exactdeploy/read-only LAB required before PASS.

Node20 Work-safe frontend build PASS; diff check PASS. Existing till/report controls preserved; simple timezone presentation change requires CI and real read-only UI acceptance, no new ledger test fixture.

PR1628 CI4089 SUCCESS; source merged de57d7773dfe266414d40c5ff028bd654bf752ff. MainCI4090 SUCCESS; Render1885 in progress.

Read-only print artifact validation: actual standalone LAB HTML from source9e2c351 rendered with WeasyPrint70 into output/evidence/task27/printable-business-picture-lab.pdf (3 A4 landscape pages,20441bytes). Allthree pages rendered/visually checked and text extracted; period,20 metrics, unknown values and notes preserved. This is a derived PDF artifact, not a test of Chrome native Save-as-PDF or physical printer. No financial writes.

## Actual read-only LAB PASS / exactde57d777
- MainCI4090 and Render1885 SUCCESS; browser health exactde57d7773dfe266414d40c5ff028bd654bf752ff.
- Fresh UI MAIN opens27Sep20:24, last01Oct12:51; POS02 opens26Sep01:33, last—, explicit ώραΕλλάδας label. Matches expected Athens presentation instead of browser-dependent17:24/09:51/25Sep22:33. Second fresh reload keeps same correct displayed values.
- Monetary/count control: MAIN2/cash2.40/card+IRIS0/total2.40 andPOS02 2/all0 unchanged. No ledger or timestamp writes. Raw DB timestamp equality NOT TESTED; displayed opening/last times only PASS. Movement-detail rows, other stores, Owner withoutSA, winter live display NOT TESTED.
- Evidence athens-shift-times-lab.jpg; derived printPDF three pages checked separately, native Chrome PDF/physical printer NOT TESTED.

## Final retained ownership / remaining acceptance inputs
Same page retains #27. Completed missing-cost, Greek calendar, returns/cancels counters, gross/unknown expenseVAT, loaded-period printable preview, native-keyboard daily date review and shift Athens display are protected bounded PASS. Fullmodule remains OPEN for independent Owner session, eligible approved documented positive expenseVAT/credit and historical purchase/return evidence in live LAB, future partial-payment allocation policy, physical print/nativePDF and paid-module full acceptance. No missing data is inferred from CI and no new financial transaction should be repeated merely for evidence. Next action: independent Owner login and identification of an existing eligible approved expense/document pair for read-only verification. Current source de57d777; allfive closure documents updated together.
