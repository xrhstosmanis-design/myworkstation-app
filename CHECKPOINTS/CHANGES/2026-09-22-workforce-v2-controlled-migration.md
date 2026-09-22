# 2026-09-22 — Workforce V2 ελεγχόμενη μεταφορά εργαζομένων — LAB FAIL / LOCAL PASS

## Πραγματικό LAB εύρημα

- Η εταιρεία MYWORKSTATION LAB αναφέρει 7 παλιούς εργαζομένους.
- Το Workforce V2 έχει μόνο 2 συνδεδεμένους εργαζομένους.
- Η read-only προεπισκόπηση βρήκε 5 εργαζομένους για έλεγχο: Άγγελος, Γιώργος, Κωνσταντίνα, Νωπή και Σπύρος.
- Η Κωνσταντίνα διαβάζεται σωστά από την παλιά βάση ως 4 ημέρες / 32 ώρες.
- Δεν υπήρχε κουμπί εφαρμογής, επομένως δεν έγινε καμία πραγματική μεταφορά στο LAB.

## Bounded change

- Επιλογή μόνο των επιθυμητών γραμμών της προεπισκόπησης.
- Ρητή επιβεβαίωση και αιτιολογία πριν από apply.
- Νέος υπολογισμός ολόκληρης της προεπισκόπησης στον server και ακριβής σύγκριση `previewHash`.
- Fail-closed απόρριψη stale preview, blocked row, already-linked row ή πιθανού διπλοτύπου.
- Δημιουργία ή επαναχρησιμοποίηση ρόλου από την παλιά θέση μόνο για επιβεβαιωμένες γραμμές.
- Δημιουργία Workforce employee με μόνιμο `legacyEmployeeId`, role assignment και store access.
- Audit ανά ρόλο, ανά εργαζόμενο και συνολικά για τη μεταφορά.
- Μία database transaction: καμία μερική μεταφορά αν αποτύχει κάποια γραμμή.

## Safety boundaries

- Apply μόνο από Platform Super Admin.
- Δεν αλλάζει ούτε διαγράφει τον παλιό εργαζόμενο.
- Δεν δημιουργεί ωρομίσθιο όταν δεν υπάρχει επαληθευμένη παλιά τιμή.
- Δεν αλλάζει PIN, POS credentials, δημοσιευμένο πρόγραμμα, παρουσίες ή μισθοδοσία.
- Unique `legacyEmployeeId` και duplicate guards αποτρέπουν δεύτερη μεταφορά.

## Required LAB

1. Νέα προεπισκόπηση στο ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ.
2. Επιλεγμένοι ακριβώς οι 5 μη συνδεδεμένοι εργαζόμενοι.
3. Επιβεβαίωση και εφαρμογή μία φορά.
4. Workforce V2: 7 εργαζόμενοι συνολικά, χωρίς διπλότυπα.
5. Κωνσταντίνα: 4 ημέρες / 32 ώρες και σωστή σύνδεση με το παλιό record.
6. Δεύτερη προεπισκόπηση: όλοι εμφανίζονται ήδη συνδεδεμένοι και δεν επιτρέπεται δεύτερη εφαρμογή.
7. Μόνο μετά από αυτό συνεχίζει η δοκιμή scheduler 4/32, 5/40 και 6/48.

## Local verification

- Server route syntax: PASS.
- Targeted Workforce tests: `17/17 PASS`.
- Full server suite: `1385/1385 PASS`.
- Client production build: PASS.
- Server route syntax and `git diff --check`: PASS.
- CI #2752: initial E2E FAIL because the previous flow asserted that no apply endpoint existed; updated to require Owner `403` and Platform Super Admin-only apply. Retest pending.
