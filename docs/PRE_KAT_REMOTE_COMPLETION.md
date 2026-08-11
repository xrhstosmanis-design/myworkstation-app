# MyWorkStation — PRE-KAT REMOTE COMPLETION PLAN

Ημερομηνία αναθεώρησης: 11/08/2026

## Νέα απόφαση υλοποίησης

Πριν από οποιαδήποτε φυσική επίσκεψη στο ΚΑΤ, κλείνουμε απομακρυσμένα ΟΛΑ όσα μπορούν να υλοποιηθούν, να ελεγχθούν και να γίνουν αποδεκτά στο TEST / Render.

Στο ΚΑΤ θα μείνουν μόνο τα βήματα που απαιτούν το πραγματικό μηχάνημα και το πραγματικό περιβάλλον:
- USB PRECHECK στο πραγματικό PC,
- εγκατάσταση / pairing read-only Observer,
- heartbeat / πραγματικά logs,
- επιβεβαίωση coexistence με Kiosk Manager / RBS / CapDriver / ταμειακή,
- τελικές πραγματικές hardware συναλλαγές,
- 24–48 ώρες παρατήρηση και sign-off.

## Τρέχουσα ασφαλής βάση

Τελευταίο ολοκληρωμένο functional package: PR #132 — Management Parameters.
Merge commit: `0c31f5f801b7340f4ab3791e974bebb97fe10ed7`.
CI #182: SUCCESS.
Render: SUCCESS.
Checkpoint: `docs/checkpoints/PROJECT_CHECKPOINT_2026-08-11_0135_MANAGEMENT_PARAMETERS.md`.

## REMOTE P0 — Πρέπει να κλείσουν πριν πάμε ΚΑΤ

### 1. Συνολική λειτουργική αποδοχή TEST
- [ ] Πλήρες regression όλων των βασικών modules από SUPER_ADMIN / OWNER-ADMIN / Store Operator.
- [ ] Έλεγχος ότι καμία νέα σελίδα δεν έχει Kiosk Manager colors αντί MyWorkStation navy/teal.
- [ ] Έλεγχος ότι όλα τα κάτω βασικά κουμπιά των υλοποιημένων οθονών είναι πραγματικά λειτουργικά.
- [ ] Έλεγχος global touch keyboard σε όλα τα νέα text/number inputs.
- [ ] Έλεγχος anti-freeze / pagination / lazy drill-down στα μεγάλα grids.

### 2. POS — κρίσιμες εκκρεμότητες
- [ ] Πραγματική επιλογή πελάτη στο POS και αποστολή `customerId` στο checkout.
- [ ] Πραγματικός υπολογισμός επισκέψεων/τζίρου πελάτη από POS sales.
- [ ] Εφαρμογή ενεργών τιμών χονδρικής ανά επιλεγμένο πελάτη.
- [ ] Εφαρμογή ενεργών προσφορών φυλλαδίου στο POS με deterministic precedence.
- [ ] Εφαρμογή «Προσφορές και δώρα» στο POS χωρίς διπλές/ασαφείς εκπτώσεις.
- [ ] Έλεγχος ακύρωσης/επιστροφής/ετεροχρονισμένης συναλλαγής με audit.
- [ ] Έλεγχος μετρητά / κάρτα / μικτή πληρωμή / χειροκίνητο EFTPOS στο TEST.

### 3. Τιμές / προσφορές / multi-store
- [ ] Excel/CSV import για «Προσφορές φυλλαδίου» με preview-first και unresolved rows.
- [ ] Διόρθωση datetime-local → ISO για ισχύ προσφορών.
- [ ] Έλεγχος overlap/duplicate ενεργών προσφορών στο ίδιο προϊόν.
- [ ] Δημιουργία προσφοράς σε ένα κατάστημα και αποστολή σε επιλεγμένα καταστήματα.
- [ ] Μαζική αλλαγή τιμών με επιλογή προϊόντων, preview και audit.

### 4. Προϊόντα / αποθήκη / απογραφή
- [ ] Duplicate SKU/barcode warning μέσα στο ίδιο import file πριν final import.
- [ ] Καθαρισμός πραγματικού catalog ΚΑΤ: barcodes, duplicates, κατηγορίες, υποκατηγορίες, ΦΠΑ, ενεργά.
- [ ] Πλήρης απογραφή: θεωρητικό stock / φυσικό stock / διαφορά / αξία / οριστικοποίηση / ενημέρωση αποθήκης.
- [ ] Έλεγχος stock adjustments και audit μετά από απογραφή.

### 5. Προμηθευτές / αγορές / πληρωμές
- [ ] Σύγκριση ίδιου προϊόντος ανά προμηθευτή με πραγματικό ιστορικό τιμολογίων και καθαρή φθηνότερη τιμή.
- [ ] Πληρωμή προμηθευτή από πραγματικό παραστατικό με OCR/AI Reader όπου ενεργό, ανθρώπινη επιβεβαίωση και audit.
- [ ] Σύνδεση κατηγοριών εξόδων στη φόρμα πραγματικής καταχώρησης «Λοιπά έξοδα».
- [ ] Έλεγχος ότι πληρωμές/έξοδα επηρεάζουν σωστά τη βάρδια και τις αναφορές.

### 6. Πελάτες / loyalty
- [ ] Σύνδεση CustomerCategory στον πραγματικό πελάτη.
- [ ] Σύνδεση Profession στον πραγματικό πελάτη όπου απαιτείται.
- [ ] Έλεγχος receipts / balance / ledger μετά από πραγματικές TEST πωλήσεις.
- [ ] Loyalty / πόντοι: ενεργοποίηση μόνο των κανόνων που έχουν πραγματικά οριστεί στις Παραμέτρους.

