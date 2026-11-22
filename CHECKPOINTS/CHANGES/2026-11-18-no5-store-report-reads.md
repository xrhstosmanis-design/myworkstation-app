# No5 — δεκαπέντε αναφορές ανά κατάστημα

18/11/2026 · CENTRAL-BACKOFFICE-ACCESS-01 · PR #4007.

Baseline: remote `f04444d148823e5abf971d5356df01a9b16e11d5`, local `2f934daa2b66f9297e0490cccecc50a9b0906469`, tree `72f7d3f6f0399370eebd5b3569fec442f139d093`.

## Συμπεριφορά

STORE74 = 56 ανεξάρτητες αναγνώσεις + 18 ενέργειες. COMPANY32 αμετάβλητο. Νέα ρητά `store-reports-*.read`: αλλαγές τιμών, τμήματα, παραστατικά, δελτία αποστολής, απενεργοποιήσεις, διαγραφές πωλήσεων, ενέργειες POS, καταστροφές, κινήσεις, απογραφές, στιγμιότυπο αποθέματος/είδους, ανάλυση αποθέματος/πωλήσεων και καταγεγραμμένα έξοδα/συνδεδεμένες πληρωμές προσωπικού.

Υποχρεωτικό ίδιο επιλεγμένο κατάστημα σε επαληθευμένο grant, header και query· χωρίς εταιρικό selector, COMPANY policy, εταιρικό κατάλογο ή νέα στήλη λογαριασμού. Αναφορές σύνδεσης δεν αποκτούν πλασματικό store scope. Οι έλεγχοι ενεργής άδειας/modules και ανάκλησης ισχύουν πριν και μετά την ανάγνωση. Payroll απαιτεί επιπλέον BASIC/PAYROLL του καταστήματος και χρησιμοποιεί τον πραγματικό STAFF reader με authorization εκτός read-only snapshot.

Τα στιγμιότυπα εμφανίζουν κόστος μόνο από ιστορικό αγορών του επιλεγμένου καταστήματος, με ρητό valuationBasis και null όταν λείπει. Διατηρούνται οι canonical υπολογισμοί stock/sales και η νόμιμη κοινή ιδιότητα Product.costPrice στα υπόλοιπα reports. Δεν εμφανίζονται παραστατικά/προμηθευτές/ημερομηνίες αγορών άλλου καταστήματος. Οι καθαρές οθόνες επαναχρησιμοποιούνται με πραγματικό STORE envelope και κλειδωμένο όνομα καταστήματος.

## Πραγματικά προηγούμενα αποτελέσματα και διορθώσεις

Το κύριο CI32 `44307888518` απέτυχε: 6360 PASS / 6 FAIL / 1 SKIP. Τέσσερα minimal PostgreSQL fixtures Supplier δεν είχαν το πραγματικό companyId· προστέθηκε ως NOT NULL χωρίς DEFAULT με ρητή ίδια/ξένη εταιρεία. Οι δύο πραγματικές BASE/CAPTURE δοκιμές σταμάτησαν στο ανύπαρκτο Employee.companyId: ο Employee ανήκει μέσω storeId. Διορθώθηκαν οι δύο joins σε e.storeId=sa.storeId, διατηρώντας τον έλεγχο εταιρείας Sale→Store και προστέθηκε regression έναντι πραγματικού immutable metadata. Κανένα αποτυχημένο CI δεν μετατρέπεται σε PASS.

Wallet32 `44307888527`: 9/9 PASS, πραγματικό matching PostgreSQL16.16 και δεύτερη υποχρεωτική PostgreSQL18 full/selective recovery. Chat32 SUCCESS. Δεν άλλαξε ο μηχανισμός backup/recovery.

## Επαλήθευση της παρούσας πηγής

Τελική συγκεντρωτική σουίτα 70 αρχείων: 379 tests, 361 PASS / 18 native PostgreSQL-or-image SKIP / 0 FAIL, 160.75s. NODE_ENV=test, canonical server cwd, concurrency4, actual Chromium excluded. Client build PASS, 62s. Logs: /tmp/no5-store74-final.log και /tmp/no5-store74-build.log. Τα SKIP δεν είναι PASS.

Νέος native helper εκτελεί τα STORE reports με πραγματικό παλιό λογαριασμό 8 στηλών πριν από COMPANY install, χωρίς worker/company authority, σε BASE και CAPTURE. Metadata preflight ελέγχει 56 seed rows, αλλά δεν πιστοποιεί εκτέλεση PostgreSQL. Πραγματικό νέο CI απαιτείται.

## Όρια

Πλήρης κάλυψη Owner παραμένει OPEN στην coverage λίστα. Καμία παραγωγική αλλαγή, εγκατάσταση COMPANY, merge/deploy ή ανθρώπινη αποδοχή δεν έγινε σε αυτό το checkpoint. Οι δοκιμές χρήστη σε υπάρχον LAB θα γίνουν συγκεντρωτικά στο τέλος, χωρίς επανάληψη ήδη περασμένων οικονομικών/stock σεναρίων.
