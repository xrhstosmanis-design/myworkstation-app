# Νο5 — Αναφορές απογραφής, αποθέματος, πωλήσεων και καταγεγραμμένων πληρωμών

18/11/2026 · CENTRAL-BACKOFFICE-ACCESS-01 · ίδιο PR #4007. Συνέχεια από remote `24abf7b2` / local `1a2d8d4`, ίδιο tree `57685e5350bd5b26c35c90c480727d99b738d27e`. Κατάλογος: 59 STORE και 32 COMPANY δικαιώματα. Όλο το Owner scope παραμένει ASSIGNED/OPEN.

## Νέα ανεξάρτητα COMPANY δικαιώματα

| Δικαίωμα | Ανάγνωση και όρια |
| --- | --- |
| reports-stocktakes.read | Stocktakes, ποσότητες expected/count/difference, κόστος/αξία και πρόσωπα/κατάστημα. Έως 10.000 γραμμές, φίλτρο startedAt. |
| reports-stock-snapshot.read | Ledger snapshot στο τέλος της επιλεγμένης to ημέρας, έως 10.000 product/store συνδυασμοί. Δεν υποκρίνεται ότι το from επηρεάζει το snapshot. |
| reports-item-snapshot.read | Ίδιο snapshot, με υποχρεωτική ανθρώπινη αναζήτηση ονόματος/SKU. Δεν υπόσχεται barcode search που το native SQL δεν υποστηρίζει. |
| reports-stock-analysis.read | Canonical StockV3 στατιστικά, τιμές/κόστος, περίοδος και source warnings, έως 10.000. Κινήσεις επιλεγμένου ιδιόκτητου προϊόντος έως 2.000. |
| reports-sales-analysis.read | Canonical SalesV4 οικονομικά/αντιλογισμοί/source coverage, έως 10.000 ομάδες· επιλεγμένες receipt lines έως 5.000· ίδια ημερολογιακή/ωριαία/σύγκρισης λογική. |
| reports-payroll-expenses.read | Χωριστή ρητή πρόσβαση σε καταγεγραμμένα έξοδα και LINKED_ONLY ονόματα/πληρωμές εργαζομένων, έως 10.000. Δεν είναι δεδουλευμένη μισθοδοσία, παρουσίες ή απόδειξη διακανονισμού. |

Όλα απαιτούν εταιρικό INVENTORY. Ο κατάλογος stores.read είναι ορατή αποθηκευμένη εξάρτηση, ώστε να επιλέγονται πραγματικά ονόματα καταστημάτων αντί UUID ή κρυφών lookups. Το payroll απαιτεί επιπλέον sales-analysis με μεταβατική εξάρτηση stores, και το συγκεκριμένο ενεργό ιδιόκτητο κατάστημα πρέπει να έχει effective BASIC και PAYROLL. Ο dependency helper επιλέγει/αφαιρεί εμφανώς τις εξαρτήσεις και το πραγματικό account schema απορρίπτει orphan policies. Παλιές παραχωρήσεις δεν αποκτούν αυτόματα νέα δικαιώματα.

Επαναχρησιμοποιούνται οι canonical StockV3/SalesV4/calendar/comparison/payroll υπολογισμοί. Τα tenant joins και ιστορικά product/sale references ελέγχονται. Το εσωτερικό strictRead προσθέτει μόνο πληροφορία διαθεσιμότητας κόστους και bound/read projection· το προεπιλεγμένο Owner output και η αριθμητική διατηρούνται. Το payroll έχει γνήσιο STAFF entrypoint με πραγματικό grant/session/revision και paid package checks, χωρίς Owner impersonation ή skip-authorization callback. Η ανάγνωση παραμένει RepeatableRead/read-only και ο τελικός έλεγχος άδειας/παραχώρησης γίνεται ξανά έξω από το snapshot.

Διατηρούνται τα native closed/Athens/366-day όρια, οι ίσες λήξασες μη επικαλυπτόμενες περίοδοι σύγκρισης, οι ωριαίες απαιτήσεις συγκεκριμένου καταστήματος και τα SOURCE_LIMITED/provisional/μη αποδείξεως διακανονισμού warnings. Άγνωστη αποτίμηση δεν γίνεται πραγματικό μηδέν. Οι παλιές native διαδρομές Owner διατηρούν την αρχική ροή τους.

Η pure UI χρησιμοποιεί μόνο ρητά επιτρεπόμενο κατάλογο καταστημάτων και επιλεγμένες ονομαστικές γραμμές για τα detail calls. Ελέγχει scope/store/interval/nullable values/ολόκληρο DTO, και κρύβει παλιές directory/detail/payroll απαντήσεις σε αλλαγή API/χρήστη/δικαιωμάτων/κριτηρίων. Η πρόσβαση σε ονόματα και ποσά linked payroll περιγράφεται και επιλέγεται χωριστά. Η ακριβής ταξινόμηση dynamic paths απορρίπτει raw query/fragment suffixes· η πραγματική service query validation παραμένει ανεξάρτητη.

