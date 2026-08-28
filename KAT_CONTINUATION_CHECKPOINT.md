# MyWorkStation / KAT — Μόνιμο Checkpoint Συνέχειας

> **ΥΠΟΧΡΕΩΤΙΚΗ ΟΔΗΓΙΑ ΓΙΑ ΚΑΘΕ ΝΕΑ ΣΕΛΙΔΑ / ΣΥΝΟΜΙΛΙΑ**
>
> Διάβασε ολόκληρο αυτό το αρχείο πριν κάνεις οποιαδήποτε αλλαγή. Θεώρησε ολοκληρωμένα όσα αναφέρονται ως `LIVE`. Μην επαναλάβεις προηγούμενη υλοποίηση, PR, δοκιμή ή migration. Επιβεβαίωσε μόνο την τρέχουσα κατάσταση του `main`, του GitHub CI και του Render και συνέχισε αποκλειστικά από την ενότητα **Ακριβές επόμενο βήμα**.

Τελευταία ενημέρωση: 28 Αυγούστου 2026  
Repository: `xrhstosmanis-design/myworkstation-app`  
Production branch: `main`  
Τελευταίο επιβεβαιωμένο functional production commit: `97d427bc86726b3e7f3e592b2b6ac86bc8c3ca85`

## Κατάσταση τελευταίου checkpoint

- PR #284 — `feat(KAT): safe online cancellation and waste lifecycle`: **MERGED**.
- Merge commit: `97d427bc86726b3e7f3e592b2b6ac86bc8c3ca85`.
- GitHub MyWorkStation CI #846: **SUCCESS**.
- Render deployment #583: **SUCCESS**.
- Κατάσταση: **LIVE**.

## Τι ολοκληρώθηκε

1. Super Admin mapping κάθε fiscal device με συγκεκριμένο EFTPOS device.
2. Ξεχωριστοί ρόλοι EFTPOS `STORE` και `DELIVERY`.
3. Fail-closed routing: δεν γίνεται silent fallback σε διαφορετικό EFTPOS.
4. Κάθε card checkout δημιουργεί `PaymentDeviceRouteAttempt` με σύνδεση σε sale, shift, terminal, fiscal device, EFTPOS και idempotency key.
5. EFTPOS provider-result state machine: `PLANNED`, `SUCCESS`, `FAILURE`, `TIMEOUT`, `CANCELLED`, `REVERSED`.
6. Το timeout απαγορεύει blind retry χωρίς provider reconciliation.
7. Retry επιτρέπεται μόνο μετά από `FAILURE` ή `CANCELLED`, με νέο attempt και idempotency key.
8. Reversal επιτρέπεται μόνο μετά από `SUCCESS`.
9. BackOffice reconciliation ανά παραγγελία: `Order → Sale → Fiscal Receipt → EFTPOS Transaction → Stock Movement → Βάρδια`.
10. Κάθε κρίκος εμφανίζεται ως `OK`, `ΑΝΑΜΟΝΗ` ή `ΛΕΙΠΕΙ`.
11. Η απουσία fiscal ή EFTPOS εγγραφής δεν θεωρείται επιτυχία.
12. Οι online πωλήσεις απλών προϊόντων δημιουργούν auditable `StockMovement`, όπως ήδη γινόταν για υλικά συνταγών.
13. Targeted tests 7/7 και πλήρες GitHub CI επιτυχές.
14. Exactly-once fiscalization guard: μία `FiscalDocument` ανά sale με database unique constraint.
15. Exactly-once online stock movement με σταθερό `idempotencyKey` και database unique index.
16. Delayed Online → POS ολοκλήρωση με advisory lock, row lock και ασφαλές idempotent replay μετά από retry/restart.
17. Read-only duplicate detection για fiscal documents, sale links και stock movements στο BackOffice.
18. Τα duplicate alerts δεν διαγράφουν και δεν μεταβάλλουν αυτόματα δεδομένα.
19. Targeted tests 15/15, PR CI #841 και main CI #842 επιτυχή.
20. Idempotent ακύρωση online/delivery order με advisory lock και row lock.
21. Ακύρωση πριν την παραγωγή χωρίς sale, fiscal ή stock movement.
22. Ακύρωση μετά την έναρξη παραγωγής με auditable waste disposition και χωρίς πλασματική επιστροφή stock.
23. Ακύρωση μετά από οριστικοποιημένη πώληση απορρίπτεται και παραπέμπει στην ελεγχόμενη ροή return/reversal.
24. POS ενέργεια ακύρωσης με υποχρεωτική αιτιολογία και BackOffice προβολή stage/disposition.
25. Replay/concurrent cancellation δεν δημιουργεί δεύτερο event, audit ή stock reversal.
26. Targeted tests 9/9, PR CI #845, main CI #846 και Render #583 επιτυχή.

