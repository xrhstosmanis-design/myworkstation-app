# ACTIVE CHECKPOINT

- Ημερομηνία: 2026-09-13
- Εργασία: efood / Pelican Indirect POS — Phase A fail-closed foundation
- Branch: `feat/efood-pelican-foundation`
- Βάση branch: σημερινό `main` `ce9c3863a90e5878dcbcebcf57ddfc15fa5c2edf`
- Draft PR: `#758`
- Κατάσταση: ΣΕ ΔΟΚΙΜΗ — CI #1952 PASS σε όλα τα gates· εκκρεμούν μόνο LAB mock validation και test vendor από efood
- Checkpoint αλλαγών: `CHECKPOINTS/CHANGES/2026-09-13-efood-pelican-phase-a-foundation.md`

## Όρια της εγκεκριμένης εργασίας

- Επιτρέπεται μόνο ασφαλής προετοιμασία SANDBOX, local mocks, κρυπτογραφημένη αποθήκευση, idempotency και tenant/store-scoped mappings/previews.
- Απαγορεύεται πραγματική κλήση efood, ενεργό live webhook, δημιουργία παραγγελίας/πώλησης, αλλαγή stock/τιμής/προσφοράς, πληρωμή ή φορολογική έκδοση.
- Δεν γίνεται merge στο `main` χωρίς νέα ρητή έγκριση.

## Επόμενο βήμα

1. Local mock έλεγχος μόνο στο `MYWORKSTATION LAB` και μόνο από Super Admin.
2. Αναμονή test Vendor ID / portal / sandbox credentials / Authorization από efood.
3. Νέα ρητή έγκριση πριν από live sandbox webhook, πραγματικό API call ή merge στο `main`.
