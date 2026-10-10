# Νο33 — Νέα πώληση και επιστροφή στο εικονικό LAB, 10/10/2026

Owner `codex/operator-checkbox-audit-20261009`; ίδιο ανατεθειμένο scope No33/tracker35, συνολικά OPEN. Η νέα ρητή έγκριση του ιδιοκτήτη 17:17 Athens καλύπτει εικονικές πωλήσεις, επιστροφές, πληρωμές και αναγκαίες δοκιμές No33 στο LAB. Δεν καλύπτει replay παλιών πληρωμών ή ανάληψη No39/τιμολογίων/scanner/άλλων owners.

Πρώτο bounded fixture: μία νέα πώληση SKU2270/ΝΕΡΟ1,5LT, 1 τεμ., CASH 1€ και επιστροφή μόνο αυτής της νέας πώλησης. Κανονικός LAB POS2 EMPLOYEE, όχι Manager. Αρχικά23 επαληθεύτηκαν read-only: όλα true εκτός editPosButtons/customerCardOnly/hidePrinter false, Πωλητής true/Διαχειριστής false. POS καλάθι0/ουρά0/catalog94 πριν την αλλαγή.

Fresh πριν προσθήκη: MYWORKSTATION LAB/ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ cmtpopbgo000trhb5ng9ytiru. MAIN OPEN από10/10 08:13, count8/cash4/card0/IRIS0/expense0/total4/latestSALE11:59/IN.10OUT.10. Fresh selected control LAB-POS-02 OPEN από26/09 01:33, count2/cash0/card0/IRIS0/expense120/total0/latestnone/IN0OUT0. Audit1204 rows including header, filter10Sep–10Oct/exactLAB; five new external N40 fixture rows since previous1199, not attributed toNo33. Latest16:51 N40 login; original LAB POS2 rights untouched. Public health exactd7520c9fefa233551820a26d986ab50b81e16a89/ok. Cached POS client from55819e98 acceptance, no new SHA claim. Main6f97ac40 read; latestsourcehistory inspected and priorboundedPASS protected.

Affected stock quantity/latestmovement before adding currently NOT TESTED; add alone must not post stock. Measure SKU2270 before payment, then fresh same SKU/control/tills/Audit after one submit. No fiscal bypass/stock adjustment or full Inventory audit. New sale/return currently NOT TESTED/NOT EXECUTED.

## Fresh πριν μοναδική πληρωμή

17:20 προστέθηκε μόνο μία νέα γραμμή SKU2270 qty1 unit1 total1€. Audit1204→1205, ένα ADD_ITEM LABPOS2. Πριν CASH: narrow Warehouse search2270/exactLAB/1result independently shows stock−13/productID4f126988-a1a8-433c-b469-70203415df5b/EAN5201005080034. POSrow stock−13 agrees. Warehouse latestSALEdisplay10Oct09:51:19, stocklatestmovement timestamp/ID NOT TESTED (not exposed in this filtered table); not inferred from lastSALE. No Inventory action/adjustment/selection/edit/otherowner test. MAIN8/4/control2/0/expense120/cardIRIS0/INOUTsame baseline. Cart1/queue0/original23. Nextsingleaction CASH1€ in virtualLAB, expectedMAIN9/cash5/stock−14/controlunchanged; no prior payment replay or fiscal gate bypass.

## Πώληση observed / baseline πριν επιστροφή

Μοναδικό CASH submit17:22:43, νέο Sale47ebcdab-adce-41b5-8382-cbe933c40f3c. Cart0/queue0. Fresh MAIN9/cash5/card0IRIS0/expense0/total5/latest17:22/IN.10OUT.10/category7units5€. Freshselectedcontrol count2/cash0/card0IRIS0/expense120/total0/IN0OUT0, unchanged. Fresh narrowSKU2270 stock−14 vs−13 (exact−1), latestSALE17:22:43. Audit1205→1208 exactlySTOCK SALEOUT1/COMPLETECASH1/SALEsameUUID, oneeach. No duplicate submit. Currentcatalog95 vscached94 before; otherowner source/newfixture context, no creation byNo33 (not inferred as ownproductwrite).

