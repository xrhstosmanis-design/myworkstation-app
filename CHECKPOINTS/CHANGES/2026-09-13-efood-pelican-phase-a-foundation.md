# 2026-09-13 — efood / Pelican Indirect POS — LAB-only Phase A

## Τελική κατάσταση

- **Λειτουργικό merge:** `eb97190ed24b4e50178c6e90e374863e5737f18b` μέσω PR `#775`.
- **Checkpoint merge:** `317dcf9b9a8187f8274b93ebe3624412c1ad2d3e` μέσω PR `#780`.
- **Τρέχον deployed `main`:** `b6262b8ffc95a51b93c5129ad1ec822b20422aac`.
- **CI #1972, #1973, #1985 και #1987:** PASS.
- **Render workflow #1054:** PASS.
- **Render exact revision gate:** `Wait for exact production revision` — PASS.
- **Παλαιό draft PR #758:** έκλεισε χωρίς merge ως αντικατασταθέν.
- **Κατάσταση:** `ΥΛΟΠΟΙΗΘΗΚΕ · MAIN PASS · RENDER PASS · ΑΝΑΜΟΝΗ LIVE LAB MOCK`.
- **Περιβάλλον δοκιμών:** αποκλειστικά `MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ`.
- **Test vendor:** αναμονή από efood.
- **Production efood ενεργοποίηση:** ΟΧΙ.

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
- Render deploy hook, rollback checkpoint και exact production revision: PASS.

## Επόμενο υποχρεωτικό βήμα

1. Platform Super Admin → `MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ` → `Ασφαλείς διασυνδέσεις καταστήματος`.
2. Αν δεν υπάρχει ακόμη εγγραφή efood, πάτημα `Προετοιμασία efood στο LAB` χωρίς πραγματικά credentials.
3. Πάτημα `Πλήρης ασφαλής LAB δοκιμή`.
4. Αναμενόμενο αποτέλεσμα: `LAB MOCK PASS`, replay idempotent `true` και External call / Order / Sale / Stock / Payment / Fiscal = `ΟΧΙ`.
5. Καταγραφή του live PASS στο checkpoint.
6. Παραλαβή test Vendor ID, portal access, sandbox credentials και webhook Authorization από efood.
7. Νέα ρητή έγκριση πριν από live sandbox webhook ή πραγματικό API call.
