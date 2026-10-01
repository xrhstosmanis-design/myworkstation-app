# #27 — ημερολογιακές περίοδοι ώρας Ελλάδας

Συνέχεια ίδιας υπεύθυνης σελίδας, branch `codex/task27-athens-periods-20261001`, βάση f88174b. Προηγούμενο missing-cost LAB PASS προστατεύεται σύμφωνα με checkpoint task27-profitability και manualprofitability. Η πραγματική οθόνη της01/10 έδειχνε αρχή31/07 αντί01/08: localmidnight→UTC→slice μετακινεί την ημερομηνία. Ο server ομαδοποιεί UTCtimestamp χωρίς μετατροπή Ελλάδας.

Scope: ημερολογιακά from/to με έγκυρες ημέρες, ελληνικά midnight όρια με DST, ελληνική ημέρα/μήνας για πωλήσεις/αγορές/έξοδα. Παλιό ISO from/to διατηρείται. Προστατεύονται counts/unknownprofits, auth/company/store/CASH_CONTROL και locked PROFITABILITY. Καμία production DB mutation ή νέα πώληση/πληρωμή/stock. Περίοδοι UI και απομονωμένο boundary SQL/HTTP test, έπειτα exact deploy/read-only LAB. Υπόλοιπα επιστροφών/ΦΠΑ εξόδων/ιστορικού κόστους/Owner παραμένουν ανατεθειμένα στο#27.

## Τοπικοί έλεγχοι

Node20:13targetedPASS,1773serverPASS/0FAIL/1optionalPostgreSQLSKIP, frontendbuildPASS. Χειμώνας/καλοκαίρι,23/25ωρα DST, leapday/invalidday/partial/inverted, current/default/previousquarter/yearrollover επαληθεύθηκαν. ΝέοactualisolatedHTTP/SQL test AWAITINGCI: Greekday01Oct2030, πωλήσεις πριν/start/last/end, αγορά και έξοδο στοUTC21της30Sep ομαδοποιούνται01Oct. Sales5/purchases7/expenses11, snapshotsledgerίδια. ΚαθαρισμόςfixturesfinallyμόνοCI. Sale/PurchaseDocument είναιUTC TIMESTAMP, StoreTransactionTIMESTAMPTZ: διαφορετικέςσωστέςμετατροπές. ΤοπαλιόISOAPI συνεχίζειμείδιαinstantbounds.

## CI και merge

PR #1606, head451f0014, CI4033PASS μαζί μεactualSQL/HTTPcalendarperiods17:14:31.935Z. Merge `16b1f76f1c6f0e6da1b7e25022127f1809960da7`. Boundarysales5/purchases7/expenses11 στοGreek01Oct2030, noledgermutation. ΠαλιόISOκαιmissingcostE2E επίσηςPASS. MainCI/exactdeploy/LAB AWAITING· όχιLABPASS.

## Πρόσθετο όριο ακρίβειας — AWAITING CI/LAB

Η StoreTransaction TIMESTAMPTZ διατηρεί μικροδευτερόλεπτα. Calendar query πλέον χρησιμοποιεί αποκλειστικό επόμενο midnight αντί inclusive23:59:59.999. Το παλιό ISO endpoint παραμένει inclusive. Απομονωμένο E2E περιλαμβάνει έξοδο στο23:59:59.9995 και αναμένει expenses12. Δεν έγιναν production writes.

Local verification: Node20 npm test from server cwd1777PASS/0FAIL/1optionalPGSKIP;13targetedPASS;productionbuildPASS. Initial root-cwd direct glob invoked tests from incorrect cwd and failed ENOENT; correct npm workspace invocation passed. Extra100 expense exactly at next midnight must be excluded. Required CI actual isolated SQL/HTTP remains pending.

PR1609 CI4041PASS (isolatedSQL/HTTP17:27:44.198Z, sales5/purchases7/expenses12; nextmidnight100excluded). Merged4c5cc8dc8143d0779995ed8a188c96d3b0a5199f. MainCI/exactdeploy/read-onlyLAB pending.

## LAB baseline πριν τις αναγνώσεις

2026-10-01T17:33:26.946580+00:00 exacthealth4c5cc8dc8143d0779995ed8a188c96d3b0a5199f, mainCI4042PASS/Render1867PASS. Freshreload SuperAdmin MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ. MAIN active operator LAB POS2 opened27Sep20:24:2tx/cash2.40/card+IRIS0/total2.40,last01Oct12:51. Control LAB-POS-02 opened26Sep01:33:2tx/cash0/card+IRIS0/total0,last—. Read-only calendar report/presets/CSV only; SKU/qty/payment/physicalPOS N/A; no prod DB writes, live SQLcount/stocklatest NOT TESTED.

## LIMITED READ-ONLY LAB PASS — 01/10/2026

Exact runtime4c5cc8dc8143d0779995ed8a188c96d3b0a5199f (health verified), PR1606/1609, CI4033/4035 and4041/4042 PASS; Render1867PASS. Cloud Chrome, SuperAdmin scoped to MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ. Default01Aug–01Oct now correct, loaded label identical; monthlySep/Oct sales54.60,missing8/75 and NULLprofits preserved. PreviousQuarter criteria01Jul–30Sep: previous loaded label stays until Search; Search returnsSep52.20,4/71 and unknownprofits. CurrentMonth criteria01Oct–01Oct withoutSearch keeps loaded quarter label; oneCSV download generated exactfilenameeikona-epixeiriseis-2026-07-01-2026-09-30.csv,657bytes, oneSep row52.2,4/71,blankMargin/gross/netprofits. Download event waited3s and timedout, but actual unique file existed and was parsed successfully; no repeatclick. Searchcurrentmonth returnsOct2.40,4/4, daily01Oct2transactions/0purchases and blankprofits. This verifies UI periods/loaded-dateCSV, not independent accounting reconciliation. DST/microsecond boundaries and ISO compatibility are isolatedCI-only.

Fresh final reload: MAIN2tx/cash2.40/card+IRIS0/total2.40,last01Oct12:51; LAB-POS-02 2tx/cash0/card+IRIS0/total0,last—; operator/shift openings unchanged. Both controls identical to recordedbefore. No financial/stock/fiscal/action writes. Production DBcounts/stocklast/hash, physicalPOS, liveOwner withoutSA, adversarial live roles, native printing, returns/expenseVAT/historicalcost NOT TESTED. PROFITABILITY commercialgate remains locked; existing CASH_CONTROL report only.

Evidence: output/evidence/task27/calendar-periods-lab.jpg and calendar-quarter-lab.csv. Calendar pending closed only; full#27 remainsASSIGNED to this page. Single next action: inspect existing return/expenseVAT sources read-only and determine report semantics before any bounded correction; no new transaction for evidence. Other #25/#26 remaining ownership retained, remote scope untouched.

Final baseline timestamp 2026-10-01T17:36:10.720578+00:00
