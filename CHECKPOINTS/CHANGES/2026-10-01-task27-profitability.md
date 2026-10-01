# #27 — Κερδοφορία / κάλυψη κόστους

ASSIGNED `codex/task27-profitability-20261001`, βάση9e695c9. Προστατεύονται auth/company/store/moduleCASH_CONTROL, G07/POS/πληρωμές/stock/fiscal και ξεχωριστό PROFITABILITY commercialReady=false. Δεν ανοίγει εμπορικά νέοmodule. Υπάρχον endpointbusiness-picture καιOwnerBusinessPicture, καμία νέα πηγή ή οικονομική εγγραφή.

## Πριν

01/10/2026 περίπου19:40Ελλάδας, SuperAdmin/cloudChrome, MYWORKSTATION LAB/ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ cmtpopbgo000trhb5ng9ytiru. Φρέσκο BackOffice MAIN2κινήσεις/cash2.40/card0/IRIS0/total2.40, LAB-POS-02 2κινήσεις/all0. Ανοίχθηκε μόνοΕικόνα Επιχειρήσεις: περίοδος31Jul–01Oct, Οκτώβριοςgross2.40/net2.12/margin100%, Σεπτέμβριοςgross52.20/net46.19/κέρδος32.20/έξοδα313.20. Συνολικέςπωλήσεις54.60, net48.32, εμφανιζόμενοκέρδος34.32. Τα ποσά και κάλυψηκόστους NOT VERIFIED, όχι κερδοφορίαPASS. Ο κώδικας COALESCE(knownpurchase,Product.costPrice,0) δεν διακρίνει missingκόστος από καταγεγραμμένομηδενικό. Πρώτηπαρατήρηση ημερομηνίας31Jul αντί01Aug ξεχωριστόOPEN, δεν συνδυάζεταιμεαυτήτηδιόρθωση.

## Bounded αλλαγή

Μέτρηση missingCostLines καιsalesLines στην ίδιαread-onlyquery. ExplicitαγοράunitCost0 θεωρείταιγνωστή· defaultProductcost0 χωρίςαγορά θεωρείταιmissing. Όταν υπάρχει έστωμίαmissingγραμμή, margin/grossProfit/netProfit=null ανάημέρα/μήνα/σύνολο, UIκαιCSVκενόμεορατήαιτιολογία. Υφιστάμεναsales/purchases/expenses καιsourcecost calculation παραμένουν. Καμία υποβολή πληρωμής/πώλησης/αξιολόγησης. quantity0/paymentN/A/physicalterminalN/A. SKUstock/latestmovementNOTTESTED. ΑποδοχήμεπράσινοCI/exactdeploy/readonlyLAB καιίδια2POS. Επιστροφές/VATεξόδων/ημερομηνίες/πλήρεςOwner/moduleOPEN.

## Τοπικοί έλεγχοι

8targetedPASS, Node20/full1768PASS0FAIL1SKIP(optionalPostgreSQLχωρίςDATABASE_URL), frontend/serverbuildPASS. IsolatedCIactualHTTP/SQLσενάριο AWAITING: existingnewE2Eproduct/sale knowncost2 → defaultcatalog0 unknownprofitNULL → εγκεκριμένηfreepurchase0 γνωστό100%, noauth401/operator403/foreignstore404/invaliddate400, beforeafterSale/StoreTransaction/StockMovement/stockίδια. FixtureμόνοCIκαικαθαρίζεταιfinally. Δεν έγινεproductionDBwrite. CSVδιατηρείNULLκενόκαιπεριλαμβάνειcounts.

## CI και merge

PR1604 head72ce866065e01a3f724e0e2ec44c2c5892ffecd4, CI4029PASS. ΠραγματικόisolatedSQL/HTTP κόστος2/unknownprofitNULL/freepurchase100%16:46:38.442Z PASS, auth401/operator403/foreignstore404/invaliddate400 καιμημεταβολήledger. Merge75f663e0f85dc0cd4079a5cf1ec4a493eb5e6188. MainCI/exactdeploy/LAB AWAITING, δενδηλώνεταιLABPASS. Κρατήθηκαν οι παράλληλες αλλαγέςWorkforceMobileCard του#1598.

## BEFORE νέας read-only LAB αποδοχής

2026-10-01T16:53:29.769852+00:00 UTC: mainCI4030/Render1862PASS, runtimehealth exact75f663e0f85dc0cd4079a5cf1ec4a493eb5e6188 επιβεβαιώθηκε. FreshreloadίδιοLAB/SuperAdmin/cloudChrome. MAIN2/cash2.40/card0/IRIS0/total2.40, LAB-POS-02 2/all0. Επόμενημόνοάνοιγμαreport/drilldown/downloadCSV, quantity0/paymentN/A, noSKU/stock/latestNOTTESTED, όχιbusinesswrite.

## LIMITED READ-ONLY LAB PASS

2026-10-01T16:57:14.855759+00:00 UTC καταγραφή μετάactualUI στοexact75f663e. Περίοδος31Jul–01Oct: missingcost8/75, October4/4, September4/71. Monthκαιtotalmargin/grossProfit/netProfit «—», drilldown01Oct2συναλλαγές/4γραμμές/4missing ίδια. Gross54.60/net48.32, purchasesgross1863.76/net1622.06, expenses313.20/payment5227.90 ίδια εμφανιζόμενα ποσά, δενείναιανεξάρτητηλογιστικήεπαλήθευση. Πραγματικόdownload763bytesCSV2μήνες: missing4/4και4/71, margin/grossProfit/netProfitκενά. Eventwaittimeout αλλάπραγματικόαρχείοδημιουργήθηκεκαιδιαβάστηκε/επικυρώθηκε απόsharedpath, άραfilePASS. Evidence `output/evidence/task27/business-picture-lab.csv`, `output/evidence/task27/cost-coverage-lab.jpg`. Μετάfreshreload MAIN2/cash2.40/card0/IRIS0/total2.40, LAB-POS-02 2/all0 ίδια. Καμίαfinancial/stockbusinesswrite, physicalPOS/stock/latest/hash/SQLledgercount NOTTESTED στοlive. Θετικόcompletecostκαιdocumentedfreepurchase μόνοisolatedCI, όχιLAB.

## Remaining / single next action

Ίδιοςυπεύθυνοςretained. Επόμενοboundedσκέλος: ημερολογιακέςπερίοδοι καιgroupingEurope/Athens (τοdefault01Augβγήκε31Jul), μεπροστασία αυτού τουcostguardPASS. ΧωριστάακόμηOPEN: reversal-awareκόστος/έσοδα, netexpenses/VAT, ιστορικόαξιόπιστοκόστος, liveOwnerχωρίςSA/ρόλοι/company/store/licensing, complete-costlive/CSVκαιprint. ΔενενεργοποιήθηκεPROFITABILITY commercialReadyfalse, δενδηλώνεταισυνολικόmodulePASS. #25/#26υπόλοιπαπαραμένουνίδιεςαναθέσεις.
