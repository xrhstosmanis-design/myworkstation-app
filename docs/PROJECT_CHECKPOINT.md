# MyWorkStation — PROJECT CHECKPOINT / CONTINUATION RULES

Τελευταία ενημέρωση: 2026-08-11 14:23 Europe/Athens

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
- 2D-1 Idempotency / duplicate-sale protection — PR #138 MERGED, Render SUCCESS επιβεβαιωμένο — LIVE.
- 2D-2 Ακύρωση / Επιστροφή / Ετεροχρονισμένη συναλλαγή με reversal + audit, χωρίς hard delete — PR #139 MERGED. Render status πρέπει να επιβεβαιώνεται πριν χαρακτηριστεί LIVE αν δεν υπάρχει νεότερη επιβεβαίωση.
- 2E Reversal-aware BackOffice reports/customer metrics — PR #140 MERGED, merge commit `12eb926dbf80c5a0bd3569c19e57e234ac84b600`, CI #198 SUCCESS. Render status δεν έχει επιβεβαιωθεί στο checkpoint αυτό.
- 3A Εισαγωγή προσφορών φυλλαδίου από XLSX/XLS/CSV — PR #141 MERGED, head `760f382658038c902568938bf3532edfd2a2a517`, merge commit `206c5dd196b7665bf3ccc7ec04ca2ce95f01b2a9`, CI #199 SUCCESS. Render status δεν έχει επιβεβαιωθεί στο checkpoint αυτό.

## Τρέχον ενεργό checkpoint
PRE-KAT μετά το STEP 3A.

### Τι ολοκληρώθηκε στο 3A
- Πραγματική `Εισαγωγή από αρχείο` στο Τιμοκατάλογος → Προσφορές φυλλαδίου.
- XLSX/XLS/CSV έως 8 MB / 5000 data rows.
- Preview-first χωρίς writes.
- Tenant-scoped product matching: Barcode → SKU/internal code → exact normalized description.
- Δεν δημιουργούνται phantom products.
- READY / UNRESOLVED / INVALID / OVERLAP classification.
- Active-store targeting και overlap detection μέσω `PriceCatalogPromotionStore`.
- Europe/Athens wall-clock normalization.
- Η πραγματική `Product.salePrice` παραμένει authoritative original price.
- Commit με re-preview/hash verification και explicit confirmation.
- Append-only batch audit.
- UI capped preview rendering για anti-freeze προστασία.
- Χωρίς νέο MutationObserver.

## Ακριβές επόμενο εκτελέσιμο βήμα
1. Επιβεβαίωση deployment/Render για τα merge commits των #140 και #141. Μόνο όσα έχουν πραγματικό Render SUCCESS χαρακτηρίζονται LIVE.
2. Έλεγχος του επόμενου PRE-KAT commerce/price-catalog βήματος πάνω στην τρέχουσα `main`, χωρίς επιστροφή σε προηγούμενα βήματα.
3. Δημιουργία ξεχωριστού branch/PR για το επόμενο βήμα, CI + production build, merge και έλεγχος Render.
4. Αμέσως μετά ενημέρωση αυτού του checkpoint.

## Τελικό acceptance πριν το ΚΑΤ
Θα γίνουν πραγματικές δοκιμές από άκρη σε άκρη, τουλάχιστον:
- δημιουργία/επεξεργασία πελάτη → επιλογή στο POS,
- χονδρική/προσφορά/δώρο → authoritative τελική τιμή,
- εισαγωγή προσφορών από αρχείο → preview → επιβεβαίωση → POS εφαρμογή,
- μετρητά/κάρτα/μικτή πληρωμή,
- HOLD/restore,
- duplicate/double-click/network retry,
- ακύρωση/επιστροφή/ετεροχρονισμένη,
- βάρδια/EFTPOS,
- BackOffice αναφορές/ταμείο/πελάτης/απόθεμα,
- email όπου προβλέπεται,
- τελικός έλεγχος ότι στο ΚΑΤ απομένει μόνο η πραγματική hardware διασύνδεση και εγκατάσταση.
