# LAB Fiscal DRY RUN — ασφαλής ανάκτηση route πώλησης

Ημερομηνία: 10 Σεπτεμβρίου 2026  
Κατάσταση: υλοποιήθηκε, automated PASS, αναμονή CI/merge/live επιβεβαίωσης  
PR: #623

## Πραγματικό εύρημα LAB

- Η πώληση `1 × ΝΕΡΟ 1,5LT` με `ΜΕΤΡΗΤΑ 1,00 €` ολοκληρώθηκε ως `NON_FISCAL` στις 10/09/2026 12:14:57.
- Το `LAB-POS-02` είχε αποθηκευμένο mapping `LAB-FISCAL-02`, `LAB-EFTPOS-02A` για κατάστημα και `LAB-EFTPOS-02B` για delivery.
- Η πώληση δεν εμφανίστηκε στο Fiscal Bridge DRY RUN επειδή δεν υπήρχε καταγεγραμμένο `PaymentDeviceRouteAttempt`.

## Διόρθωση

- Προτιμάται πάντα το ήδη καταγεγραμμένο route attempt.
- Αν λείπει, το DRY RUN βρίσκει το Terminal ID από το `POS_SALE_COMPLETED` audit ή από τη `StoreTransaction` και τη συνδεδεμένη `CashShiftSession`.
- Το route ανακατασκευάζεται μόνο από το τρέχον ενεργό mapping του ίδιου company/store/terminal.
- Μετρητά: απαιτείται ακριβώς μία ενεργή ταμειακή στο terminal και χρησιμοποιείται `NOT_APPLICABLE` για EFTPOS.
- Κάρτα/IRIS και ετεροχρονισμένη παράδοση: χρησιμοποιείται ο υπάρχων fail-closed resolver και απαιτείται ακριβώς ένα EFTPOS με ρόλο `STORE` ή `DELIVERY` αντίστοιχα.
- Αμφίσημο, ελλιπές ή μη υποστηριζόμενο mapping δεν γίνεται επιλέξιμο.

## Όρια ασφαλείας

- Παραμένει `DRY_RUN` με `externalExecution=false`.
- Δεν προστέθηκε κλήση ή εγγραφή προς RBS, CapDriver ή EFTPOS.
- Δεν δημιουργείται φορολογικό παραστατικό και δεν αλλάζει η κατάσταση της πραγματικής πώλησης.
- Η μόνη εγγραφή μετά από ρητή επιβεβαίωση είναι το υφιστάμενο `FiscalBridgeDryRun` validation record.

## Έλεγχοι

- Client production build: PASS.
- Fiscal/payment/delivery tests: 21/21 PASS.
- Πλήρης server suite: 1.040/1.040 PASS.
- JavaScript syntax και `git diff --check`: PASS.

## Επόμενο ακριβές βήμα

Μετά από πράσινο CI, merge και ολοκλήρωση Render deploy:

1. Άνοιγμα Platform Admin → Fiscal DRY RUN → `MYWORKSTATION LAB · ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ`.
2. Επιβεβαίωση ότι εμφανίζεται η υπάρχουσα πώληση 1,00 € και η διαδρομή `LAB-POS-02 → LAB-FISCAL-02`.
3. Ρητή επιβεβαίωση χρήστη πριν από το κουμπί «Εκτέλεση ασφαλούς DRY RUN».
4. Μετά το PASS, ξεχωριστές NON_FISCAL δοκιμές κάρτας και Delivery / Ετεροχρονισμένης στο LAB.
