# BackOffice invoice stock selection

Omit the optional stock exclusion field when no lines are excluded. Cancellation still stops submission, and explicit non-empty exclusions are transmitted for existing server validation. The full posted-invoice reopen on the existing LAB passed for LAB-BACKOFFICE-FINAL-20261112. Reposting by the delegated operator awaits validation.

## 15/11/2026 — Κεντρική εγκατάσταση

- PR #3892, CI PR 43750379896 και CI main 43751596853 πέρασαν.
- Render deploy `dep-dbt0hirl550s739mnnkg` LIVE. Ο έλεγχος υγείας επιβεβαίωσε την ακριβή έκδοση `ab1d25d333d1626eece1f527f889b00f51ab8ab2` (workflow 43752933735).
- Επόμενο βήμα στο υπάρχον LAB: μία επανατιμολόγηση από εξουσιοδοτημένο χειριστή με όλα τα είδη επιλεγμένα για αποθήκη. Καταγραφή αρχικών και τελικών κινήσεων αποθήκης και κατάστασης τιμολογίου. Επανατιμολόγηση χειριστή: AWAITING LAB.

## 15/11/2026 21:51–21:53 Ελλάδας — Αρχικός έλεγχος LAB

- Επιβεβαιώθηκε προσωπική πρόσβαση `lab31` στο ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ μέσω BackOffice. Το `LAB-BACKOFFICE-FINAL-20261112` είναι «Νέα παραγγελία», 1 τεμάχιο `LAB3702-20261110-A`, σύνολο 1,24 €.
- Το αρχικό stock στο αρχείο ειδών και στην καρτέλα του ίδιου SKU είναι 0. Η στήλη «Ενημέρωση» δείχνει 20:14:05, χωρίς επιβεβαίωση ότι είναι η ώρα της τελευταίας κίνησης αποθήκης.
- Δεν έγινε οριστικοποίηση ή επανατιμολόγηση. Επόμενο βήμα: επιβεβαίωση της τελευταίας κίνησης του SKU από το ιστορικό του LAB και ανανέωση της αρχικής μέτρησης πριν από τη δοκιμή. AWAITING LAB.
