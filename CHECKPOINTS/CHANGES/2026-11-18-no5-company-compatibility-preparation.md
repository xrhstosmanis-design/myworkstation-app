# Νο 5 — Προετοιμασία εταιρικών παραχωρήσεων και CI fixtures

18/11/2026 · CENTRAL-BACKOFFICE-ACCESS-01 · συνέχεια PR #4007 από remote `0dc28b9687e6be6436da062435e02411737403a2`. Πλήρης κάλυψη OPEN.

## Έγινε

- Αδρανές packet συμβατότητας για χωριστό `BackofficeStaffAccount.companyCapabilities`: ακριβή source hashes, αναπαραγώγιμα BASE/CAPTURE proposals, καθαρός offline verifier και έλεγχοι app/worker/schema mismatch και rollback χωρίς απώλεια grants. Τα εγκατεστημένα manifests, runtime selectors, schema και ενεργά δικαιώματα παραμένουν αμετάβλητα.
- Συμβόλαιο μελλοντικής UI/API υλοποίησης για stores.read, suppliers.read και customers.read ως εταιρικές παραχωρήσεις, ανεξάρτητες από τα 52 STORE capabilities. Δεν παρουσιάζονται ως ήδη λειτουργικά δικαιώματα.
- Read-only παραγωγικό preflight: app/backup revision a7bb1c4c, οκτώ Account columns, heartbeat συμβατό με τρέχον CAPTURE plan, μηδενικές εκτελέσεις/maintenance στο δείγμα, τελευταίο backup SUCCEEDED και dryRun PASSED. Metadata μόνον· δεν υποκαθιστά signed heartbeat, exact installed guards ή restore acceptance νέου σχήματος. Αναλυτικά στο compatibility preparation doc.
- Το CI44260618234 απέτυχε σε δύο απομονωμένα source-extraction fixtures (`delegatedApprovalsRead is not defined`). Φορτώθηκαν οι πραγματικές νέες dependencies στα tests cash-transfer και supplier-credit-cash αντί stub· ο runtime guard δεν άλλαξε. Προστέθηκε έλεγχος διατήρησης Owner πρόσβασης. Chat browser probe44260618255 PASS. Το προηγούμενο συνολικό CI44251494175 PASS αφορά προηγούμενη πηγή.

## Επαλήθευση και υπόλοιπα

Τοπικά Node24: τελική συνδυασμένη εκτέλεση πέντε αρχείων compatibility/native routes/POS credit-transfer/advance: 12PASS, 2PGSKIP, 0FAIL (14 σύνολο). Προγενέστερα επιμέρους αποτελέσματα δεν αθροίζονται. Νέο CI στην ακριβή πηγή απαιτείται, ιδίως για native PostgreSQL. Δεν έγινε άσχετη επανάληψη πλήρους build: η προετοιμασία δεν αλλάζει client/runtime imports.

Εκκρεμούν reviewed installer και ακριβές paired app/worker/profile transition, αποθήκευση/ανάκληση εταιρικών grants, τρεις native εταιρικές προβολές και προσωπική μηνιαία απογραφή. Event-report profile compositions δεν προετοιμάστηκαν. Δεν έγινε migration, deployment ή νέα ζωντανή δοκιμή λογαριασμών. Οι κοινές δοκιμές POS/SuperAdmin/Ιδιοκτήτη διατηρούνται για το τέλος σύμφωνα με την εντολή χρήστη.
