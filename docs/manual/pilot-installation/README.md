# Πιλοτική εγκατάσταση καταστήματος

Αυτό το πακέτο οργανώνει την επίσκεψη χωρίς να χαρακτηρίζει ως PASS ανοικτό Gate και χωρίς να ενεργοποιεί fiscal/RBS/EFTPOS λειτουργίες.

## 1. Δημιουργία καρτέλας

1. Αντιγράψτε το `tools/pilot-readiness/pilot-site.sample.json` σε αρχείο εκτός Git, π.χ. `pilot-site.json`.
2. Συμπληρώστε πραγματικό κατάστημα, επίσκεψη, υπεύθυνους, production revision και κάθε terminal.
   Απαιτείται ένα πραγματικό terminal ή περισσότερα, χωρίς προκαθορισμένο ανώτατο πλήθος. Κάθε εγκατάσταση δηλώνει τις δικές της συσκευές με μοναδικά Terminal IDs και μοναδικούς ρόλους `POS_1`, `POS_2`, ... . Το δείγμα περιέχει ένα POS· προσθέστε εγγραφή για κάθε πρόσθετη πραγματική συσκευή.
3. Μην γράψετε PIN, activation links, tokens, κωδικούς ή provider credentials.
4. Για κάθε μη πιστοποιημένη σύνδεση δηλώστε `NON_FISCAL` ή `NOT_CONNECTED`.

## 2. Αυτόματος έλεγχος

```bash
npm run pilot:readiness -- /πλήρης/διαδρομή/pilot-site.json
```

- `READY`: συμπληρώθηκαν όλα τα οργανωτικά και ασφαλή προαπαιτούμενα. Δεν σημαίνει LAB PASS ή άδεια fiscal παραγωγής.
- `NOT_READY`: η έξοδος απαριθμεί ακριβώς όσα λείπουν. Δεν ξεκινά εγκατάσταση.

## 3. Σειρά στο κατάστημα

1. Επιβεβαιώστε exact production revision και πράσινο CI.
2. Εκτελέστε `tools/windows-kat-preflight/PRECHECK_KAT.cmd`.
3. Συνεχίστε μόνο με `SOFTWARE PREFLIGHT READY`.
4. Δημιουργήστε διαφορετικό one-time activation link για κάθε terminal.
5. Ακολουθήστε το `tools/windows-kat-preflight/KAT_REAL_TEST_CHECKLIST.txt`.
6. Πριν από recovery εκτελέστε μόνο `RECOVER_KAT_DRY_RUN.cmd` και απαιτήστε `DRY_RUN_PASSED`.
7. Κρατήστε τα reports Preflight, Installation και Recovery στην Επιφάνεια Εργασίας.
8. Σημειώστε κάθε μη εκτελεσμένο βήμα ως `NOT TESTED`.

## 4. STOP

Σταματήστε αν αποτύχει login, πώληση, εκτύπωση, πληρωμή, απόθεμα, κλείσιμο βάρδιας, preflight ή backup. Μην επαναλάβετε fiscal συναλλαγή στα τυφλά και μην αλλάξετε RBS, Kiosk Manager, CapDriver ή Windows services για παράκαμψη.
