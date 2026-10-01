# #27 — Κερδοφορία / κάλυψη κόστους

ASSIGNED `codex/task27-profitability-20261001`, βάση9e695c9. Προστατεύονται auth/company/store/moduleCASH_CONTROL, G07/POS/πληρωμές/stock/fiscal και ξεχωριστό PROFITABILITY commercialReady=false. Δεν ανοίγει εμπορικά νέοmodule. Υπάρχον endpointbusiness-picture καιOwnerBusinessPicture, καμία νέα πηγή ή οικονομική εγγραφή.

## Πριν

01/10/2026 περίπου19:40Ελλάδας, SuperAdmin/cloudChrome, MYWORKSTATION LAB/ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ cmtpopbgo000trhb5ng9ytiru. Φρέσκο BackOffice MAIN2κινήσεις/cash2.40/card0/IRIS0/total2.40, LAB-POS-02 2κινήσεις/all0. Ανοίχθηκε μόνοΕικόνα Επιχειρήσεις: περίοδος31Jul–01Oct, Οκτώβριοςgross2.40/net2.12/margin100%, Σεπτέμβριοςgross52.20/net46.19/κέρδος32.20/έξοδα313.20. Συνολικέςπωλήσεις54.60, net48.32, εμφανιζόμενοκέρδος34.32. Τα ποσά και κάλυψηκόστους NOT VERIFIED, όχι κερδοφορίαPASS. Ο κώδικας COALESCE(knownpurchase,Product.costPrice,0) δεν διακρίνει missingκόστος από καταγεγραμμένομηδενικό. Πρώτηπαρατήρηση ημερομηνίας31Jul αντί01Aug ξεχωριστόOPEN, δεν συνδυάζεταιμεαυτήτηδιόρθωση.

## Bounded αλλαγή

Μέτρηση missingCostLines καιsalesLines στην ίδιαread-onlyquery. ExplicitαγοράunitCost0 θεωρείταιγνωστή· defaultProductcost0 χωρίςαγορά θεωρείταιmissing. Όταν υπάρχει έστωμίαmissingγραμμή, margin/grossProfit/netProfit=null ανάημέρα/μήνα/σύνολο, UIκαιCSVκενόμεορατήαιτιολογία. Υφιστάμεναsales/purchases/expenses καιsourcecost calculation παραμένουν. Καμία υποβολή πληρωμής/πώλησης/αξιολόγησης. quantity0/paymentN/A/physicalterminalN/A. SKUstock/latestmovementNOTTESTED. ΑποδοχήμεπράσινοCI/exactdeploy/readonlyLAB καιίδια2POS. Επιστροφές/VATεξόδων/ημερομηνίες/πλήρεςOwner/moduleOPEN.

## Τοπικοί έλεγχοι

8targetedPASS, Node20/full1768PASS0FAIL1SKIP(optionalPostgreSQLχωρίςDATABASE_URL), frontend/serverbuildPASS. IsolatedCIactualHTTP/SQLσενάριο AWAITING: existingnewE2Eproduct/sale knowncost2 → defaultcatalog0 unknownprofitNULL → εγκεκριμένηfreepurchase0 γνωστό100%, noauth401/operator403/foreignstore404/invaliddate400, beforeafterSale/StoreTransaction/StockMovement/stockίδια. FixtureμόνοCIκαικαθαρίζεταιfinally. Δεν έγινεproductionDBwrite. CSVδιατηρείNULLκενόκαιπεριλαμβάνειcounts.
