# 2026-09-13 — efood / Pelican Indirect POS — LAB-only Phase A

## Κατάσταση

- **Branch:** `feat/efood-pelican-lab-validation`
- **Βάση έναρξης:** `main` commit `93550e30ee4136e6f2a9ae5ffeef1e4ba3582135`
- **Κατάσταση:** `ΣΕ ΔΟΚΙΜΗ`
- **Περιβάλλον δοκιμών:** αποκλειστικά `MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ`
- **Test vendor:** αναμονή από efood
- **Production ενεργοποίηση:** ΟΧΙ

## Υλοποίηση

- Η Phase A της συμφωνημένης `Indirect POS Integration` μέσω Pelican μεταφέρθηκε καθαρά σε branch από το σημερινό `main`.
- Το server ελέγχει υποχρεωτικά εταιρεία και κατάστημα. Αποθήκευση efood ρύθμισης, mock webhook, mappings και Catalog/Promo/Orders previews απορρίπτονται με `EFOOD_LAB_ONLY` εκτός του μόνιμου LAB.
- Το ίδιο LAB gate εφαρμόζεται ξανά μέσα στην καταγραφή webhook event και στη δημόσια Pelican διαδρομή.
- Στον Super Admin προστέθηκε μία πλήρης ασφαλής LAB δοκιμή:
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
- Δεν υπάρχει endpoint ενεργοποίησης.
- Δεν δημιουργείται `OnlineOrder` ή `Sale`.
- Δεν αλλάζει stock, τιμή ή προσφορά.
- Δεν καταχωρίζεται πληρωμή.
- Δεν καλείται RBS, CapDriver ή EFTPOS.
- Δεν εκδίδεται φορολογικό παραστατικό.
- Δεν γίνεται πραγματική κλήση προς efood.

## Έλεγχοι

- Node syntax checks στα server αρχεία: PASS πριν από το push.
- JSX parse της οθόνης Super Admin: PASS πριν από το push.
- efood foundation tests με LAB gate: εκκρεμούν στο CI.
- Πλήρες GitHub CI, isolated PostgreSQL και HTTP E2E: εκκρεμούν.
- Live Super Admin LAB mock validation: μετά το deploy.

## Επόμενα βήματα

1. Πράσινο CI.
2. Merge στο κεντρικό `main` μόνο μετά από τον προβλεπόμενο τελικό συγχρονισμό.
3. Render deploy.
4. Εκτέλεση «Πλήρης ασφαλής LAB δοκιμή» αποκλειστικά στο `MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ`.
5. Παραλαβή test Vendor ID, portal access, sandbox credentials και webhook Authorization από efood πριν από πραγματικό sandbox event.
