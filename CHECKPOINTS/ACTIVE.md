# ACTIVE CHECKPOINT

- Ημερομηνία: 2026-09-13
- Εργασία: efood / Pelican Indirect POS — Phase A fail-closed foundation
- Branch: `feat/efood-pelican-foundation`
- Βάση branch: `main` `143b4e197c6eebafab79a4410160ca820b6c32c1`
- Κατάσταση: ΣΕ ΔΟΚΙΜΗ — αναμονή πλήρους GitHub CI και test vendor από efood
- Checkpoint αλλαγών: `CHECKPOINTS/CHANGES/2026-09-13-efood-pelican-phase-a-foundation.md`

## Όρια της εγκεκριμένης εργασίας

- Επιτρέπεται μόνο ασφαλής προετοιμασία SANDBOX, local mocks, κρυπτογραφημένη αποθήκευση, idempotency και tenant/store-scoped mappings/previews.
- Απαγορεύεται πραγματική κλήση efood, ενεργό live webhook, δημιουργία παραγγελίας/πώλησης, αλλαγή stock/τιμής/προσφοράς, πληρωμή ή φορολογική έκδοση.
- Δεν γίνεται merge στο `main` χωρίς πράσινο πλήρες CI και νέα ρητή έγκριση.

## Επόμενο βήμα

1. Δημιουργία draft PR και πλήρες CI.
2. Μετά από PASS, local mock έλεγχος μόνο στο `MYWORKSTATION LAB`.
3. Αναμονή test Vendor ID / portal / sandbox credentials / Authorization από efood.
