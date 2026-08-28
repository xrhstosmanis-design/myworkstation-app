# MyWorkStation / KAT — Μόνιμο Checkpoint Συνέχειας

> **ΥΠΟΧΡΕΩΤΙΚΗ ΟΔΗΓΙΑ ΓΙΑ ΚΑΘΕ ΝΕΑ ΣΕΛΙΔΑ / ΣΥΝΟΜΙΛΙΑ**
>
> Διάβασε ολόκληρο αυτό το αρχείο πριν κάνεις οποιαδήποτε αλλαγή. Θεώρησε ολοκληρωμένα όσα αναφέρονται ως `LIVE`. Μην επαναλάβεις προηγούμενη υλοποίηση, PR, δοκιμή ή migration. Επιβεβαίωσε μόνο την τρέχουσα κατάσταση του `main`, του GitHub CI και του Render και συνέχισε αποκλειστικά από την ενότητα **Ακριβές επόμενο βήμα**.

Τελευταία ενημέρωση: 28 Αυγούστου 2026 - RBS/Kiosk Manager preflight checkpoint
Repository: `xrhstosmanis-design/myworkstation-app`  
Production branch: `main`  
Τελευταίο επιβεβαιωμένο functional production commit: `d595927f2712f959b2c51451c6cc5fed539e068a`

## Κατάσταση τελευταίου checkpoint

- Επιβεβαιώθηκε από τον ιδιοκτήτη ότι οι ταμειακές, τα τέσσερα EFTPOS, το RBS και το Netlink είναι ήδη συνδεδεμένα και λειτουργούν μέσω **Kiosk Manager**.
- Αύριο δεν επαναρυθμίζουμε συσκευές, IP/COM, RBS, CapDriver, Netlink ή EFTPOS. Το Kiosk Manager παραμένει η μοναδική ενεργή fiscal/provider διαδρομή.
- Το MyWorkStation εγκαθίσταται πρώτα σε Store Mode και ο RBS/CapDriver Observer μόνο σε **READ ONLY / SHADOW MODE**. Πραγματική εντολή επιτρέπεται μόνο στο ελεγχόμενο πραγματικό test, με γνωστή συσκευή και άμεσο reconciliation.
- Υπάρχουν έτοιμα τα `tools/windows-kat-preflight` (installation/recovery) και `tools/windows-rbs-observer` (read-only observer). Πρώτα εκτελούνται τα αντίστοιχα PRECHECK και κρατούνται τα reports.
- PR #296 — `feat(platform): start Recovery Workflow Center`: **MERGED**.
- Merge commit: `ef061797b4877fbb23721ae984953b2878c2d5f3`.
- GitHub MyWorkStation PR CI #873: **SUCCESS**. Targeted recovery tests: **9/9 SUCCESS**. Full server tests: **861/861 SUCCESS**. Production client build: **SUCCESS**.
- Το πραγματικό restore παραμένει κλειδωμένο. Το Recovery Workflow Center είναι dry-run foundation και δεν καλεί RBS/EFTPOS/fiscal provider.

- Με ρητή επιλογή του χρήστη ξεκίνησε παράλληλα το μελλοντικό item **#5 Recovery Workflows**, χωρίς να αλλάζει η εκκρεμής KAT πύλη 58–62.
- Branch `agent/recovery-workflows-20260828`: Recovery Workflow Center dry-run foundation. Δημιουργεί checksum-addressed Recovery Run, εμφανίζει revision evidence και κρατά το πραγματικό restore κλειδωμένο.
- Το dry-run παραμένει απολύτως μη μεταβαλλόμενο: δεν γράφει επιχειρησιακά δεδομένα, δεν επαναφέρει secrets και δεν καλεί RBS/EFTPOS/fiscal provider.
- Targeted recovery tests: **9/9 SUCCESS**. Production client build: **SUCCESS**. PR/CI/merge: **ΟΛΟΚΛΗΡΩΘΗΚΑΝ**.

