# Προμηθευτές — Ποσά / Πιστωτικά

## Επαληθευμένη read-only λειτουργία

**01/10/2026 — Εργασία #21 · USER/LAB PASS (read-only):** exact production `6d892277796e458c2d0ba2f16297189fe19d24cd`, /api/health και πραγματική αρχική πλοήγηση καταλόγου → «€ Ποσά / Πιστωτικά» PASS. PR #1578 αρχική υλοποίηση· PR #1580 ελάχιστη διόρθωση αρχικού κουμπιού, PR CI #3971 / main CI #3972 PASS, 1699 server PASS / 0 FAIL / 0 SKIP, build PASS. MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ: 01/01–01/10/2026, όλοι οι προμηθευτές, κενή αναζήτηση, 58 γραμμές. Τιμολόγια 1.859,49 €, πιστωτικά −4,27 €, πληρωμές −4.914,70 €, διορθώσεις 0 €, κίνηση/τρέχον υπόλοιπο −3.059,49 €. Πραγματικό XLSX ανοίχθηκε: 58 ταυτότητες/348 τιμές συμφωνούν, μεταδεδομένα περιόδου και σύνολα ίδια. Εκτυπώσιμη HTML αναφορά PDF/Εκτύπωση ανοίχθηκε, 58 γραμμές και σύνολα ίδια, αρχή/τέλος οπτικά ελεγμένα. Φυσική εκτύπωση/αποθηκευμένο native PDF NOT TESTED. LAB Audit 1057→1057 ακριβώς ίδιο, MAIN 2/2,40 € και LAB-POS-02 2/0 € αμετάβλητα. Καμία νέα πληρωμή, συμψηφισμός, stock ή άλλη επιχειρησιακή εγγραφή εκτελέστηκε· ανεξάρτητος DB count NOT TESTED. Αφαιρείται από ενεργές εκκρεμότητες, δεν επαναλαμβάνεται. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-task21-supplier-credit-exports-assignment.md`, manual `docs/manual/suppliers/PASS.md`.

## Χρήση

1. Επιλέξτε την επιθυμητή εταιρεία/κατάστημα και ανοίξτε BackOffice → Εμπορική λειτουργία → Λοιπές εμπορικές λειτουργίες → Προμηθευτές.
2. Πατήστε «€ Ποσά / Πιστωτικά», απευθείας από τον κατάλογο.
3. Ορίστε Από/Έως, προμηθευτή ή Επωνυμία/ΑΦΜ και πατήστε Αναζήτηση. Τα Τρέχων μήνας/Τρέχον έτος χρησιμοποιούν μέχρι τη σημερινή ημέρα.
4. Διαβάστε τιμολόγια, αφαιρετικά πιστωτικά/πληρωμές, διορθώσεις και καθαρή κίνηση περιόδου. Το τρέχον συνολικό υπόλοιπο περιλαμβάνει όλο το εγκεκριμένο ιστορικό και μπορεί να διαφέρει από την κίνηση περιόδου.
5. Excel (.xlsx): ανοίξτε το πραγματικό αρχείο με φύλλα Προμηθευτές και Πληροφορίες. Οι τιμές εξάγονται με την υπάρχουσα ακρίβεια, το UI εμφανίζει δύο δεκαδικά. Τα ΑΦΜ παραμένουν κείμενο.
6. PDF / Εκτύπωση: ανοίγει εκτυπώσιμη HTML αναφορά με τα ίδια φίλτρα, σειρές και σύνολα, A4 οριζόντια. Επιτρέψτε το αναδυόμενο παράθυρο εάν μπλοκάρεται. Η αποθήκευση σε PDF/φυσική εκτύπωση γίνεται από τον browser· δεν επαληθεύτηκε στον συγκεκριμένο LAB έλεγχο.

## Πρόσβαση και όρια

Υφιστάμενοι ρόλοι Super Admin, Owner, Admin και Manager, με υπάρχοντα tenant/company permissions. Πραγματικά δοκιμάστηκε Super Admin στην LAB εταιρεία. Τα αποτελέσματα και οι εξαγωγές είναι αναφορά υπαρχόντων δεδομένων: δεν δημιουργούν πληρωμή, πιστωτικό, συμψηφισμό, έγκριση, οριστικοποίηση, κίνηση stock ή λογιστική/φορολογική πράξη. Οι λοιπές λειτουργίες Προμηθευτών παραμένουν χωριστές.

## Αν λείπει η καρτέλα

Ctrl+F5 και ανανέωση. Ελέγξτε exact /api/health revision, frontend cache, ρόλο/εταιρεία και viewport. Στο PR #1580 διορθώθηκε μόνο η παράλειψη του αρχικού κουμπιού balances· δεν χρειάζεται προηγούμενο άνοιγμα Τιμολογίων. Μην δημιουργείτε πληρωμές ή διορθώσεις δεδομένων για να ελέγξετε μια αναφορά.

## 07/10/2026 — ανεξάρτητη συμφωνία αναφοράς LAB

07/10/2026 20:31 Europe/Athens — Printed No19 / tracker21 scoped LAB PASS for independent DB reconciliation. Exact live health6c6ad0412684ac8d577a841c8c206df7b700b395. LAB companycmtpopbgk000prhb5qc60zxus/storecmtpopbgo000trhb5ng9ytiru, Super Admin Χρήστος Μάνης. Existing year01Jan–07Oct, all suppliers/blank search:58 unique visible names/AFMs and348 amounts agree at displayed cent precision with independent SQL grouped by supplier (290 period amounts +58 all-history balances).8 approved documents and13 unreversed supplier payments included;0 adjustments. Invoice1859.4862, credit4.2714,payments4914.70,period/all-history−3059.4852. Company-wide12 approved docs total2110.7262 differs because4 belong to inactive suppliers; report active-only criterion explicitly applied, no defect or data change. Before17:26:11Z/after17:29:20Z: companytransactions102,stockmovements74,KioskAuditEvent0 and both open MAIN/LABPOS02 cash0/card0/expenses0/opening1/0.50 exactly unchanged. Only read-only report navigation/GETs; support-access authentication metadata separate. No purchase/payment/approval/finalization/stock action. Prior01Octscreen/XLSX/HTML PASS preserved. Saved browser PDF and physical printer NOT TESTED; No19 remains OPEN assignedsameowner, next action user saves existing PDF/Εκτύπωση output and uploads actual file for text/render QA, then paper acceptance. Existing endpoint returns printableHTML; native savedPDF via browser expected, no speculative new dependency/source change.

Επαληθευμένη χρήση: Επιλέξτε ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ → Προμηθευτές → € Ποσά / Πιστωτικά → Τρέχον έτος, όλοι οι προμηθευτές και κενή αναζήτηση. Ελέγξτε58γραμμές και τα παραπάνω σύνολα. Η αναφορά αφορά όλους τους ενεργούς προμηθευτές της επιλεγμένης εταιρείας, όχι αποκλειστικά ένα κατάστημα. Για ανεξάρτητη SQL σύγκριση εφαρμόστε εταιρεία/active/statusAPPROVED/ημερομηνίαπαραστατικού, ενεργές μηαντιλογισμένεςπληρωμές/ημερομηνίακίνησης και χωριστό all-history υπόλοιπο. Καμία αλλαγή υπολοίπου για συμφωνία αναφοράς.