## Ασφαλή όρια που παραμένουν ενεργά

- Η πραγματική εκτέλεση EFTPOS **δεν ενεργοποιήθηκε**.
- Δεν πραγματοποιήθηκε πραγματική χρέωση κάρτας ή fiscal έκδοση από αυτό το checkpoint.
- Δεν ενεργοποιείται Netlink execute χωρίς ξεχωριστή ελεγχόμενη διαδικασία provider test.
- Δεν χαρακτηρίζεται το ΚΑΤ `READY FOR GO-LIVE` μόνο από automated tests.

## Μην επαναλάβεις

- Τα EFTPOS/fiscal mappings και τους ρόλους `STORE` / `DELIVERY`.
- Τη δημιουργία `PaymentDeviceRouteAttempt` στο card checkout.
- Το provider-result state machine, timeout reconciliation, retry και reversal rules.
- Το Transaction Reconciliation Center.
- Τα PR #277, #278, #279, #280, #281, #282, #283 και #284.
- Την καταγραφή stock movement για απλό online προϊόν.
- Τους exactly-once fiscal/stock guards, το delayed completion lock και το duplicate detection.
- Την online/delivery cancellation lifecycle, τα cancellation metadata και το waste disposition.
- Πραγματική EFTPOS ή fiscal εκτέλεση χωρίς εγκεκριμένο test, σωστή συσκευή και διαθέσιμο provider/hardware.

## Ακριβές επόμενο βήμα

Επόμενο software checkpoint από την τελική λίστα δοκιμών:

1. Έλεγξε την υπάρχουσα λειτουργία δύο ταμείων/terminals χωρίς να αλλάξεις τα ολοκληρωμένα fiscal/EFTPOS mappings.
2. Πρόσθεσε deterministic concurrent tests για ταυτόχρονες πωλήσεις από Ταμειακή 1 και Ταμειακή 2.
3. Επιβεβαίωσε κοινόχρηστο stock με row locking/atomic decrement και χωρίς lost update ή αρνητικό stock.
4. Επιβεβαίωσε ξεχωριστές βάρδιες και σωστό mapping κάθε sale στο terminal, fiscal device και EFTPOS role (`STORE`/`DELIVERY`).
5. Πρόσθεσε BackOffice evidence για cross-terminal reconciliation και fail-closed alerts σε λάθος mapping.

Δεν πρέπει να σταλεί πραγματική εντολή σε EFTPOS, RBS, Netlink ή άλλο fiscal provider.

## Υποχρεωτική διαδικασία ολοκλήρωσης

1. Νέο branch από το τρέχον `main`.
2. Υλοποίηση μόνο του παραπάνω επόμενου βήματος.
3. Targeted tests, syntax/build checks και διαθέσιμο πλήρες CI.
4. Ξεχωριστό PR και merge μόνο μετά από πράσινο CI.
5. Επιβεβαίωση Render deployment για το ακριβές merge commit.
6. Ενημέρωση **του ίδιου αρχείου** με τι ολοκληρώθηκε, PR/commits, CI/Render, τι παραμένει κλειστό, τι δεν επαναλαμβάνεται και το νέο ακριβές επόμενο βήμα.
7. Το checkpoint περιλαμβάνεται στο ίδιο PR ή, αν λείπουν ακόμη τα τελικά merge/deploy στοιχεία, σε αμέσως επόμενο checkpoint-only PR.

## Εντολή για νέα σελίδα

```text
Διάβασε πρώτα ολόκληρο το KAT_CONTINUATION_CHECKPOINT.md από το repository
xrhstosmanis-design/myworkstation-app. Θεώρησε ολοκληρωμένα όλα όσα γράφει ως LIVE.
Μην επαναλάβεις προηγούμενες εργασίες. Επιβεβαίωσε main, CI και Render και συνέχισε
αποκλειστικά από το «Ακριβές επόμενο βήμα». Μετά το επόμενο επιτυχημένο merge και
deployment, ενημέρωσε το ίδιο checkpoint.
```