### 7. Βάρδιες / Έλεγχος Ταμείων
- [ ] Πλήρες TEST opening → sales → expenses → EFTPOS → closing → difference.
- [ ] Ετεροχρονισμένη συναλλαγή και επίδραση στη σωστή βάρδια.
- [ ] Αυτόματη ημερήσια αναφορά ελέγχου ταμείων στο MyWorkStation.
- [ ] Έλεγχος duplicate-like transactions / αντιλογισμών / ποσοστών όπου εφαρμόζεται.
- [ ] Επιβεβαίωση email αναφοράς και επιλογής αποστολής.

### 8. Ρόλοι / δικαιώματα / tenant isolation
- [ ] Τελική μήτρα SUPER_ADMIN / OWNER / ADMIN / MANAGER / EMPLOYEE / Store Operator.
- [ ] Έλεγχος κάθε βασικής route/UI action με σωστό allow/deny.
- [ ] Tenant isolation test με δεύτερη εταιρεία / δεύτερο κατάστημα στο TEST.
- [ ] Audit για κρίσιμες μεταβολές: τιμές, stock, χρήστες, PIN, παραμέτρους, πληρωμές.

### 9. Email / ειδοποιήσεις
- [ ] End-to-end TEST όλων των email flows με πραγματικό επαγγελματικό sender.
- [ ] Αποτυχία email → καταγραφή / retry ή σαφής κατάσταση αποτυχίας.
- [ ] SPF/DKIM verification και βασικό deliverability test.
- [ ] DMARC hardening αργότερα, μετά από παρακολούθηση.

### 10. Backup / restore / monitoring / security
- [ ] Αυτόματο backup βάσης + τεκμηριωμένο restore drill.
- [ ] Backup/restore test αρχείων όπου υπάρχουν persistent assets.
- [ ] Monitoring server / DB / SMTP / queues / Observer endpoints.
- [ ] Alerts για failures / disk / email / reconciliation.
- [ ] Secret rotation plan και έλεγχος Render environment variables.
- [ ] Log retention policy και επιβεβαίωση ότι δεν γράφονται passwords, PIN, στοιχεία καρτών ή provider secrets.

### 11. Parameters — behavioral wiring
Οι Παράμετροι PR #132 αποθηκεύονται πραγματικά. Πριν το ΚΑΤ πρέπει να συνδεθούν λειτουργικά μόνο όσες επιλογές επηρεάζουν ήδη υπάρχουσες ροές.
- [ ] PoS parameters → πραγματική συμπεριφορά POS όπου υπάρχει σχετική λειτουργία.
- [ ] BackOffice parameters → πραγματική συμπεριφορά archive/offers/inventory όπου υπάρχει σχετική λειτουργία.
- [ ] Shift parameters → πραγματική συμπεριφορά opening/closing όπου υπάρχει σχετική λειτουργία.
- [ ] Customer parameters → loyalty/POS customer behavior όπου υπάρχει σχετική λειτουργία.
- [ ] Email parameters → πραγματικά email triggers όπου υπάρχει σχετική λειτουργία.
- [ ] Purchase parameters → πραγματική συμπεριφορά order/purchase UI όπου υπάρχει σχετική λειτουργία.

## ΕΞΩΤΕΡΙΚΕΣ ΕΞΑΡΤΗΣΕΙΣ — ετοιμάζουμε software εδώ, τελική πιστοποίηση εκτός TEST

### Provider / myDATA / ηλεκτρονική τιμολόγηση / ψηφιακό δελτίο
- [ ] Επιλογή πιστοποιημένου provider και εμπορική συμφωνία.
- [ ] API credentials / sandbox.
- [ ] Adapter / connector layer.
- [ ] Sandbox tests.
- [ ] Production certification αργότερα.

### EFTPOS / IRIS / acquiring
- [ ] Οριστικοποίηση συνεργάτη / API / fees.
- [ ] Software adapter και test harness εδώ.
- [ ] Πραγματικό hardware certification όταν υπάρχει συσκευή/πάροχος.

## ΤΙ ΘΑ ΜΕΙΝΕΙ ΜΟΝΟ ΓΙΑ ΤΟ ΚΑΤ

Όταν όλα τα παραπάνω κλείσουν, στο ΚΑΤ επιτρέπεται να μείνουν ΜΟΝΟ:
1. USB PRECHECK στο πραγματικό PC.
2. Pairing code και εγκατάσταση read-only Observer.
3. Επιβεβαίωση backup path / scheduled task / heartbeat / μηδενικής pending queue.
4. Επιβεβαίωση ότι Kiosk Manager / RBS / CapDriver / ταμειακή συνεχίζουν ανεπηρέαστα.
5. Μικρό πραγματικό smoke test hardware: μετρητά, κάρτα/POS, ετεροχρονισμένη, έξοδο, κλείσιμο βάρδιας.
6. 24–48 ώρες πραγματικών logs.
7. Τελικό sign-off ή rollback.

## Σειρά εργασίας από τώρα

1. Remote regression + role/tenant audit.
2. POS customer + wholesale + promotions runtime wiring.
3. Price/offer Excel + multi-store + bulk price preview/audit.
4. Inventory finalization + duplicate import hardening.
5. Supplier comparison + supplier payment/OCR flow.
6. Cash-control daily report integration + email end-to-end.
7. Parameter behavioral wiring.
8. Backup/restore + monitoring + security hardening.
9. Provider/EFTPOS software adapters όπου υπάρχουν credentials/specs.
10. Freeze release candidate και μόνο τότε φυσικό ΚΑΤ.
