# MyWorkStation — PROJECT CHECKPOINT / CONTINUATION RULES

Τελευταία ενημέρωση: 2026-08-11 14:22 Europe/Athens

## Σκοπός
Αυτό το αρχείο είναι το μόνιμο σημείο συνέχειας του έργου. Σε νέα σελίδα ή νέα συνομιλία, πρώτα ελέγχουμε αυτό το checkpoint και την πραγματική κατάσταση GitHub/CI/Render και συνεχίζουμε από το τελευταίο εκτελεσμένο βήμα. Δεν ξαναφτιάχνουμε ολοκληρωμένη εργασία.

## Μόνιμοι κανόνες εκτέλεσης
1. Προχωράμε βήμα-βήμα με πραγματική εκτέλεση, όχι μόνο με περιγραφή ή σχέδιο.
2. Κάθε αλλαγή γίνεται σε ελεγχόμενο branch/PR όταν απαιτείται και ελέγχεται με CI/tests + production build.
3. Ένα βήμα χαρακτηρίζεται MERGED μόνο μετά από πραγματικό merge στο `main`.
4. Ένα βήμα χαρακτηρίζεται LIVE μόνο αφού επιβεβαιωθεί πραγματικό Render SUCCESS για το σωστό commit/deploy. Δεν θεωρούμε LIVE κάτι μόνο επειδή πέρασε CI ή έγινε merge.
5. Μετά από κάθε ουσιαστικό βήμα ενημερώνεται αυτό το αρχείο με: PR, commit, CI run/status, merge status, Render status, τι ολοκληρώθηκε και ακριβές επόμενο βήμα.
6. Αν σταματήσει η σελίδα/συνομιλία, η επόμενη συνεδρία δεν βασίζεται σε εκτίμηση ή παλιά περίληψη. Ελέγχει πρώτα αυτό το αρχείο και μετά GitHub/CI/Render για τυχόν νεότερη πραγματική κατάσταση.
7. Δεν γίνεται hard delete πωλήσεων όπου απαιτείται audit/reversal. Διατηρούμε πλήρες ιστορικό.
8. Διατηρούμε tenant/company/store isolation, πραγματικά roles και server-side source of truth για τιμές/πωλήσεις.
9. Δεν χαλάμε ήδη λειτουργικά modules, design baseline MyWorkStation navy/teal, touch/pen keyboard ή anti-freeze/observer safeguards.
10. Τελικό στάδιο πριν το ΚΑΤ: πραγματικές end-to-end δοκιμές και στο BackOffice και στο POS. Δεν αρκούν τα automated tests.
11. Στο ΚΑΤ πρέπει στο τέλος να απομένουν μόνο USB/Observer/πραγματικό hardware και τελική εγκατάσταση/διασύνδεση.

## Ολοκληρωμένα PRE-KAT βήματα
- 1A Ρόλοι / tenant isolation — LIVE.
- 1B Structural regression / anti-freeze / touch+pen keyboard — LIVE.
- 2A Πραγματικός πελάτης στο POS — LIVE.
- 2B Χονδρικές τιμές ανά πελάτη — LIVE.
- 2C Προσφορές Φυλλαδίου/Δώρα, store targeting, authoritative quote, Europe/Athens normalization — LIVE.
- 2D-1 Idempotency / duplicate-sale protection — PR #138 MERGED. Είχε επιβεβαιωθεί Render SUCCESS και θεωρείται LIVE.
- 2D-2 Ακύρωση / Επιστροφή / Ετεροχρονισμένη συναλλαγή με reversal + audit, χωρίς hard delete — PR #139 MERGED.

## Τρέχον ενεργό checkpoint
PRE-KAT STEP 2E — Reversal-aware BackOffice

- PR: #140 `PRE-KAT reversal-aware BackOffice reports and customer metrics`
- Branch: `feat/pre-kat-reversal-aware-backoffice-v1`
- Head SHA: `8538e109c06dad7f8bfdfe5a33e16a87435f9d6d`
- CI: MyWorkStation CI run #198 — SUCCESS.
- PR status κατά το τελευταίο έλεγχο: OPEN / mergeable.
- Merge: ΔΕΝ έχει ακόμη εκτελεστεί στο checkpoint αυτό.
- Render: ΔΕΝ έχει ακόμη επιβεβαιωθεί για το #140.

### Τι περιλαμβάνει το 2E
- Reversal-aware customer visits/turnover/reporting.
- Customer ledger labels για SALE_CANCEL / SALE_RETURN / SALE_DELAYED με original-sale link και reason.
- Sales analysis με negative reversal quantity/value/cost/profit και ξεχωριστό return value.
- Stock analysis με net sold quantity + reversal quantity και σωστό lastSaleAt.
- `/api/reports/pos-sale-actions` από πραγματικό `PosSaleActionAudit`.
- BackOffice αναφορά `Ακυρώσεις / Επιστροφές POS` με date/store/search, original/reversal IDs, ποσά, delayed timestamps, πελάτη, actor, reason, CSV και print.
- Regression `pre-kat-reversal-aware-backoffice-v1.test.js`.

## Ακριβές επόμενο εκτελέσιμο βήμα
1. Επιβεβαίωση ότι το PR #140 παραμένει στο ίδιο head SHA και ότι το CI #198 είναι SUCCESS.
2. Merge του PR #140 στο `main`.
3. Έλεγχος του deployment/Render για το merge commit. Μόνο αν είναι SUCCESS χαρακτηρίζεται το 2E LIVE.
4. Ενημέρωση αυτού του checkpoint με merge commit + Render αποτέλεσμα.
5. Συνέχεια στο επόμενο PRE-KAT βήμα χωρίς επιστροφή σε προηγούμενα ολοκληρωμένα βήματα.

## Τελικό acceptance πριν το ΚΑΤ
Θα γίνουν πραγματικές δοκιμές από άκρη σε άκρη, τουλάχιστον:
- δημιουργία/επεξεργασία πελάτη → επιλογή στο POS,
- χονδρική/προσφορά/δώρο → authoritative τελική τιμή,
- μετρητά/κάρτα/μικτή πληρωμή,
- HOLD/restore,
- duplicate/double-click/network retry,
- ακύρωση/επιστροφή/ετεροχρονισμένη,
- βάρδια/EFTPOS,
- BackOffice αναφορές/ταμείο/πελάτης/απόθεμα,
- email όπου προβλέπεται,
- τελικός έλεγχος ότι στο ΚΑΤ απομένει μόνο η πραγματική hardware διασύνδεση και εγκατάσταση.