- PR #294 — `feat(KAT): reconcile dual-terminal shift totals`: **MERGED**.
- Merge commit: `6b80509119feccb6ca1c9a9402eba523750b9e27`.
- GitHub MyWorkStation PR CI #869: **SUCCESS**.
- Main CI / Render deployment για το ακριβές merge commit: **ΕΚΚΡΕΜΕΙ ΕΠΙΒΕΒΑΙΩΣΗ**.
- Tests 52–57: ενιαίο KAT reconciliation στο BackOffice με δύο terminal closes, Store/Delivery/Online, Cash/Cards, EFTPOS ανά συσκευή, Returns/Voids και Pending fiscalizations.
- Fail-closed issues: pending/duplicate fiscal, missing/unsettled EFTPOS, shift/session/terminal mismatch, ανοιχτή βάρδια και POS-EFTPOS/ταμειακή διαφορά.
- Targeted tests: **9/9 SUCCESS**. Full server tests: **859/859 SUCCESS**. Production client build: **SUCCESS**.
- Δεν εκτελέστηκε πραγματική EFTPOS/fiscal εντολή και δεν έγινε πραγματικό κλείσιμο συσκευής.

- PR #292 — `feat(KAT): restart-safe backup recovery dry run`: **MERGED**.
- Merge commit: `bd862b8e201f2265d579556101ca3e6f76806f5f`.
- GitHub MyWorkStation PR CI #864: **SUCCESS**.
- Main CI / Render deployment για το ακριβές commit: **ΕΚΚΡΕΜΕΙ ΕΠΙΒΕΒΑΙΩΣΗ**.

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
45. Το pilot backup περιλαμβάνει SHA-256, backup schema revision και ακριβή application revision μέσα στο προστατευμένο snapshot.
46. Το dry-run verification επιστρέφει recovery report με checksum, backup/current app revision, schema, αποτέλεσμα και ακριβή επόμενη χειροκίνητη ενέργεια.
47. Νέο `RECOVER_KAT_DRY_RUN.cmd` ελέγχει installation state και shortcut checksums χωρίς να αντικαθιστά τη συντόμευση.
48. Το πραγματικό `RECOVER_KAT.cmd` παραμένει ελεγχόμενο και εκτελείται μόνο μετά από επιτυχημένο dry-run και εγκεκριμένο maintenance window.
49. Το deployment workflow διατηρεί rollback checkpoint πριν το restart και απαιτεί ακριβή production revision μετά το deploy.
50. Καμία production βάση, fiscal εφαρμογή, RBS υπηρεσία ή registry/scheduled task δεν μεταβλήθηκε.
51. Targeted recovery tests 18/18, full server tests 856/856, production client build και PR CI #864 επιτυχή.
52. Πλήρες read-only KAT audit/reconciliation summary από αμετάβλητα audit events, fiscal documents, EFTPOS attempts και terminal shifts.
53. BackOffice εμφανίζει συνολική κατάσταση `AGREEMENT` ή `NEEDS_REVIEW`, χωρίς να κρύβει ελλείποντα στοιχεία.
54. Η αλυσίδα Sale / Fiscal / EFTPOS / Shift διασταυρώνεται ανά sale και κάθε ασυμφωνία παραμένει εμφανές issue.
55. Η Ταμειακή 1 αναφέρεται ξεχωριστά με session, terminal, close status, cash/card/EFTPOS totals και variances.
56. Η Ταμειακή 2 αναφέρεται ξεχωριστά με τα ίδια deterministic στοιχεία, χωρίς ανάμειξη βαρδιών.
57. Ξεχωριστά totals για Store, Delivery, Online, Cash, Cards, EFTPOS ανά συσκευή, Returns, Voids και Pending fiscalizations.

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
- Τα PR #277 έως και #292.
- Την καταγραφή stock movement για απλό online προϊόν.
- Τους exactly-once fiscal/stock guards, το delayed completion lock και το duplicate detection.
- Την online/delivery cancellation lifecycle, τα cancellation metadata και το waste disposition.
- Τα dual-terminal shared-stock guards, terminal-scoped fingerprints και cross-terminal reconciliation alerts.
- Την restart-safe offline queue, το stable client transaction ID και το serialized reconnect του PR #288.
- Το server-side/BackOffice offline sync evidence του PR #290.
- Το revision-bound backup, recovery dry-run και rollback checkpoint του PR #292.
- Μην ξαναφτιάξεις δεύτερο backup verifier. Το Recovery Workflow Center επεκτείνει το υπάρχον `pilot-backup/verify`.
- Πραγματική EFTPOS ή fiscal εκτέλεση χωρίς εγκεκριμένο test, σωστή συσκευή και διαθέσιμο provider/hardware.

