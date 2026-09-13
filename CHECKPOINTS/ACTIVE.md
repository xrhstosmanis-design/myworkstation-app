# ACTIVE CHECKPOINT

- Ημερομηνία: 2026-09-13
- Εργασία: efood / Pelican Indirect POS — LAB-only Phase A
- Λειτουργικό merge: `eb97190ed24b4e50178c6e90e374863e5737f18b` μέσω PR `#775`
- Checkpoint merge: `317dcf9b9a8187f8274b93ebe3624412c1ad2d3e` μέσω PR `#780`
- Τρέχον deployed `main`: `b6262b8ffc95a51b93c5129ad1ec822b20422aac`
- CI: `#1972`, `#1973`, `#1985` και `#1987` — PASS
- Render deployment: workflow `#1054` — PASS, μαζί με `Wait for exact production revision`
- Κατάσταση: ΥΛΟΠΟΙΗΘΗΚΕ · MAIN PASS · RENDER PASS · ΑΝΑΜΟΝΗ LIVE LAB MOCK
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-13-efood-pelican-phase-a-foundation.md`

## Υποχρεωτικό LAB scope

- Όλη η efood/Pelican προετοιμασία και κάθε δοκιμή εκτελούνται μόνο στο `MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ`.
- Ο server απορρίπτει ρύθμιση, mock event, mapping, preview ή webhook σε οποιοδήποτε άλλο κατάστημα.
- Το ΚΑΤ και όλα τα πραγματικά καταστήματα παραμένουν εκτός δοκιμών.

## Fail-closed όρια

- Επιτρέπονται μόνο local mock events και SANDBOX previews.
- Δεν πραγματοποιείται κλήση προς το efood.
- Δεν δημιουργείται παραγγελία ή πώληση.
- Δεν αλλάζουν stock, τιμές ή προσφορές.
- Δεν καταχωρίζεται πληρωμή και δεν καλούνται RBS, CapDriver ή EFTPOS.
- Δεν εκδίδεται φορολογικό παραστατικό.

## Επόμενο βήμα

1. Platform Super Admin → `MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ` → `Ασφαλείς διασυνδέσεις καταστήματος`.
2. Αν δεν υπάρχει ακόμη εγγραφή efood, πάτημα `Προετοιμασία efood στο LAB` χωρίς πραγματικά credentials.
3. Πάτημα `Πλήρης ασφαλής LAB δοκιμή`.
4. Αναμενόμενο αποτέλεσμα: `LAB MOCK PASS`, replay idempotent `true` και External call / Order / Sale / Stock / Payment / Fiscal = `ΟΧΙ`.
5. Αναμονή test Vendor ID, portal access, sandbox credentials και webhook Authorization από efood πριν από πραγματικό sandbox event.
