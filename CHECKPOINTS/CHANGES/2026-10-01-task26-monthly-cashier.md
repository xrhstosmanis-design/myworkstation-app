# #26 — Μηνιαία εικόνα ταμείων ανά εργαζόμενο

ASSIGNED `codex/task26-monthly-cashier-20261001`, βάση main7c21270. LOCAL IMPLEMENTED / AWAITING CI + EXACT DEPLOY + LAB.

## Υπάρχουσα κατάσταση

Η Απόδοση & Ταμεία υπάρχει ήδη στο Workforce. Checkpoints20/09 workforce-employee-performance-v1 και workforce-pos-performance-v2 είναι AWAITING LAB, όχι PASS. Τρέχουσα περίοδος rolling30days, ταμειακά ποσά από CashShiftSession cached close fields, operator identity με employeeId και openedBy, όχι ονόματα. Υπάρχουσα ανθρώπινη αξιολόγηση1–5 παραμένει ανεξάρτητη. Δεν χτίζουμε δεύτερη οθόνη ούτε αλλάζουμε Payroll #10.

## Στενό scope και προστασία

Πρόσθετη ημερολογιακή περίοδος Europe/Athens με exclusive end, επιλεγμένο store και company παντού. Read-only μηνιαία προβολή κινήσεων από StoreTransaction, ακόμη και για ανοικτή βάρδια, reversed χωριστά· διαφορές μόνο για κλεισμένες βάρδιες της περιόδου. Η απόδοση αφορά βάρδιες που άνοιξε ο συνδεδεμένος χειριστής, όχι απόδειξη ότι ο ίδιος πραγματοποίησε κάθε κίνηση. Χωριστό count ανοικτών. Προστατεύονται rolling30days API, ανθρώπινες αξιολογήσεις, μισθοδοσία, auth/licensing και όλα τα υπάρχοντα PASS. Καμία production DB σύνδεση/DDL/migration, πώληση, πληρωμή, έγκριση, αξιολόγηση ή stock αλλαγή.

## Αποδοχή

Meaningful isolated tests για Athens winter/summer/DST/leap/month boundaries, bad input, tenant/store/employee filters, open-month ledger vs stale cached totals και reversal. Μετά build/server/invariants/HTTP E2E CI, merge και exact deploy: πραγματικό LAB read-only μήνας/μετάβαση/στοιχεία και πριν/μετά δύο ταμείων. Καμία νέα συναλλαγή για απόδειξη. Σήμερα NOT TESTED· κανένα νέο manual PASS.

## Προηγούμενο #25

LIMITED LAB PASS ήδη δημοσιευμένο #1597, revisiona882bb4. Στις18:38–18:49 ξανά0pending supplierpayments/0normal lowstock.12 isolated local checks chat/payment handlers PASS με mocked DB, όχι πραγματικό Owner/LAB/SQL/auth-module PASS. Δεν αφαιρούνται τα πραγματικά remaining acceptance. Ίδιος υπεύθυνος παραμένει `codex/task25-pending-sources-20261001`.

## Τοπική επικύρωση

Node20.20.2:6 targeted PASS, frontend build PASS, server build PASS,1757serverPASS/0FAIL/1SKIP (optional PostgreSQL integration χωρίςDATABASE_URL). Νέο πραγματικό HTTP/SQL σενάριο στην υπάρχουσα isolatedCIWorkforce ροή: εικονική ανοικτή βάρδια με cached999, μήνας3.60, boundary-before/end excluded, reversed300excluded, δεύτεροstore0, foreigncompany404, invalidmonth400, ledger snapshotαμετάβλητο. Η εκτέλεσή του AWAITING CI· δεν δηλώνεται LAB PASS. Ο παλιός rolling30days κώδικας διατηρείται. DefaultUIμήνας, προαιρετική30days, race cancellation/error retry/close διαθέσιμα. Προβολή αναλυτικώνshiftIDs και warningspartial250shifts/500attendance/250actions. Δεν προστέθηκεmanualPASS.

## CI/merge και πριν τη read-only LAB δοκιμή

PR1599 head01728bbe, CI4016PASS μαζί με πραγματικό monthly SQL/HTTP σενάριο16:13:24Z. Mergeedeba510531b8e7940983f22c8a5e31ef3b90b19, mainCI4018PASS· Render1856in-progress16:16:54Z. Exact deploy ακόμη NOT VERIFIED, δεν ξεκίνησεmonthlyLAB.

BEFORE16:16UTC περίπου/19:16Ελλάδας: MYWORKSTATION LAB, ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ cmtpopbgo000trhb5ng9ytiru, cloudChrome με SuperAdmin, φυσικόPOS/operatorN/A. Φρέσκο BackOffice: MAIN2συναλλαγές/μετρητά2.40/card0/IRIS0/total2.40, LAB-POS-02 2συναλλαγές/όλα0. Προβλεπόμενες ενέργειες μόνο επιλογή μήνα/εργαζομένου και ανάγνωση, quantity0/paymentN/A. Δεν επηρεάζεταιSKU, stock/latestmovement/hashNOTTESTED, καμία επιχειρησιακή εγγραφή επιτρέπεται.

## Exact deploy και περιορισμένη LAB αποδοχή

Render1856 completed success16:19:57Z, runtimehealth exactedeba510 επιβεβαιωμένο πρινmonthlyLAB. CanonicalPlatformAdmin→Προσωπικό & Πρόγραμμα→MYWORKSTATION LAB→ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ→LAB POS2→Απόδοση & Ταμεία. SuperAdmin/cloudChrome μόνο. Default2026-10 0παρουσίες, rolling30 27ω56λ/7ω, επιστροφήMONTH και πραγματική επιλογή2026-09 δείχνει27ω56λ/7ω: LIMITED UI LAB PASS. Explicit «Δεν υπάρχει verified POS operator» τόσοmonthlyόσοrolling. Δεν αποδεικνύονται θετικές πωλήσεις/βάρδιες από ίδιο όνομα και δεν δημιουργείται σύνδεση για διάγνωση. Human evaluation0, κανέναsubmit. Μετά freshreload MAIN2/2.40€/card0/IRIS0, LAB-POS-02 2/0€, αμετάβλητα. Financial/stockwrites0. Remaining ASSIGNED στον ίδιο υπεύθυνο: θετική verified identity/shift/ledger αποδοχή, Owner χωρίςSA, livecap/errors. Συνολικό#26 και automatic score OPEN.
