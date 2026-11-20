# No5 — εταιρικές αναφορές προμηθευτών και πελατών

18/11/2026 · CENTRAL-BACKOFFICE-ACCESS-01 · PR #4007.

Baseline remote `815b50b87d22ea7a942d87baf731df0ea9c3aa1e`, local `0b0a4847f7080398ca49c097036ad58e267e4438`, tree `d7821bd4a42a3b616e3891bcfdce1faee3e87f36`.

## Συμπεριφορά

COMPANY36 με τέσσερα νέα ανεξάρτητα δικαιώματα: reports-supplier-invoices.read, reports-supplier-payments.read, reports-supplier-purchases.read και reports-customer-turnover.read. STORE74 αμετάβλητο. Ορατές ρητές εξαρτήσεις suppliers.read/customers.read, χωρίς αυτόματη επέκταση υφιστάμενων λογαριασμών. Ελέγχονται και τα πραγματικά modules των γονέων: INVENTORY για supplier και CORE+POS για turnover/customer directory. Όλα απαιτούν εταιρικό grant και πραγματικό company installation/readiness.

Πρώιμη καθαρή γέφυρα πριν από native bootstrap/DDL, ελληνικές ημερομηνίες υποχρεωτικές και μόνο πραγματικά διαθέσιμα φίλτρα. Επιλογή προμηθευτή/πελάτη από ξεχωριστά εξουσιοδοτημένο ονομαστικό κατάλογο, συμπεριλαμβανομένων ιστορικών ανενεργών συναλλασσομένων. Ιδιοκτησία εταιρείας σε κάθε σύνδεση και νέα επαλήθευση οντότητας/grant/revision/modules μετά την ανάγνωση. Δεν επιτρέπονται κατάστημα, UUID input, αρχεία ή ενέργειες πληρωμής/αλλαγής.

Παραστατικά/πληρωμές διατηρούν το native παράθυρο 3.000 πρόσφατων εγγραφών, με σύνολα ρητά μόνο του παραθύρου. Στις πληρωμές φαίνονται αντιλογισμοί αλλά δεν προσμετρώνται στο ενεργό ποσό· το συνημμένο έχει μόνο όνομα, χωρίς πρόσβαση στο αρχείο. Αγορές/τζίρος έχουν έως 10.000 πλήρεις ομάδες, με απόρριψη υπέρβασης. Αγορές διατηρούν το πρόσημο εγκεκριμένων παραστατικών, χωρίς νέα ερμηνεία πιστωτικών ή υπόλοιπου· ποσοστό σε μηδενικό σύνολο είναι null. Ο τζίρος διατηρεί την ενεργή native λογική αντιστροφών, επισκέψεων και ABS του αθροίσματος επιστροφών.

## Πραγματική προηγούμενη native αποδοχή

Στο head815b50b8, main74 `44312598225`, job134830580133: πραγματικό BASE724 PASS στις13:23:02UTC και CAPTURE725 PASS στις13:23:46UTC. Και τα δύο εκτέλεσαν πρώτα τις15STORE αναφορές με πραγματικό παλιό λογαριασμό8στηλών, χωρίς COMPANY column/worker, και μετά full private restore/install/όλους τουςCOMPANY32 helpers. Τα προηγούμενα6FAIL πράγματι διορθώθηκαν. Ολόκληρο το run ακόμη παρακολουθείται· δεν εξάγεται πρόωρο συνολικό PASS. Wallet74 `44312598279` 9/9 PASS, πραγματικές matching16.16 καιPG18 επαναφορές· Chat74 `44312598181` SUCCESS.

## Επαλήθευση παρούσας πηγής

Τελική συγκεντρωτική σουίτα 72 αρχείων: 392 tests, 374 PASS / 18 PostgreSQL-or-image SKIP / 0 FAIL,126.31s. Canonical server cwd, NODE_ENV=test, concurrency4, actual Chromium excluded. Client build PASS,39.63s. Logs /tmp/no5-company36-final.log και /tmp/no5-company36-build.log. Τα SKIP δεν είναι PASS.

Νέος native23-row helper με πραγματικό Owner policy creation, χωρίς STORE grants, πραγματικό STAFF JWT/auth/index και SQL σε BASE/CAPTURE. Ελέγχει ίδια/άλλη εταιρεία, ανενεργά ονόματα, όρια ελληνικής ημέρας, ποσά/αντιστροφές/μηδενικά, ασφαλές όνομα αρχείου, modules και ανάκληση. Το schema preflight χρησιμοποιεί το ίδιο seed plan και πραγματικό immutable metadata· δεν χαρακτηρίζεται native PostgreSQL PASS. Νέο πραγματικό CI απαιτείται γιαCOMPANY36.

## Υπόλοιπα

Πλήρης Owner κάλυψη OPEN. Οι αναλυτικές καρτέλες, supplier balance/sales και λοιπές εκκρεμότητες παραμένουν χωριστές. Η επόμενηconfiguration ομάδα έχει μόνο read-only source audit στο BACKOFFICE_CONFIGURATION_READ_AUDIT.md· δεν αποδίδεται ως υλοποιημένη εδώ. Καμία παραγωγική εγκατάσταση, merge/deploy ή ανθρώπινη δοκιμή σε αυτό το checkpoint. Ενιαία συνεδρία χρήστη στο υπάρχον LAB στο τέλος.
