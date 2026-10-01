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
