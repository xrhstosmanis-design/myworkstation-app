# Gate 8 — lifecycle χειριστών και κεντρικό Audit

Ημερομηνία: 25/09/2026
Κατάσταση: CI / DEPLOY / PRODUCTION READBACK PENDING — συνολικό Gate 8 OPEN

## Πραγματικά LAB αποτελέσματα

- PASS: Super Admin read-only έλεγχος λογαριασμού, ενεργού 2FA, recovery codes, συνεδριών και platform audit.
- PASS: οι πραγματικοί LAB χειριστές Employee/Seller έχουν POS πρόσβαση, χωρίς BackOffice ή Power User.
- PASS: προσωρινός Manager δημιουργήθηκε και μπήκε στο σωστό LAB POS/κατάστημα.
- PASS: μετά την απενεργοποίηση του προσωρινού Manager, η ενεργή POS συνεδρία ανακλήθηκε αμέσως και επέστρεψε στην είσοδο.
- PASS: ο ανενεργός λογαριασμός διατηρείται για ιστορικό αντί να διαγράφεται.
- PASS: το UI δεν εμφανίζει PIN ή πλήρη κωδικό κάρτας.
- FAIL: τα υπάρχοντα StoreOperatorAudit lifecycle rows αποκλείονταν από το κεντρικό endpoint Συμβάντων.

## Διόρθωση PR #1298

Το κεντρικό Audit περιλαμβάνει OPERATOR_CREATED, OPERATOR_PROFILE_UPDATED, OPERATOR_PIN_CHANGED, OPERATOR_PIN_RANDOMIZED, OPERATOR_DEACTIVATED, OPERATOR_LOGIN_PIN, OPERATOR_LOGIN_CARD και OPERATOR_LOGOUT. Η προβολή χρησιμοποιεί allow-list: employeeId, role, active, posAccess, backofficeAccess, cardLast4 και terminalPos. Δεν περνά PIN, hash, πλήρης κάρτα, password ή secret.

## Έλεγχοι

- node syntax check: PASS.
- Gate 8 lifecycle, login protection, session revalidation και role matrix: 13/13 PASS.
- Πλήρες repository CI: PENDING μετά την υποχρεωτική ενημέρωση checkpoint.
- Production readback των ήδη υπαρχόντων create/login/deactivate events: PENDING.

## Ανοιχτά

- Owner login και cross-tenant αρνητικές δοκιμές: NOT TESTED.
- Πραγματική λήξη άδειας/συνδρομής και store override: NOT TESTED.
- Συνολικό Gate 8 παραμένει OPEN μέχρι ενιαίο τελικό checkpoint.

Δεν αγγίζεται Gate 6 και δεν επανανοίγει Gate 7.
