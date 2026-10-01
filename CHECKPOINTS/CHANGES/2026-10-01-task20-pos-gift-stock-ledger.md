# Εργασία 20 — POS δώρο και StockMovement ledger — 01/10/2026

## Πραγματικό LAB αποτέλεσμα πριν από αλλαγή

Στο `MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ`, terminal `MAIN`, χειριστής `LAB POS 2`, ολοκληρώθηκε στις 10:44:20 μία πληρωμή ΜΕΤΡΗΤΑ 1,20 €:

- 1 × `LAB EXCEL TEST 1` / `LAB-EXCEL-20260909-01` / 1,20 €,
- 1 × `LAB EXCEL TEST 2` / `LAB-EXCEL-20260909-02` / δώρο 0,00 €.

Sale `328547a7-3d2a-43e3-a34a-ae646add870d`, StoreTransaction `e56ac35d-454d-42a8-8955-60efdd56a99e`. Η βάρδια και το κεντρικό Audit έδειξαν ακριβώς μία συναλλαγή και τις δύο πραγματικές γραμμές. Τα στατιστικά αποθήκης έδειξαν τρέχον stock 12 / -1 και μία πώληση για κάθε προϊόν. Το Χρονολόγιο κινήσεων ειδών δεν έδειξε καμία κίνηση `SALE` στις 01/10 για τα δύο προϊόντα.

Δεν είχε αποθηκευτεί πλήρες stock baseline πριν από την πληρωμή. Συνεπώς η ακριβής αριθμητική μεταβολή πριν/μετά είναι `NOT TESTED`, ενώ η απουσία των ledger rows είναι πραγματικό `LAB FAIL`. Δεν επαναλαμβάνεται η συγκεκριμένη πληρωμή για τεκμηρίωση.

## Αιτία

Το checkout καλεί `reserveSharedStock`, η οποία ενημερώνει ατομικά το `StoreProduct.currentStock`, αλλά δεν δημιουργεί `StockMovement`. Το κενό αφορά κάθε tracked-stock γραμμή της συγκεκριμένης POS checkout διαδρομής, όχι μόνο το δώρο.

## Περιορισμένη διόρθωση

Η ίδια checkout transaction θα γράφει μία `StockMovement` κίνηση `SALE` μόνο όταν πράγματι αφαιρείται tracked stock. Κάθε κίνηση θα συνδέεται με το ίδιο Sale, την πραγματική SaleLine και μοναδικό idempotency key ανά γραμμή. Προϊόντα χωρίς tracked stock και αυτόματες συνταγές δεν θα αποκτούν ψεύτικη άμεση κίνηση. Replay/duplicate checkout δεν θα αφαιρεί ή θα γράφει δεύτερη φορά.

Δεν δημιουργείται αναδρομική κίνηση για την πώληση 10:44:20 και δεν μεταβάλλεται άλλο production δεδομένο.

## Κατάσταση

`LOCAL PASS — AWAITING CI / MERGE / EXACT DEPLOY / LAB`.

- Στοχευμένα Task 20 / POS / shared-stock tests: `31 PASS / 0 FAIL`.
- Πλήρης server suite μετά το rebase στο σημερινό `main`: `1693 PASS / 1 SKIP / 0 FAIL`.
- Production client/server build και Prisma generate: `PASS`.
- `git diff --check`: `PASS`.

Το πρώτο PR CI `36837395173` έφτασε έως το πραγματικό HTTP E2E και αποκάλυψε ότι ένας νόμιμος χειριστής POS μπορεί να μην είναι εγγραφή του πίνακα `User`, άρα δεν επιτρέπεται να αποθηκεύεται στο `StockMovement.createdByUserId`. Η κίνηση διατηρεί Sale/SaleLine/source/idempotency και αφήνει αυτό το προαιρετικό ξένο κλειδί `NULL`· η ταυτότητα χειριστή παραμένει στο υπάρχον Sale/StoreTransaction/Audit. Απαιτείται νέο CI PASS.

Δεν αποδίδεται πραγματικό PASS μόνο από τους τοπικούς ελέγχους. Μετά από CI/merge/exact deploy απαιτείται μία νέα, χωριστά ταυτοποιημένη LAB δοκιμή με πλήρες πριν/μετά για βάρδια, δύο stock, τελευταία κίνηση, Sale/Transaction/Audit IDs και αμετάβλητο δεύτερο terminal.
