# Εργασία #18 — Μετάβαση εξωτερικού backup σε Backblaze B2

Κατάσταση: **CODE + TARGETED TESTS PASS · AWAITING CI / EXTERNAL SETUP / LIVE RUN**

## Αιτία

- Το Render cron δημιουργήθηκε και εκτελείται κάθε τρεις ώρες.
- Οι πρώτες έξι προγραμματισμένες εκτελέσεις απέτυχαν fail-closed πριν από το
  `pg_dump`, επειδή δεν υπήρχε `AWS_REGION`. Δεν δημιουργήθηκε archive και δεν
  έγινε restore ή αλλαγή δεδομένων.
- Η δημιουργία/σύνδεση AWS λογαριασμού παρέμεινε μπλοκαρισμένη. Επιλέχθηκε
  Backblaze B2 ως S3-compatible off-site storage με version history,
  κρυπτογράφηση και Object Lock.

## Αλλαγή

- Προστέθηκε υποχρεωτικό `S3_ENDPOINT_URL` σε Render και backup job.
- Όλες οι AWS CLI S3 κλήσεις χρησιμοποιούν το ακριβές Backblaze endpoint και
  την περιοχή του bucket.
- Παραμένουν υποχρεωτικοί οι έλεγχοι bucket access, versioning και encryption.
- Παραμένουν αμετάβλητα το 3ωρο schedule, signed monitoring, SHA-256, έλεγχος
  απομακρυσμένου μεγέθους και `pg_restore --list` χωρίς σύνδεση σε βάση.

## Ασφάλεια και εκκρεμότητες

- Κανένα credential ή secret δεν αποθηκεύτηκε στο repository.
- Κανένα πραγματικό restore, upload ή αλλαγή production δεδομένων δεν έγινε.
- Απαιτούνται Backblaze account, ιδιωτικό B2 bucket με Object Lock, bucket-only
  application key, Render secrets, manual run και ανεξάρτητο download/dry-run.
- Μέχρι τότε η Εργασία #18 παραμένει **NOT LIVE PASS**.

