# #27 — shift time display follow-up

Same page; print/daily PASS source9e2c351/docsPR1627 protected. Observed fresh UI display3h difference with same money/counts. StoreTransactionsPanel when uses toLocaleString without timeZone; browser timezone dependence is confirmed code cause. Bounded display-only fix: explicit Europe/Athens and visible time-zone label. No timestamp write, sale, invoice, shift closing, auth, licensing or report calculation changes.

Baseline MAIN2/cash2.40/card+IRIS0/total2.40/UTC-like open27Sep17:24/last01Oct09:51; LAB-POS-02 2/all0/open25Sep22:33/last—. Expected Athens presentation MAIN27Sep20:24/last01Oct12:51 andPOS0226Sep01:33. Raw DB timestamps independently NOT TESTED; SKU/quantity/payment/physical POS N/A. CI/build/exactdeploy/read-only LAB required before PASS.

Node20 Work-safe frontend build PASS; diff check PASS. Existing till/report controls preserved; simple timezone presentation change requires CI and real read-only UI acceptance, no new ledger test fixture.
