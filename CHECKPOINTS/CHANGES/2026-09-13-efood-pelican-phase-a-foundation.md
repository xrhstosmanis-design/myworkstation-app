# 2026-09-13 — efood / Pelican Indirect POS — LAB-only Phase A

## Τελική κατάσταση κώδικα

- **Κεντρικό `main`:** `eb97190ed24b4e50178c6e90e374863e5737f18b`
- **PR #775:** συγχωνεύτηκε επιτυχώς με squash merge.
- **CI #1972:** PASS πριν από το merge.
- **CI #1973:** PASS πάνω στο πραγματικό merge commit του `main`.
- **Παλαιό draft PR #758:** έκλεισε χωρίς merge ως αντικατασταθέν.
- **Κατάσταση:** `ΥΛΟΠΟΙΗΘΗΚΕ ΣΤΟ MAIN · AUTOMATED PASS · ΑΝΑΜΟΝΗ LIVE LAB MOCK`.
- **Περιβάλλον δοκιμών:** αποκλειστικά `MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ`.
- **Test vendor:** αναμονή από efood.
- **Production ενεργοποίηση:** ΟΧΙ.

## Υλοποιήθηκε

- Η συμφωνημένη `Indirect POS Integration` μέσω Pelican προστέθηκε ως fail-closed Phase A στο ενιαίο MyWorkStation.
- Ο server επαληθεύει υποχρεωτικά ότι η εταιρεία και το κατάστημα είναι ακριβώς `MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ`.
- Αποθήκευση efood ρύθμισης, mock webhook, product mappings, Catalog/Promo/Orders previews και δημόσιο Pelican webhook απορρίπτονται με `EFOOD_LAB_ONLY` εκτός LAB.
- Credentials και raw payloads κρυπτογραφούνται με AES-256-GCM και δεν επιστρέφονται στο UI.
- Το Authorization ελέγχεται με constant-time σύγκριση.
- Τα events διαθέτουν payload hash και idempotency key.
- Evidence, mappings και previews είναι company/store scoped.
- Product mapping επιτρέπεται μόνο σε προϊόν της ίδιας εταιρείας που υπάρχει στο ίδιο LAB store.
- Στον Platform Super Admin προστέθηκε μία πλήρης ασφαλής LAB δοκιμή:
  1. `READY_FOR_PICKUP`
  2. επανάληψη ίδιου event για idempotency
  3. `CANCELLED`
  4. local Catalog preview
  5. local Promo preview
  6. local Orders recovery preview
  7. readiness/evidence έλεγχος
- Η οθόνη efood δεν εμφανίζει φόρμα ή κουμπί δοκιμής σε ΚΑΤ ή άλλο πραγματικό κατάστημα.

## Fail-closed όρια

- `enabled=false`
- `externalCallsEnabled=false`
- `sandboxValidatedAt=NULL`
- Δεν υπάρχει endpoint ενεργοποίησης στη Phase A.
- Δεν δημιουργείται `OnlineOrder` ή `Sale`.
- Δεν αλλάζει stock, τιμή ή προσφορά.
- Δεν καταχωρίζεται πληρωμή.
- Δεν καλείται RBS, CapDriver ή EFTPOS.
- Δεν εκδίδεται φορολογικό παραστατικό.
- Δεν γίνεται πραγματική κλήση προς το efood.

## Αυτοματοποιημένοι έλεγχοι

- Node syntax checks: PASS.
- JSX parse: PASS.
- efood foundation και LAB-gate regression tests: PASS.
- Checkpoint policy: PASS.
- Prisma preparation: PASS.
- Security/licensing suite: PASS.
- Client production build: PASS.
- Work και Render build contracts: PASS.
- Όλα τα KAT safety/pre-install invariants: PASS.
- Isolated PostgreSQL preparation: PASS.
- Πραγματικά HTTP E2E flows: PASS.

## Εκκρεμότητες

1. Επιβεβαίωση ότι το Render εξυπηρετεί το `main` `eb97190e`.
2. Live πάτημα `Πλήρης ασφαλής LAB δοκιμή` μόνο από Platform Super Admin στο μόνιμο LAB.
3. Καταγραφή `LAB MOCK PASS` στο checkpoint μετά την πραγματική οθόνη.
4. Παραλαβή test Vendor ID, portal access, sandbox credentials και webhook Authorization από efood.
5. Νέα ρητή έγκριση πριν από live sandbox webhook ή πραγματικό API call.
