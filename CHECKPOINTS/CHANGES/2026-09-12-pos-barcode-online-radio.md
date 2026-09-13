# Checkpoint — POS Barcode / Online Ράδιο

Branch: `feat/pos-barcode-registration`

## Ολοκληρωμένα πακέτα

- Νέα POS καρτέλα ελέγχου και καταχώρησης barcode.
- Πολλά barcode με προαιρετική ξεχωριστή τιμή πάνω στο ίδιο προϊόν και κοινό stock.
- Tenant/store validation, duplicate conflict με όνομα προϊόντος και audit.
- Αίτημα έγκρισης τιμής όταν ο χειριστής δεν έχει `changeRetail`.
- Καταγραφή του πραγματικά σαρωμένου barcode στη `SaleLine`.
- Εσωτερικός Online Radio player με module/store/station gates και αποθήκευση τελευταίου σταθμού/έντασης ανά τερματικό.
- Το `ONLINE_RADIO` προστέθηκε στον εμπορικό κατάλογο modules και υποστηρίζει ενεργοποίηση ανά κατάστημα.
- Super Admin API για δημιουργία/επεξεργασία/απενεργοποίηση HTTPS radio streams και store allow-list.
- Owner/BackOffice API για επιλογή επιτρεπόμενων σταθμών μόνο όταν το πληρωμένο module είναι ενεργό.
- Ολοκληρωμένη έγκριση/απόρριψη αιτημάτων τιμής με row lock, reviewer και audit.
- Αναφορά ανά κατάστημα και περίοδο με συνολικά προϊόντος και ανάλυση ποσότητας/τζίρου ανά σαρωμένο barcode.
- Καμία αλλαγή σε fiscal, Netlink, RBS, CapDriver ή πραγματική ταμειακή.

## Έλεγχοι

- `npm run build`: PASS.
- Πλήρης server suite: 1123/1123 PASS.
- `npm run build:server`: PASS.
- Στοχευμένα barcode/radio contract tests: PASS (6 νέα tests).
- `npm run build:server`: PASS.
- `npm run build`: PASS.

## Ακριβές επόμενο βήμα

1. Προσθήκη οθονών BackOffice/Super Admin πάνω στα ολοκληρωμένα management APIs.
2. Τοπικό commit και αναμονή ρητής έγκρισης για push/PR.