Before nextsingleRETURN onlynew17:22sale autoselected innormalEMPLOYEE list, qty1/1€/CASH1, reasonΔοκιμή. Freshcurrentstock−14/MAIN9&5/control2&0/Audit1208 recorded. Expectedreturn addsoneledger−1€/stock+1→−13 and controlunchanged. Raw stock movement ID/beforelatestmovement remainsNOTTESTED; centralSTOCK SALE observed17:22 aftersale. No VOID/oldsaleselection/fiscalbypass. ReturncurrentlyNOTEXECUTED.

## Αποτέλεσμα 17:24:38 Athens — περιορισμένο LIVE PASS

Μία ολική RETURN της νέας πώλησης, reason Δοκιμή: returnSaleId `15a49667-9e46-4b00-866c-cd595552e3da`, original `47ebcdab-adce-41b5-8382-cbe933c40f3c`. Fresh MAIN cash5→4/card0/IRIS0/expense0/total5→4/IN.10OUT.10/category7→6units. Count9→11: πραγματική αρνητική πώληση −1€ και χωριστό POS_RETURN Audit −1€· το δεύτερο δεν συνυπολογίζεται ξανά στα οικονομικά. Η ανοικτή ανάλυση επιβεβαίωσε έναν αρνητικό Sale και ένα POS_RETURN του ίδιου return UUID, όχι δύο οικονομικές επιστροφές. Αρχικές8 κινήσεις→τελικές11 μετά προσθήκη SALE/RETURN/Audit. Fresh selected control2/cash0/card0IRIS0/expense120/total0/IN0OUT0 unchanged.

Fresh narrowSKU2270 stock−14→−13, net0 από αρχικό−13, latestSALEdisplay17:24:38. CentralAudit1208→1211: μία οικονομική αρνητική κίνηση και δύο περιγραφές ολικής επιστροφής από χωριστές πηγές, ίδιο original/returnUUID/reason. Raw stock movement ID/immutable return stock ledger NOT TESTED: η ολική reverse αναφορά δεν εμφανίζει STOCK RETURN ξεχωριστά. Δεν προσθέτουμε stock adjustment ή νέα πληρωμή για συμπλήρωση κενού.

Read-only reopen ΕΠΙΣΤΡΟΦΗ: η νέα πλήρως επιστραμμένη πώληση17:22 απουσιάζει από διαθέσιμες· δεν έγινε δεύτερο POST/replay, παλιές πωλήσεις δεν επιλέχθηκαν/επιστράφηκαν. Παράθυρο έκλεισε, cart0/queue0/searchblank/original23EMPLOYEE unchanged (καμία μεταβολή δικαιωμάτων στο σκέλος). Εικονικό NON_FISCAL LAB, πραγματικό RBS receipt/fiscal return/physicalprint NOT TESTED, χωρίς bypass.

Bounded LIVE PASS: normal EMPLOYEE νέα CASH1€ πώληση και ολική επιστροφή της ίδιας νέας πώλησης με μετρημένη ποσότητα/ταμεία/control/Audit. Δεν είναι συνολικό No33 PASS, partial-item/mixed/card/refund-negative/immutable stock ledger/fiscal/printing/broader roles/modules μένουν OPEN. Νέα έγκριση17:17 συνεχίζει να ισχύει για τις αναγκαίες εικονικές δοκιμές No33· δεν ζητείται ξανά έγκριση κάθε φορά. Επόμενο σκέλος: αρχικό ταμείο/κλείσιμο με κανονικό EMPLOYEE και QR/φυσική καταμέτρηση όπου απαιτείται· πρώτα διάβασε φρέσκες κοινές καταγραφές και νέα baseline, χωρίς replay του σημερινού fixture.

Evidence: CHECKPOINTS/EVIDENCE/operator-sale-return-20261010/{before-return,returned-stock,returned-totals}.jpg. Κεντρική δημοσίευση checkpoint/manual/active/pending/tracker/numbered/PDF μετά πράσινο docs CI. Same owner, No33 OPEN.
