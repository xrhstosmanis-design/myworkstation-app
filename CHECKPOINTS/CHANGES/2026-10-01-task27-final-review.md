# #27 — final review, same owner

Continue remaining scope under existing ownership. Preserve earlier missing-cost/calendar/returns/gross-expense PASS. First investigate custom date/month interaction without speculative code changes. Runtime282dbb63 includes source PR1618; docsPR1623 merged c02b9d9. No report source change since last LAB. Browser SA LAB read-only; before MAIN2 transactions/cash2.40/card+IRIS0/total2.40/last01Oct12:51/open27Sep20:24; LAB-POS-02 2transactions/all0/last—/open26Sep01:33. SKU/quantity/payment/physical terminal N/A. No production financial/stock writes.

## Reconciliation / bounded print change
- Actual keyboard input applies26Sep–26Sep; month button Enter expands daily rows. Earlier automation fill/click observation did not establish application FAIL. Day26Sep gross expense313/missingVAT5, grossProfit0.35 preserved, net/VAT/netprofit/ratio unknown. Day25Sep expense0.20/missing2/grossProfit3.21. No source fix needed for dates.
- Print currently calls window.print on full BackOffice; no scoped business-picture print CSS. Bounded change: escaped standalone printable view of loaded report, matching VAT visibility/month and expanded-day rows, totals, warnings and notes. Split21 columns into three readable tables; no ledger/auth/licensing changes. CI/build then exact deployed LAB required. Physical paper/PDF NOT TESTED.

Local Node20: printable escaped HTML/loaded period/unknown values/VAT visibility tests2PASS; production build PASS; diff check PASS. Await full GitHub CI and isolated report E2E before source merge.
