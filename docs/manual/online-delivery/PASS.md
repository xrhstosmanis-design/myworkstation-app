# Online παραγγελίες και Delivery — Manual PASS

Ημερομηνία τελικής αποδοχής: 27/09/2026
Κατάσταση: **Gate 6 PASS / ΟΛΟΚΛΗΡΩΜΕΝΟ / ΚΛΕΙΔΩΜΕΝΟ**

## 12/10/2026 — Περιορισμένη νέα αστοχία προβολής βάρδιας στο LAB

Η ONL-003/ένα ίδιο ψημένο1.40EUR ολοκληρώθηκε από V2 «ΣΤΟ POS / ΠΛΗΡΩΜΗ» με normalPOScheckout και complete-from-pos. Ανεξάρτητα stock39→38/ψημένα14→13/raw25unchanged και cashLAB-POS-02+1.40/MAINunchanged παρατηρήθηκαν. Όμως το BackofficecountLAB-POS-02έμεινε2, τελευταία— και κατηγορίεςκενές. Αυτό επανανοίγει μόνο τη συμφωνία της συγκεκριμένης προβολής, δεν μετατρέπει τη νέα δοκιμή σε πλήρες PASS και δεν αναιρεί τα ακριβή τεκμήρια ONL-002 της27/09. Οικονομική/stockδιόρθωση ή επανάληψηδεν έγινε. Η παλιά standalone postCommercialSale δεν ήταν η πραγματική διαδρομή· είναι απενεργοποιημένη στο preparedserver.

Συνεχίστε με read-onlyέλεγχο της ίδιας ONL-003 και ρητή ανάθεση της προβολής πριν sourcefix, διατηρώντας terminalmapping/fiscal/idempotency/otherowners. Checkpoint CHECKPOINTS/CHANGES/2026-10-11-daily-baking-availability.md. Η πραγματική εγκατάσταση DAILY και δημόσιαενεργοποίηση δεν έχουν αποδοχή.

## Τι καλύπτει

Το παρόν manual αφορά τη γενική λειτουργία Online Ordering/Delivery του MyWorkStation. Δεν αφορά την εξωτερική διασύνδεση efood/Pelican, η οποία έχει δικά της credentials και ξεχωριστό κύκλο εργασιών.

Η online παραγγελία ανήκει σε ένα συγκεκριμένο κατάστημα και, κατά την παράδοση, δημιουργεί μία πραγματική εμπορική πώληση στο POS/ταμείο που έχει ρυθμιστεί για online/delivery. Δεν χρησιμοποιείται δεύτερο online απόθεμα: η ποσότητα αφαιρείται μία φορά από το κοινό απόθεμα του καταστήματος.

## Ρύθμιση πριν από τη λειτουργία

1. Από BackOffice → Εμπορική λειτουργία → Παράμετροι ορίζεται το POS/ταμείο online και delivery.
2. Το POS συνδέεται με τη σωστή φορολογική διαδρομή και, για πληρωμές κάρτας, με το σωστό Delivery EFTPOS.
3. Στο επιλεγμένο POS πρέπει να υπάρχει ανοικτή βάρδια. Αν η αντιστοίχιση λείπει ή είναι αμφίσημη, η ολοκλήρωση αποτυγχάνει κλειστά και δεν γράφει πώληση, πληρωμή ή stock.
4. Δεν επιτρέπεται σιωπηλή μετάπτωση στο `MAIN` ή σε άλλο terminal.

## Καθημερινή χρήση

1. Ανοίξτε BackOffice → Εμπορική λειτουργία → Λοιπές εμπορικές λειτουργίες → Online Παραγγελίες.
2. Ελέγξτε αριθμό παραγγελίας, πελάτη, τηλέφωνο, κατάστημα, τρόπο παράδοσης, προϊόντα, ποσότητες, σύνολο και τρόπο πληρωμής.
3. Προωθήστε την παραγγελία μόνο με την κανονική σειρά: Νέα → Αποδοχή → Ετοιμάζεται → Έτοιμη → Delivery → Παραδόθηκε.
4. Στην παράδοση επιλέξτε τον πραγματικό τρόπο πληρωμής:
   - **Μετρητά:** δημιουργείται πληρωμή CASH και δεν απαιτείται EFTPOS.
   - **Κάρτα:** η χρέωση δρομολογείται μόνο στο Delivery EFTPOS του ρυθμισμένου POS.
5. Μετά την ολοκλήρωση ανοίξτε τη γραμμή της παραγγελίας και ελέγξτε τους πέντε κρίκους: Παραγγελία → Πώληση, Φορολογική διαδρομή, EFTPOS, Κίνηση αποθέματος και Βάρδια. Όλοι πρέπει να εμφανίζονται `OK`.

## Τι πρέπει να εμφανίζει το readback

- Μία συνδεδεμένη πώληση `COMPLETED` με το ίδιο σύνολο της παραγγελίας.
- Το σωστό terminal online/delivery και τη σωστή συνεδρία βάρδιας.
- Τη φορολογική διαδρομή. Σε LAB μπορεί να είναι `NON_FISCAL`, δηλαδή καταγεγραμμένη δρομολόγηση χωρίς εξωτερική φορολογική εκτέλεση.
- Για μετρητά, EFTPOS «Δεν απαιτείται». Για κάρτα, το συγκεκριμένο Delivery EFTPOS.
- «ΑΠΕΥΘΕΙΑΣ ΑΦΑΙΡΕΣΗ» από το κοινό stock, με ποσότητα και, όταν υπάρχει ιστορικό warning, ακριβές πριν/μετά.
- Μία κίνηση βάρδιας με σωστό τρόπο πληρωμής και ποσό.
- Μηδενικά πιθανά duplicates.

