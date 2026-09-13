# ACTIVE CHECKPOINT

- Ημερομηνία: 2026-09-13
- Εργασία: efood / Pelican Indirect POS — LAB-only Phase A
- Branch: `feat/efood-pelican-lab-validation`
- Βάση συγχρονισμού: `main` `7f93bb9fea7a3b57ace7a273981354098cb31b76`
- Κατάσταση: ΣΕ ΔΟΚΙΜΗ — αναμονή CI, merge/deploy και live LAB mock validation
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-13-efood-pelican-phase-a-foundation.md`

## Υποχρεωτικό LAB scope

- Όλη η efood/Pelican προετοιμασία και κάθε δοκιμή εκτελούνται μόνο στο `MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ`.
- Ο server απορρίπτει ρύθμιση, mock event, mapping ή preview σε οποιοδήποτε άλλο κατάστημα.
- ΚΑΤ και πραγματικά καταστήματα δεν αγγίζονται.

## Fail-closed όρια

- Μόνο local mock και SANDBOX previews.
- Καμία πραγματική κλήση efood.
- Καμία παραγγελία, πώληση, αλλαγή stock/τιμής/προσφοράς, πληρωμή ή φορολογική έκδοση.
- Καμία κλήση RBS / CapDriver / EFTPOS.

## Επόμενο βήμα

1. Πλήρες πράσινο GitHub CI.
2. Deploy της fail-closed Phase A.
3. Super Admin → `MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ` → «Πλήρης ασφαλής LAB δοκιμή».
4. Αναμονή test vendor από efood πριν από πραγματικό sandbox event.