## Ακριβές επόμενο βήμα

### Ενεργό checkpoint — Inventory 2.0 (σε υλοποίηση)

- Προστέθηκε foundation για Πλήρη και Μερική απογραφή. Η μερική απογραφή κρατά ρητό scope προϊόντων/κατηγοριών και κατά την οριστικοποίηση ενημερώνει αποκλειστικά τις γραμμές αυτού του scope.
- Προστέθηκαν Inventory Zones, πολλαπλοί καταμετρητές, optimistic version ανά γραμμή, immutable count/recount events, QR/PIN grants περιορισμένα σε απογραφή/ζώνη και PWA mobile οθόνη.
- Προστέθηκε νέα BackOffice οθόνη «Inventory 2.0» με επιλογή πλήρους/μερικής απογραφής, live counting, υποχρεωτική επανακαταμέτρηση διαφορών, αναζήτηση, CSV, εκτύπωση και ασφαλή οριστικοποίηση.
- Το παρόν είναι checkpoint ανάπτυξης και δεν χαρακτηρίζεται LIVE πριν περάσουν CI, merge και deployment verification. Δεν στέλνει πραγματικές εντολές σε EFTPOS/RBS/Netlink/fiscal provider.

Επόμενα χωρίς επανάληψη: ολοκλήρωση import αρχείου και full audit report, targeted tests, PR/CI/merge/deploy και μετά Installation Center, Device Health, Remote Installation και Update Management.

Επόμενο checkpoint από την τελική λίστα δοκιμών:

1. Μην επαναλάβεις τα tests 52–57, το PR #294 ή το Recovery Workflow foundation του PR #296.
2. Στο PC προετοιμασίας επαλήθευσε τα SHA-256 και εκτέλεσε τα automated/software tests, production build και recovery dry-run που δεν απαιτούν φυσικές συσκευές.
3. Αύριο στο ΚΑΤ: εκτέλεσε πρώτα `PRECHECK_KAT.cmd` και `PRECHECK_OBSERVER_KAT.cmd`. Αν κάποιο report γράψει `FAIL`, σταμάτησε μόνο το αντίστοιχο installation και κατέγραψε το ακριβές failure· μην αλλάξεις Kiosk Manager/RBS/CapDriver για να το παρακάμψεις.
4. Εγκατάστησε ξεχωριστά `KAT-POS-01` και `KAT-POS-02`. Ενεργοποίησε τον Observer μόνο σε READ ONLY / SHADOW MODE και επιβεβαίωσε ότι οι υπάρχουσες fiscal/provider υπηρεσίες συνεχίζουν να λειτουργούν αμετάβλητες.
5. Κατέγραψε πριν από συναλλαγή το πραγματικό mapping: terminal → ταμειακή → EFTPOS role/device. Μην επιτρέψεις silent fallback σε άλλη συσκευή.
6. Προχώρα στα tests 58–62: 10–20 πραγματικές δοκιμαστικές πωλήσεις, τελικό reconciliation και hardware/software health check. Μετά από timeout/άγνωστο αποτέλεσμα δεν επαναλαμβάνεται χρέωση στα τυφλά.
7. Δήλωσε `ΚΑΤ READY FOR GO-LIVE` μόνο αν κάθε critical test είναι πράσινο και δεν υπάρχει pending fiscalization, mismatch, duplicate ή ανεξήγητη διαφορά.

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
