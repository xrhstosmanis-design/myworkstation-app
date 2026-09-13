# ACTIVE CHECKPOINT

- Ημερομηνία: 2026-09-13
- Εργασία: efood / Pelican Indirect POS — LAB-only Phase A
- Κεντρικό `main`: `eb97190ed24b4e50178c6e90e374863e5737f18b`
- PR: `#775` — MERGED
- CI: `#1972` πριν από το merge και `#1973` πάνω στο `main` — PASS
- Κατάσταση: ΥΛΟΠΟΙΗΘΗΚΕ ΣΤΟ MAIN · AUTOMATED PASS · ΑΝΑΜΟΝΗ LIVE LAB MOCK
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

1. Επιβεβαίωση ότι το Render εξυπηρετεί το `main` `eb97190e`.
2. Platform Super Admin → `MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ` → `Ασφαλείς διασυνδέσεις καταστήματος` → `Πλήρης ασφαλής LAB δοκιμή`.
3. Αναμενόμενο αποτέλεσμα: `LAB MOCK PASS`, replay idempotent `true` και External call / Order / Sale / Stock / Payment / Fiscal = `ΟΧΙ`.
4. Αναμονή test Vendor ID, portal access, sandbox credentials και webhook Authorization από efood πριν από πραγματικό sandbox event.
