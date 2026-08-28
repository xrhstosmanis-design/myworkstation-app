# MyWorkStation / KAT — Μόνιμο Checkpoint Συνέχειας

> **ΥΠΟΧΡΕΩΤΙΚΗ ΟΔΗΓΙΑ ΓΙΑ ΚΑΘΕ ΝΕΑ ΣΕΛΙΔΑ / ΣΥΝΟΜΙΛΙΑ**
>
> Διάβασε ολόκληρο αυτό το αρχείο πριν κάνεις οποιαδήποτε αλλαγή. Θεώρησε ολοκληρωμένα όσα αναφέρονται ως `LIVE`. Μην επαναλάβεις προηγούμενη υλοποίηση, PR, δοκιμή ή migration. Επιβεβαίωσε μόνο την τρέχουσα κατάσταση του `main`, του GitHub CI και του Render και συνέχισε αποκλειστικά από την ενότητα **Ακριβές επόμενο βήμα**.

Τελευταία ενημέρωση: 28 Αυγούστου 2026  
Repository: `xrhstosmanis-design/myworkstation-app`  
Production branch: `main`  
Τελευταίο επιβεβαιωμένο functional production commit: `d595927f2712f959b2c51451c6cc5fed539e068a`

## Κατάσταση τελευταίου checkpoint

- PR #290 — `feat(KAT): offline sync evidence in BackOffice`: **MERGED**.
- Merge commit: `61579a8e2777b3ab9a8e5a929fd42dee1ca39221`.
- GitHub MyWorkStation PR CI #859: **SUCCESS**.
- Main CI / Render deployment για το ακριβές commit: **ΕΚΚΡΕΜΕΙ ΕΠΙΒΕΒΑΙΩΣΗ**.

- PR #288 — `feat(KAT): offline restart and exactly-once reconnect`: **MERGED**.
- Merge commit: `e3719ad98da3c54cd1a24877c9087a53eddc1abc`.
- GitHub MyWorkStation PR CI #855: **SUCCESS**.
- Main CI / Render deployment για το ακριβές commit: **ΕΚΚΡΕΜΕΙ ΕΠΙΒΕΒΑΙΩΣΗ**.
- Μέχρι να επιβεβαιωθεί το deployment, τελευταίο πλήρως επιβεβαιωμένο LIVE functional commit παραμένει το `d595927f2712f959b2c51451c6cc5fed539e068a`.

- PR #286 — `feat(KAT): dual-terminal shared stock and reconciliation`: **MERGED**.
- Merge commit: `d595927f2712f959b2c51451c6cc5fed539e068a`.
- GitHub MyWorkStation CI #852: **SUCCESS**.
- Render deployment #585: **SUCCESS**.
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
27. Ταυτόχρονες πωλήσεις POS-1/POS-2 δεσμεύουν κοινό stock atomically και δεν επιτρέπουν αρνητικό απόθεμα.
28. Τα παρασκευαζόμενα προϊόντα δεν αφαιρούν πλασματικό stock τελικού είδους· συνεχίζουν να καταναλώνουν τα υλικά συνταγής.
29. Κάθε πώληση συνδέεται αποκλειστικά με την ανοιχτή βάρδια του φυσικού terminal που την εκτέλεσε.
30. Ίδιες νόμιμες πωλήσεις σε διαφορετικά terminals έχουν διαφορετικό duplicate fingerprint, ενώ retry στο ίδιο terminal παραμένει idempotent.
31. BackOffice cross-terminal evidence και alerts για `SHIFT_TERMINAL_MISMATCH`, `SHIFT_SESSION_MISMATCH` και `EFTPOS_ROLE_MISMATCH`.
32. Full server tests 844/844, PR CI #851, main CI #852 και Render #585 επιτυχή.
33. Η offline cash queue αποσυνδέθηκε από το React UI σε ανεξάρτητη, επανεκκινήσιμη queue engine.
34. Το `clientTransactionId` παραμένει σταθερό μετά από application/PC restart και σε κάθε retry.
35. Ταυτόχρονα reconnect/retry ανά store εκτελούν ένα μόνο checkout και το server idempotency guard αποτρέπει δεύτερη πώληση.
36. Αποτυχία συγχρονισμού παραμένει ως `FAILED` με attempts/error/timestamp· επιτυχία διατηρείται σε bounded `SYNCED` history αντί να διαγράφεται σιωπηλά.
37. Card, IRIS, mixed payments και returns παραμένουν μπλοκαρισμένα offline.
38. Full server tests 847/847, production client build και PR CI #855 επιτυχή.
39. Μία μοναδική server-side εγγραφή `OfflineSaleSyncEvidence` ανά store και `clientTransactionId`.
40. Το POS μπορεί να αναφέρει μόνο `PENDING`/`FAILED`· το `SYNCED` γράφεται αποκλειστικά από το authoritative checkout ή idempotent replay.
41. Μία ήδη συγχρονισμένη εγγραφή δεν μπορεί να υποβαθμιστεί από καθυστερημένο failure/retry.
42. BackOffice Cash Control εμφανίζει pending, failed, synced, replay counts, sale link, attempts και ασφαλή error code.
43. Tenant/store guards, χωρίς στοιχεία κάρτας, χωρίς διαγραφή ή μεταβολή sales και χωρίς δεύτερο audit row.
44. Targeted offline tests 13/13, full server tests 851/851, production client build και PR CI #859 επιτυχή.

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
- Τα PR #277 έως και #290.
- Την καταγραφή stock movement για απλό online προϊόν.
- Τους exactly-once fiscal/stock guards, το delayed completion lock και το duplicate detection.
- Την online/delivery cancellation lifecycle, τα cancellation metadata και το waste disposition.
- Τα dual-terminal shared-stock guards, terminal-scoped fingerprints και cross-terminal reconciliation alerts.
- Την restart-safe offline queue, το stable client transaction ID και το serialized reconnect του PR #288.
- Το server-side/BackOffice offline sync evidence του PR #290.
- Πραγματική EFTPOS ή fiscal εκτέλεση χωρίς εγκεκριμένο test, σωστή συσκευή και διαθέσιμο provider/hardware.

## Ακριβές επόμενο βήμα

Επόμενο software checkpoint από την τελική λίστα δοκιμών:

1. Επιβεβαίωσε πρώτα main CI και Render deployment για το ακριβές commit `61579a8e2777b3ab9a8e5a929fd42dee1ca39221`. Μην επαναλάβεις τα PR #288 και #290.
2. Συνέχισε στα tests 44–51: restart εφαρμογής, restart PC, επαναφορά εφαρμογής, backup και backup integrity verification.
3. Έλεγξε το υπάρχον Windows recovery package και μην ξαναγράψεις ασφαλείς installer/backup λειτουργίες.
4. Πρόσθεσε deterministic dry-run restore/recovery και rollback-checkpoint test χωρίς καταστροφική επαναφορά production δεδομένων.
5. Πρόσθεσε σαφές recovery report με backup checksum, schema/app revision, dry-run αποτέλεσμα και ακριβή επόμενη χειροκίνητη ενέργεια.

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
