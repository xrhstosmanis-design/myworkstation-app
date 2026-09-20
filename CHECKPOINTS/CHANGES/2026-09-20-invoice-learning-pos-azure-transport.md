# Invoice Learning — κοινή Azure μεταφορά με το POS

## Πραγματική κατάσταση πριν την αλλαγή

- **POS Azure reader: LAB PASS.** Η ίδια Azure Document Intelligence υποδομή διαβάζει τιμολόγια από το POS.
- **Invoice Learning Azure request: LAB FAIL.** Το Learning Lab επέστρεψε `ACCESS_403` πριν από κανονικοποίηση του παραστατικού.
- **Ασφάλεια: LAB PASS.** Η αποτυχία έμεινε fail-closed· δεν δημιουργήθηκε μερικό αποτέλεσμα ή draft και δεν έγινε πληρωμή, stock, approval/finalization, fiscal, accounting ή myDATA μεταβολή.

## Αιτία και περιορισμένη αλλαγή

Το Invoice Learning είχε δικό του αντίγραφο της Azure μεταφοράς, παράλληλα με την ήδη λειτουργική υλοποίηση του POS. Η διπλή υλοποίηση επέτρεπε απόκλιση σε endpoint construction, API-key upload και polling.

- Αφαιρέθηκε μόνο το τοπικό `callAzureOnce` του Invoice Learning.
- Το Lab καλεί πλέον το exported `callAzure` από `commerce-azure-invoice-reader.js`, δηλαδή ακριβώς την ίδια μεταφορά που χρησιμοποιεί το POS.
- Τα bounded retries και η ασφαλής δημόσια ταξινόμηση σφαλμάτων του Lab παραμένουν.
- Η supplier-specific κανονικοποίηση, το hybrid merge και ο οικονομικός fail-closed verifier του Invoice Learning δεν αλλάζουν.

## Προστατευμένα invariants

- Δεν αλλάζουν Azure endpoint/key ή networking ρυθμίσεις.
- Δεν αλλάζει η λειτουργική ροή του POS.
- Δεν δημιουργείται κενό ή μερικό draft μετά από provider failure.
- Καμία πληρωμή, πίστωση, αποθήκη, έγκριση, οριστικοποίηση, fiscal, accounting ή myDATA ενέργεια.

## Έλεγχοι και κατάσταση

- Πλήρες τοπικό server suite: `316/316` PASS.
- Νέος regression έλεγχος επιβεβαιώνει ότι το Invoice Learning εισάγει και καλεί την κοινή POS Azure μεταφορά και δεν διατηρεί δεύτερο `callAzureOnce`.
- **AWAITING CI / DEPLOY / LAB — δεν χαρακτηρίζεται fixed.**

LAB PASS απαιτεί exact deployed revision και επανάληψη του ίδιου upload στο Invoice Learning: η Azure κλήση πρέπει να ολοκληρωθεί χωρίς `ACCESS_403`. Το τελικό περιεχόμενο εξακολουθεί να περνά από την υπάρχουσα πλήρη οικονομική συμφωνία· ασφαλές `NO_SAFE_RESULT` παραμένει έγκυρη fail-closed έκβαση όταν οι γραμμές δεν συμφωνούν.