## Ακύρωση, απόρριψη και επανάληψη

- Ακύρωση ή απόρριψη πριν από την παράδοση δεν πρέπει να δημιουργεί πώληση ή πληρωμή.
- Αν έχει ήδη γίνει εμπορική ολοκλήρωση, η διόρθωση γίνεται με την προβλεπόμενη επιστροφή και όχι με δεύτερη ολοκλήρωση της ίδιας παραγγελίας.
- Retry με το ίδιο αναγνωριστικό/idempotency key δεν πρέπει να δημιουργεί δεύτερη παραγγελία, πώληση, πληρωμή ή αφαίρεση αποθέματος.
- Μην ξαναπατάτε πληρωμή όταν η παραγγελία εμφανίζεται ήδη συνδεδεμένη με πώληση. Πρώτα κάντε readback.

## Έλεγχος ασφάλειας και απομόνωσης

- Κάθε παραγγελία, προϊόν, βάρδια και Audit ανήκει στο ίδιο κατάστημα/tenant.
- Ο χειριστής βλέπει και εκτελεί μόνο τις λειτουργίες που επιτρέπει ο ρόλος και το ενεργό module.
- Αν η άδεια, το module, το terminal, η fiscal ή η βάρδια δεν είναι έγκυρα, η ροή σταματά πριν από οικονομική ή stock μεταβολή.
- Οι ενέργειες καταγράφονται στο κεντρικό BackOffice → Συμβάντα με κατάστημα, χειριστή, περιγραφή και ποσό.

## Κριτήρια PASS

Το Gate θεωρείται PASS μόνο όταν το ίδιο ιστορικό τεκμήριο συμφωνεί σε Online Παραγγελίες, πώληση, πληρωμή, φορολογική διαδρομή, EFTPOS όπου απαιτείται, απόθεμα, βάρδια και κεντρικό Audit, χωρίς duplicate και χωρίς κίνηση σε μη εμπλεκόμενο POS.

Η τελική LAB αποδοχή έγινε με την `ONL-002`: 1 × ΝΕΡΟ 500ML (SKU 2269), 0,50 €, μετρητά, `LAB-POS-02`, `NON_FISCAL · LAB-FISCAL-02`, stock `−64 → −65`, μία `SALE_CASH` 0,50 €, 0 duplicates και `MAIN` 0 κινήσεις / 0,00 €. Production `1704865d05b649ac4ef3f8c9d6fc14f2d7144daa`, PR `#1377`, CI `#3513` PASS.

## Αντιμετώπιση προβλημάτων

- **Δεν ολοκληρώνεται η πληρωμή:** ελέγξτε ότι το ρυθμισμένο online/delivery POS έχει ανοικτή βάρδια και πλήρη fiscal/EFTPOS αντιστοίχιση.
- **Εμφανίζεται άλλο POS ή MAIN:** σταματήστε· μην επαναλάβετε την πληρωμή. Καταγράψτε παραγγελία, terminal, βάρδιες, stock και Audit πριν από νέα ενέργεια.
- **Εμφανίζεται πιθανό duplicate:** μην ξαναπατήσετε ολοκλήρωση. Συγκρίνετε το συνδεδεμένο sale ID, τις πληρωμές και τις κινήσεις stock.
- **Λανθασμένο stock:** ελέγξτε πρώτα το ιστορικό `POS_SALE_COMPLETED` και την atomic κίνηση κοινού stock. Μην κάνετε δεύτερη πώληση για να «διορθώσετε» την ποσότητα.
- **NON_FISCAL σε LAB:** είναι αναμενόμενο όταν η εγκατάσταση είναι εικονική. Δεν αποτελεί πραγματική φορολογική απόδειξη.

## Γνωστά όρια

- Η LAB λειτουργία είναι NON_FISCAL και δεν εκτελεί πραγματική φορολογική έκδοση ή πραγματική τραπεζική χρέωση.
- Η σύνδεση efood/Pelican δεν πιστοποιείται από αυτό το Gate.
- Παλιά ιστορικά FAIL/OPEN παραμένουν στα checkpoints για audit, αλλά έχουν αντικατασταθεί από το τελικό PASS και δεν αποτελούν ενεργή εργασία.

## 13/10/2026 — DAILY narrow regulated catalogue evidence

21:43 Athens LIVE READ-ONLY ONLINE ACCEPTANCE: guarded deploy38448447575 SUCCESS, Render dep-db77lotg1s2s739daefg LIVE on exact28050078015cb22679c55ca5ce8537378f1613e1; health oktrue exact revision in guard logs. Reloaded browser admin saved catalogue shows DB0000211.50→1.50, DB0000221.40→1.40, DB0000021.65→1.65, DB0000261.65→1.65, DB0000171.50→1.50. Control NESCAFE DB0000182.25→2.35 remains legacy/excluded. Publicenabled checkbox unchecked;0/8753 products online. No settings/products submit, no checkout. Actual final screenshot CHECKPOINTS/EVIDENCE/daily-regulated-20261013/online-freddo.jpg shows1.65→1.65; price screenshot store-freddo.jpg shows VAT13. Whole2054 OPEN. NEXT SINGLE ACTION: obtain named handoff/release of broader DAILY POS layout ownerPR2175 or have its owner publish; then add regulated category in free slot. Other water/toast/instant mapping remains pending. Current regulated owner retained until named handoff. No numbered manual PASS.

Canonical tracker PDF regenerated with repository generator:281 A4 pages /1103836bytes; last page text extraction verified. Included in same receipt PR; previous pending PDF remark superseded for this receipt. Scope remains OPEN with narrow native read-only evidence above.

Only administrative catalogue acceptance; no checkout or whole issue PASS. Prior ONL evidence retained.