## Επαλήθευση

Τελική συνδυασμένη εκτέλεση **66 αρχείων, 363 tests: 347 PASS / 16 native PG-or-Docker SKIP / 0 FAIL**, NODE_ENV=test, canonical server directory, concurrency 4, 107,61 δευτερόλεπτα. Περιλαμβάνονται όλοι οι προσωπικοί/εταιρικοί adapters, οι canonical stock/sales/hourly/comparison/payroll regressions και οι διορθώσεις παλιών fixtures. Client build PASS σε 46,85 δευτερόλεπτα. Οι επικαλυπτόμενες εκτελέσεις δεν αθροίζονται. Local Node24, πραγματικό CI Node20.

Νέο native helper στα BASE/CAPTURE ελέγχει πραγματικό Owner policy με ορατό parent closure, JWT/auth/index/SQL, τις canonical οικονομικές προβολές, matching-name foreign canary, 0/5 τιμές και πραγματικά nullable Stocktake/Movement costs. Το payroll δοκιμάζει πραγματικό read-only RepeatableRead και withdrawal συγκεκριμένου BASIC/PAYROLL/account revision μετά το snapshot, ενώ άλλο κατάστημα παραμένει ενεργό. Η πραγματική νέα αποδοχή εκκρεμεί στο CI.

Το ίδιο pure financial seed plan 32 γραμμών χρησιμοποιείται και από native setup και από νέο τοπικό preflight. Ελέγχει κάθε supplied column/type/null και κάθε omitted required field έναντι immutable πραγματικού metadata. Συμπεριλαμβάνει NOTNULL πεδία που έχουν default: Product.costPrice/salePrice=NULL απορρίπτονται, Stocktake.unitCost=NULL επιτρέπεται. Αυτό είναι **schema preflight, όχι native PostgreSQL PASS**.

## Προηγούμενα πραγματικά CI

Main26 `44301623508` απέτυχε μόνο στα δύο owned fixtures Product.costPrice=NULL, SQL23502, πριν εκτελεστούν οι έξι νέοι readers: BASE724 12:15:18 / CAPTURE725 12:16:01 UTC. Τελική security σουίτα 6.349 tests: 6.346 PASS / 2 FAIL / 1 SKIP, όχι hang ή timeout. Η πραγματική NOTNULL constraint διατηρήθηκε και τα seed δεδομένα διορθώθηκαν σε 5/0, με έλεγχο destruction10/0 και ξένου προϊόντος. Πραγματικά nullable movement/deactivation στοιχεία παραμένουν στο native δείγμα. Δεν χαρακτηρίζουμε εκείνες τις έξι native αναγνώσεις PASS· απαιτείται η νέα συνδυασμένη εκτέλεση.

**Wallet44301623598 SUCCESS, 9/9 PASS**, Chat44301623729 SUCCESS. Πραγματικό log: source160016, matching private16.16 στις 12:13:45 UTC· ολόκληρη native wallet full/selective verification πέρασε στις 12:14:10 UTC και περιλαμβάνει και τη δεύτερη υποχρεωτική παραγωγική PG18 επαναφορά. Οι δύο εικόνες χτίστηκαν από το ίδιο production Dockerfile. Ο host dump client έμεινε16.15, αλλά το πραγματικό archive πέρασε όλους τους ελέγχους και στους δύο συμβατούς targets. **Δεν προστέθηκε περιττή αλλαγή producer/network ή άλλη εικαστική διόρθωση μετά το πραγματικό PASS.** Οι 20 δεσμευμένες πηγές/profiles/restore assertions δεν άλλαξαν σε αυτή την παρτίδα.

## Συνέχεια

Η επόμενη ανατεθειμένη επέκταση είναι οι αντίστοιχες αναφορές με αυστηρό STORE scope, ώστε να μπορούν να παραχωρούνται μόνο για συγκεκριμένο κατάστημα χωρίς εταιρική αρχή. Το login history δεν έχει ασφαλή native store συσχέτιση και παραμένει COMPANY-only. Δεν έγινε ακόμη αυτή η επέκταση στην παρούσα παρτίδα.

Καμία παραγωγική migration, COMPANY activation, merge/deploy ή ανθρώπινη δοκιμή. Οι υπόλοιπες Owner οικογένειες παραμένουν OPEN. Μία τελική συγκεντρωτική συνεδρία POS/SuperAdmin/Owner στο ίδιο LAB, χωρίς επανάληψη παλιών οικονομικών ή stock PASS.
