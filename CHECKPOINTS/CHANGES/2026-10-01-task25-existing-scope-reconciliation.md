# #25 — συμφιλίωση υπάρχοντος scope, 01/10/2026

Υπεύθυνη σελίδα: `codex/task25-pending-center-20261001`. Διοικητικός έλεγχος μόνο.

## Ευρήματα

- Main ελέγχου:186513e. Το αριθμημένο μητρώο δήλωνε γενικά OPEN, αλλά το checkpoint12/09 `2026-09-12-pending-center-chat.md` καταγράφει πραγματικό USER/LAB PASS μετά #751, CI1916, merge9080739a.
- Υπάρχουν `PendingCenterPanel.jsx`, καρτέλα CommerceHub με PENDING_CENTER gate και `/api/pending-center/chat-tasks` GET/PATCH.
- Το scope είναι Chat tasks μόνο στην ενεργή εταιρεία, φίλτρα OPEN/COMPLETED/ALL και κατάστημα, ίδια server-side εγγραφή, actor/time και Audit για κλείσιμο/επαναφορά. Owner/SuperAdmin access και module guard παραμένουν αμετάβλητα.
- Το νεότερο manual Chat01/10 κρατά διαχείριση/ανάθεση μέσα στο Chat OPEN. Δεν ταυτίζεται με νέο PASS όλων των task λειτουργιών ή Push. Οι #16/#17 παραμένουν ανατεθειμένες στην υπάρχουσα υπεύθυνη σελίδα.

## Έλεγχοι και όρια

- Στατικός έλεγχος route/UI και το υπάρχον `server/test/pending-center-chat.test.js`:1 PASS,0FAIL. Αυτό δεν είναι API runtime test ή νέο LAB PASS.
- Δεν συνδεθήκαμε σε παραγωγή, δεν δημιουργήσαμε/κλείσαμε/επαναφέραμε task και δεν εκτελέσαμε οικονομική ή stock πράξη.
- Δεν είναι γνωστά από το ιστορικό checkpoint exact deployed hash, terminal/operator, task ID ή before/after counts. Δεν συμπληρώνονται με εικασίες και δεν επαναλαμβάνεται η παλιά πράξη για τεκμηρίωση.
- Σημερινή live εμφάνιση, Owner adversarial API, άλλες πηγές (πληρωμές/τιμολόγια/stock) NOT TESTED.
- Μόνο documentation/manual/PDF συμφιλίωση. Δεν απαιτείται νέο runtime deploy. PR CI και merge εκκρεμούν.

## Επόμενη ενέργεια

Χρησιμοποιούμε την υπάρχουσα καρτέλα χωρίς δεύτερη υλοποίηση. Επέκταση σε άλλες πηγές χρειάζεται ξεχωριστά ορισμένο scope και δεν κλείνει τις #16/#17.
