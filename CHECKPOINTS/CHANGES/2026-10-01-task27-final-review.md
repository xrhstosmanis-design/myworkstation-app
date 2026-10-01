# #27 — final review, same owner

Continue remaining scope under existing ownership. Preserve earlier missing-cost/calendar/returns/gross-expense PASS. First investigate custom date/month interaction without speculative code changes. Runtime282dbb63 includes source PR1618; docsPR1623 merged c02b9d9. No report source change since last LAB. Browser SA LAB read-only; before MAIN2 transactions/cash2.40/card+IRIS0/total2.40/last01Oct12:51/open27Sep20:24; LAB-POS-02 2transactions/all0/last—/open26Sep01:33. SKU/quantity/payment/physical terminal N/A. No production financial/stock writes.

## Reconciliation / bounded print change
- Actual keyboard input applies26Sep–26Sep; month button Enter expands daily rows. Earlier automation fill/click observation did not establish application FAIL. Day26Sep gross expense313/missingVAT5, grossProfit0.35 preserved, net/VAT/netprofit/ratio unknown. Day25Sep expense0.20/missing2/grossProfit3.21. No source fix needed for dates.
- Print currently calls window.print on full BackOffice; no scoped business-picture print CSS. Bounded change: escaped standalone printable view of loaded report, matching VAT visibility/month and expanded-day rows, totals, warnings and notes. Split21 columns into three readable tables; no ledger/auth/licensing changes. CI/build then exact deployed LAB required. Physical paper/PDF NOT TESTED.

Local Node20: printable escaped HTML/loaded period/unknown values/VAT visibility tests2PASS; production build PASS; diff check PASS. Await full GitHub CI and isolated report E2E before source merge.

After daily check, fresh reload hit blank UI: browser log18:49:07Z dynamically imported entry-BW5DGFLj.js failed to fetch during parallel deployment. No financial action occurred. Final fresh two-POS after values pending successful reload on deployed source.

One reload recovered on parallel runtime1f4d124. Fresh final baseline unchanged: MAIN2/cash2.40/cards+IRIS0/total2.40/last01Oct12:51; LAB-POS-02 2/all0/last—; open times unchanged. Daily keyboard/expansion and VAT guard now LIMITED LAB PASS. Source print remains AWAITING CI/deploy/LAB.

PR1624 / CI4081 SUCCESS at e6a927821e73b1669a2db2e48e7866a9eaf117f7. Source merge9e2c351c3729e0d208f21ff0e3fafc0137f7d8ec; mainCI4082/exactdeploy/printLAB pending. Preserved parallel Workforce401 fix and checkpoint.

Remaining full-module evidence: no documented positive-VAT OTHER_EXPENSE in tested live period (all7 unknown); no independent approved historical purchase/return pair verified live; only SA session available; no physical printer in cloud browser. Do not certify full accounting result from these read-only checks. Partial payment VAT currently explicitly unknown by design; future allocation requires a defined documented cash/allocation policy rather than inferred tax deductibility. Same owner retained; next acceptance input is an existing eligible approved linked expense and independent Owner session, without creating another payment merely for evidence.

MainCI4082 SUCCESS; browser health exact9e2c351 before print LAB. Fresh print baseline to be refreshed before opening report.

Render1881 SUCCESS. Fresh print baseline before action at exact9e2c351: MAIN2/cash2.40/card+IRIS0/total2.40/last01Oct12:51/open27Sep20:24; LAB-POS-02 2/all0/last—/open26Sep01:33. Browser SA LAB only, SKU/quantity/payment N/A; read-only report → standalone print preview.

## Actual printable LAB PASS, exact9e2c351
- CI4081/4082 and Render1881 SUCCESS. Default01Aug–01Oct standalone three-table preview: sales54.60, purchases1863.76/net1622.06, grossexpense313.20, payments5227.90, missingcost8/75, missingVAT7/7, returns5/cancels2; unknown net/VAT/profits remain —; all20 metrics and period label match UI.
- Changed both date criteria with native keyboard to26Sep without Search; printable preview still01Aug–01Oct (loaded data). After Search and month expansion, daily/month/total26Sep sales0.50, grossProfit0.35, expensegross313, missingVAT5, net/VAT/netprofit/ratio —. Correct day in allthree grouped tables. No data write.
- Final fresh reload: MAIN2/cash2.40/card+IRIS0/total2.40 andLAB-POS-02 2/all0 unchanged. Displayed open/last times are now3h earlier (MAIN27Sep17:24/last01Oct09:51; POS0225Sep22:33). StoreTransactionsPanel when uses browser-default timezone, unlike explicit Athens report dates. Raw DB timestamps independently NOT TESTED; monetary/count control PASS only, do not claim displayed times identical. Record separate timezone presentation follow-up.
- Physical printer/native PDF output and popup-blocked branch NOT TESTED. Independent Owner/live positive documented VAT/historical cost/partial allocation/fullmodule OPEN; same owner retained. Next acceptance input: existing approved linked positive expense and independent Owner session.
