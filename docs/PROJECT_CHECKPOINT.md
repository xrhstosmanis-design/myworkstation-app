# MyWorkStation — PROJECT CHECKPOINT / CONTINUATION RULES

Τελευταία ενημέρωση: 2026-08-11 14:34 Europe/Athens

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
12. Σήμερα το acceptance περιλαμβάνει πλήρη δοκιμή όλου του MyWorkStation που μπορεί να λειτουργήσει χωρίς φυσική ταμειακή και χωρίς εξωτερικούς παρόχους. Ταμειακή/USB/Observer hardware και εξωτερικοί providers εξαιρούνται μόνο επειδή απαιτούν πραγματική εξωτερική διασύνδεση, όχι επειδή παραλείπεται η εσωτερική λογική τους.
13. Πριν από κάθε μεγάλο επόμενο βήμα και αμέσως μετά από merge/deploy/test checkpoint γίνεται αποθήκευση εδώ, ώστε η συνέχεια να είναι πάντα ανακτήσιμη.

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
PRE-KAT STEP 3B — Promotion store overlap guard.

- PR: #143 `PRE-KAT promotion store overlap guard`
- Branch: `feat/pre-kat-promotion-store-guard-v1`
- Head SHA: `206a3c5b4c002803b95d296dd4054e999bc2bcc8`
- PR status: OPEN / mergeable.
- CI: MyWorkStation CI #201 — είχε ξεκινήσει και ήταν IN_PROGRESS στον τελευταίο έλεγχο.
- Merge: δεν έχει ακόμη εκτελεστεί.
- Render: δεν έχει ακόμη ελεγχθεί για το #143.

### Τι περιλαμβάνει το 3B
- Atomic manual LEAFLET/GIFT promotion + POS store targeting.
- Tenant-scoped product και active-store validation.
- Απαγόρευση overlapping ενεργών promotions ίδιου product/type στο ίδιο store/time range.
- PostgreSQL advisory transaction locks για concurrent writes.
- Inline επιλογή Καταστημάτων POS στη φόρμα προσφοράς.
- Legacy store reassignment δεν μπορεί να παρακάμψει τον ίδιο guard.
- Χωρίς νέο MutationObserver.
- Regression `pre-kat-promotion-store-guard-v1.test.js`.

## Ακριβές επόμενο εκτελέσιμο βήμα
1. Ολοκλήρωση/έλεγχος CI #201 για το PR #143.
2. Αν είναι SUCCESS, merge του #143 στο `main` και έλεγχος Render του merge commit.
3. Ενημέρωση αυτού του checkpoint αμέσως μετά.
4. Κλείσιμο μόνο των απολύτως απαραίτητων remaining PRE-KAT blockers.
5. Μετάβαση την ίδια ημέρα σε πλήρη πραγματική δοκιμή όλου του προγράμματος χωρίς ταμειακή και εξωτερικούς providers.

## Σημερινό πλήρες acceptance test — χωρίς ταμειακή/providers
Θα ελεγχθούν πραγματικά, από άκρη σε άκρη, όλα όσα μπορούν να λειτουργήσουν αυτόνομα:
- Login, roles, tenant/company/store isolation και permissions.
- Super Admin / Admin / Πωλητής flows.
- Δημιουργία/επεξεργασία πελάτη → επιλογή στο POS.
- Προϊόντα, κατηγορίες, τιμές, χονδρικές τιμές, store targeting.
- Προσφορές/δώρα και authoritative quote.
- Import προσφορών από XLSX/XLS/CSV → preview → επιβεβαίωση → εφαρμογή στο POS.
- POS cart, ποσότητες, αναζήτηση, HOLD/restore.
- Μετρητά, κάρτα και μικτή πληρωμή σε software/test flow, χωρίς πραγματική συσκευή παρόχου.
- Duplicate/double-click/network retry protection.
- Ακύρωση, επιστροφή και ετεροχρονισμένη συναλλαγή με reversal/audit.
- Βάρδιες, άνοιγμα/κλείσιμο, EFTPOS ως εσωτερική λογική/καταχώρηση χωρίς πραγματικό τραπεζικό terminal.
- BackOffice: πωλήσεις, ταμείο, πελάτες, αποθήκη, αναφορές, reversal-aware metrics.
- Προμηθευτές, παραγγελίες, αποθήκη/stock, τιμοκατάλογος και λοιπά διαθέσιμα commerce modules.
- Audit/history όπου προβλέπεται.
- Email/provider-dependent οθόνες ελέγχονται έως το σημείο πριν την πραγματική εξωτερική αποστολή, εκτός αν υπάρχει διαθέσιμος test provider.
- Anti-freeze, touch/pen keyboard, βασική πλοήγηση και σταθερότητα UI.

## Ρητές εξαιρέσεις από τη σημερινή πραγματική διασύνδεση
Δεν απαιτείται σήμερα πραγματική φυσική εκτέλεση μόνο για:
- Ταμειακή μηχανή / USB / fiscal connector.
- Observer που εξαρτάται από το πραγματικό hardware του καταστήματος.
- Πραγματικά EFTPOS/provider terminals.
- Εξωτερικούς παρόχους παραστατικών/email/διαβίβασης που απαιτούν production credentials ή hardware.

Η εσωτερική λογική, validation, persistence, audit και UI αυτών των flows πρέπει παρ' όλα αυτά να ελεγχθεί όπου μπορεί να εκτελεστεί χωρίς την εξωτερική συσκευή/υπηρεσία.
