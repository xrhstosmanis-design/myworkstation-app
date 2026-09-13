# ACTIVE CHECKPOINT

- Ημερομηνία: 2026-09-13
- Εργασία: efood / Pelican Indirect POS — Phase A fail-closed foundation
- Branch: `feat/efood-pelican-foundation`
- Βάση branch: σημερινό `main` `40f33c9881ee6c9753e3b6b23d26c68fd381a050`
- Draft PR: `#758`
- Κατάσταση: ΣΕ ΔΟΚΙΜΗ — αναμονή πλήρους GitHub CI, LAB mock validation και test vendor από efood
- Checkpoint αλλαγών: `CHECKPOINTS/CHANGES/2026-09-13-efood-pelican-phase-a-foundation.md`

## Όρια της εγκεκριμένης εργασίας

- Επιτρέπεται μόνο ασφαλής προετοιμασία SANDBOX, local mocks, κρυπτογραφημένη αποθήκευση, idempotency και tenant/store-scoped mappings/previews.
- Απαγορεύεται πραγματική κλήση efood, ενεργό live webhook, δημιουργία παραγγελίας/πώλησης, αλλαγή stock/τιμής/προσφοράς, πληρωμή ή φορολογική έκδοση.
- Δεν γίνεται merge στο `main` χωρίς πράσινο πλήρες CI και νέα ρητή έγκριση.

## Επόμενο βήμα

1. Πλήρες GitHub CI στο draft PR #758.
2. Μετά από PASS, local mock έλεγχος μόνο στο `MYWORKSTATION LAB`.
3. Αναμονή test Vendor ID / portal / sandbox credentials / Authorization από efood.
