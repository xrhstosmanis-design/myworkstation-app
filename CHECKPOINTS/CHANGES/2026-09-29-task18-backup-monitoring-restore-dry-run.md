# Εργασία #18 — Backup ανά 3 ώρες, monitoring και restore dry-run

Κατάσταση: **CI + EXACT DEPLOY PASS · AWAITING EXTERNAL SETUP / LIVE RUN**

## Βάση

- `main`: `7e9af943057352db4949841cb9abf87f29ddd517`.
- Branch: `feat/backup-monitoring-restore-dry-run-task18-20260929`.
- Το υπάρχον Super Admin δημιουργεί χειροκίνητο tenant/store-scoped JSON backup, SHA-256 checksum και `DRY_RUN_ONLY` έλεγχο χωρίς restore.
- Υπάρχει ιστορικό Recovery Workflow, αλλά δεν υπάρχει αυτόματος off-site κύκλος 3 ωρών, παρακολούθηση καθυστέρησης/αποτυχίας ή σταθερή προγραμματισμένη υποδομή.

## Περιορισμένο scope

1. Προγραμματισμένο PostgreSQL logical backup κάθε 3 ώρες σε εξωτερικό, ιδιωτικό και κρυπτογραφημένο object storage.
2. Καταγραφή `STARTED / SUCCEEDED / FAILED`, checksum, μέγεθος, object key, revision και χρόνου εκτέλεσης χωρίς αποθήκευση credentials.
3. Read-only Super Admin monitoring για τελευταίο επιτυχές backup, αποτυχία ή overdue κατάσταση.
4. Restore dry-run που ελέγχει ότι το archive διαβάζεται και περιέχει PostgreSQL table-of-contents, χωρίς σύνδεση σε βάση προορισμού.
5. Διατήρηση του υπάρχοντος χειροκίνητου safety backup και Recovery Workflow χωρίς αλλαγή οικονομικών, stock ή συσκευών.

## Όρια ασφαλείας

- **Απαγορεύεται πραγματικό restore**, `pg_restore` προς βάση, αλλαγή `DATABASE_URL`, `DROP`, `TRUNCATE`, migration, seed ή αντικατάσταση δεδομένων.
- Κανένα backup δεν θεωρείται ασφαλές αν μένει στον ephemeral δίσκο του web service ή μέσα στην ίδια παραγωγική βάση.
- Τα AWS/S3 credentials και το monitoring secret ορίζονται μόνο ως Render secrets, ποτέ σε repository, logs, UI ή checkpoint.
- Το Render cron και το off-site bucket απαιτούν εξωτερική ρύθμιση/κόστος. Μέχρι πραγματικό cron run και ανεξάρτητο download/dry-run: **AWAITING EXTERNAL SETUP / NOT LIVE PASS**.

## Αποδοχή

1. Tests αποδεικνύουν 3ωρο schedule, fail-closed secrets, ασφαλή status webhook, tenant-independent monitoring και απουσία πραγματικού restore.
2. Production build και πλήρες server suite PASS, πράσινο CI, merge και exact deploy.
3. Πραγματικό cron run δημιουργεί off-site archive, καταγράφεται `SUCCEEDED` και νέο run μετά από 3 ώρες.
4. Ελεγχόμενη αποτυχία εμφανίζεται ως `FAILED` ή `OVERDUE` χωρίς να επηρεάζει την εφαρμογή.
5. Κατεβασμένο archive περνά `pg_restore --list`/ισοδύναμο dry-run χωρίς σύνδεση σε βάση.

## Τοπική υλοποίηση και έλεγχος

- Render cron blueprint με schedule `0 */3 * * *`, PostgreSQL custom-format archive και upload μόνο σε προϋπάρχον ιδιωτικό S3 bucket με ενεργό versioning και server-side encryption.
- Υπογεγραμμένο, replay-bounded webhook καταγράφει `STARTED / SUCCEEDED / FAILED` και το Super Admin εμφανίζει `OK / FAIL / ΑΡΓΕΙ / ΡΥΘΜΙΣΗ`. Η ανάγνωση είναι fail-soft και δεν μπλοκάρει το υπάρχον overview.
- Το dry-run εκτελεί αποκλειστικά `pg_restore --list` στο τοπικό προσωρινό archive, χωρίς host, database ή εντολή restore. Δεν έγινε πραγματική επαναφορά ή αντικατάσταση δεδομένων.
- Στοχευμένα tests: **4/4 PASS**. Πλήρες server suite: **1.641 PASS, 0 FAIL, 1 SKIP**. Production client build: **PASS**. Shell/Node syntax, YAML parse και `git diff --check`: **PASS**.
- Το bucket, τα AWS credentials, το κοινό monitoring secret και η δημιουργία/ενεργοποίηση του Render cron είναι εξωτερική εργασία. Μέχρι επιτυχημένο πραγματικό cron upload και ανεξάρτητο archive dry-run: **NOT LIVE PASS**.
- PR `#1544`, CI `#3887` PASS και exact production revision `17c4735c54b9e66fdb90c45970e2171b48d20380` επιβεβαιώθηκαν. Το web service είναι υγιές· η εξωτερική cron/S3 ενεργοποίηση παραμένει ανοικτή.
