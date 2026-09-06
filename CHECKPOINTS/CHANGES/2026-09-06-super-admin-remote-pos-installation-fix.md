# Checkpoint — Super Admin remote POS installation fix

Date: 2026-09-06

## Change

- Το Super Admin REMOTE / Installation Center επιλέγει συγκεκριμένο terminal, όπως το `LAB-POS-02`.
- Διορθώθηκε η αποστολή εργασίας «Απομακρυσμένη εγκατάσταση».
- Η φόρμα κρατά ασφαλή αναφορά πριν από το asynchronous request και δεν αποτυγχάνει στο reset μετά την απάντηση.
- Η εγκατάσταση απαιτεί αποδοχή στο πραγματικό αντίστοιχο PC.
- Δεν μεταδίδεται PIN και δεν αλλάζει fiscal, RBS, CapDriver ή EFTPOS ρύθμιση.

## Verification

- Το `LAB-POS-02` εμφανίζεται HEALTHY στο Installation Center μετά την ενεργοποίηση του terminal.
- Η προηγούμενη αποτυχία `Cannot read properties of null (reading 'reset')` αναπαράχθηκε και διορθώθηκε στον κώδικα.
- Επόμενο βήμα μετά από πράσινο CI: αποστολή της εργασίας από Super Admin, αποδοχή στο πραγματικό PC και επιβεβαίωση ότι το POS ανοίγει με τον Workforce εργαζόμενο.
