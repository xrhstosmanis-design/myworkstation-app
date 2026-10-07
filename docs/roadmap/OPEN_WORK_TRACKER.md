# MyWorkStation — κοινό μητρώο εκκρεμοτήτων και αναθέσεων

Έκδοση 06/10/2026 · Ευρώπη/Αθήνα · Βάση main 329792bad1efc5705fff663d093fc89377b97500.

## Current numbered checklist

Η εκτυπώσιμη αριθμημένη λίστα είναι [NUMBERED_WORK_CHECKLIST_2026-10-06.md](NUMBERED_WORK_CHECKLIST_2026-10-06.md) με [PDF](MyWorkStation_Numbered_Checklist_2026-10-06.pdf). Οι αριθμοί της εκτύπωσης αντιστοιχούν στα IDs που εμφανίζονται δίπλα σε κάθε εργασία. Για ολοκλήρωση, ενημέρωσε την ίδια εγγραφή εδώ σε PASS μόνο αφού περάσουν όλα τα συμφωνημένα κριτήρια και πρόσθεσε τεκμήριο· μερικό PASS κρατά το υπόλοιπο OPEN.


## Υποχρεωτική καταγραφή ανάληψης και ολοκλήρωσης

Ρητή οδηγία ιδιοκτήτη 06/10/2026: κάθε σελίδα σημειώνει όταν παίρνει εργασία και όταν την τελειώνει.

1. Πριν αρχίσει, διαβάζει το νεότερο main, AGENTS, ενεργή λίστα, PENDING_WORK, αυτό το μητρώο και checkpoint/manual. Υπάρχουσα ανάθεση δεν μεταφέρεται από αυτή τη συγκέντρωση.
2. Κατά την ανάληψη ενημερώνει την ακριβή εγγραφή: κατάσταση ASSIGNED, σελίδα/branch, ημερομηνία/ώρα, συγκεκριμένο υπόλοιπο που αναλαμβάνει και checkpoint/PR. Η ανάληψη δημοσιεύεται στο main πριν αλλαγή κώδικα ή state-changing LAB. Για ήδη δεσμευμένη εργασία απαιτείται ονομασμένο handoff.
3. Κατά την ολοκλήρωση σημειώνει χρόνο, ακριβές scope, PASS/FAIL/NOT TESTED, checkpoint/manual, PR/CI/merge και exact revision όπου χρειάζεται. Μερικό PASS κρατά τα εναπομένοντα OPEN και τον owner. CI μόνο δεν κλείνει εργασία.
4. Στο ίδιο PR συγχρονίζει ενεργή λίστα, pending roadmap, παλιό αριθμημένο μητρώο και το παρόν μητρώο/PDF. Για νέο πραγματικό PASS ενημερώνει και manual. Αφαιρεί μόνο το ολοκληρωμένο υπόλοιπο από το ενεργό pending scope, κρατώντας το ιστορικό PASS.
5. Αναγεννά το PDF: python3 docs/roadmap/generate-open-work-tracker.py. Το PDF είναι εκτυπώσιμο στιγμιότυπο· η Markdown εγγραφή και τα τεκμήρια στο νεότερο main είναι η τρέχουσα κατάσταση.
6. Αν σταματήσει, καταγράφει BLOCKED/υπόλοιπο/επόμενη ενέργεια και ονομασμένη παράδοση. Δεν απελευθερώνει σιωπηρά την ανάθεση.

## Προστασία ήδη ολοκληρωμένων

Gate 1–8: διατηρούνται τα τεκμηριωμένα PASS του συμφωνημένου scope. Υπάρχουν αντιφάσεις στον claim board για Gate 6/8: δεν θεωρούνται νέα ελεύθερη ανάθεση και δεν επαναλαμβάνονται δοκιμές χωρίς συγκεκριμένο regression ή ρητή νέα απαίτηση. Οι υπεύθυνες σελίδες συμφιλιώνουν τις εγγραφές με checkpoint/manual. Gate 3 βοηθού παραμένει PASS· αυτόματη πρώτη OCR ακρίβεια είναι ξεχωριστή βελτίωση.

Δεν επαναλαμβάνονται LAB-EXP-001, LAB-EXP-PARTIAL-20261005-A, LAB-EXP-CENT-20261005-A, LAB-EXP-ZEROVAT-20261005-A ή οι πληρωμές τους. Οι παλιές δοκιμές δώρου, τραπεζιών, επιστροφών και κλεισίματος δεν επαναλαμβάνονται για κενά τεκμηρίωσης. Δεν εκτελέστηκε νέα LAB πράξη για αυτό το μητρώο.

Πηγές: docs/roadmap/PENDING_WORK.md, CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md, docs/roadmap/CENTRAL_NUMBERED_WORK_2026-09-28.md και live PR1772/CI4484 ανάγνωση. Απουσία τεκμηρίου δεν σημαίνει ούτε FAIL ούτε ολοκλήρωση. Περιγραφικοί owners δεν είναι νέα assignment και χρειάζονται αναφορά του ακριβούς branch πριν claim.

## Αριθμημένες εργασίες 01–36

### 01 — Εγκατάσταση Διαδόχου Παύλου

**Κατάσταση:** OPEN

**Υπόλοιπο / όρια PASS:** Ημερομηνία, ώρα, υπεύθυνος, πραγματικό POS PC και terminal ID.

**Υπεύθυνη σελίδα / branch:** Δεν μεταφέρεται ανάθεση — έλεγχος τρέχοντος checkpoint πριν claim

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 02 — Προετοιμασία πραγματικού καταστήματος

**Κατάσταση:** OPEN / ΥΠΑΡΧΟΥΣΑ ΑΝΑΘΕΣΗ

**Υπόλοιπο / όρια PASS:** Τελική επιβεβαίωση καταλόγου, τιμών, ΦΠΑ, αρχικού αποθέματος, χειριστών και δικαιωμάτων. Χωριστή αποδοχή από LAB.

**Υπεύθυνη σελίδα / branch:** σελίδα ετοιμότητας εγκατάστασης — διατήρηση υπάρχουσας ανάθεσης

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 03 — Software preflight / recovery

**Κατάσταση:** OPEN

**Υπόλοιπο / όρια PASS:** Πραγματικό PC, ενεργοποίηση terminal, SOFTWARE PREFLIGHT READY, recovery dry-run και reports.

**Υπεύθυνη σελίδα / branch:** Δεν μεταφέρεται ανάθεση — έλεγχος τρέχοντος checkpoint πριν claim

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 04 — Πραγματικό go-live test

**Κατάσταση:** OPEN

**Υπόλοιπο / όρια PASS:** Login, scanner, τιμές/ΦΠΑ, μετρητά/κάρτα, απόδειξη, stock, Audit και κλείσιμο βάρδιας στο νέο κατάστημα.

**Υπεύθυνη σελίδα / branch:** Δεν μεταφέρεται ανάθεση — έλεγχος τρέχοντος checkpoint πριν claim

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 05 — Παρακολούθηση εγκατάστασης

**Κατάσταση:** OPEN

**Υπόλοιπο / όρια PASS:** Πιλοτική λειτουργία 48 ωρών, συμφωνίες, συμβάντα, backup και τελική παραλαβή.

**Υπεύθυνη σελίδα / branch:** Δεν μεταφέρεται ανάθεση — έλεγχος τρέχοντος checkpoint πριν claim

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 06 — RBS / CAP Driver

**Κατάσταση:** AWAITING DEVICE / ΠΙΣΤΟΠΟΙΗΣΗ

**Υπόλοιπο / όρια PASS:** Φυσική φορολογική λειτουργία νέου καταστήματος. Οι επιμέρους δοκιμές ΚΑΤ δεν αποδεικνύουν Διαδόχου PASS.

**Υπεύθυνη σελίδα / branch:** Δεν μεταφέρεται ανάθεση — έλεγχος τρέχοντος checkpoint πριν claim

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 07 — EFTPOS

**Κατάσταση:** AWAITING DEVICE / ΠΙΣΤΟΠΟΙΗΣΗ

**Υπόλοιπο / όρια PASS:** Πραγματική σύνδεση, κάρτα, ολοκλήρωση πώλησης και settlement νέου καταστήματος.

**Υπεύθυνη σελίδα / branch:** Δεν μεταφέρεται ανάθεση — έλεγχος τρέχοντος checkpoint πριν claim

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 08 — Netlink / TORA

**Κατάσταση:** BLOCKED EXTERNAL

**Υπόλοιπο / όρια PASS:** Παραγωγική πιστοποίηση παρόχου και τελική αποδοχή.

**Υπεύθυνη σελίδα / branch:** Δεν μεταφέρεται ανάθεση — έλεγχος τρέχοντος checkpoint πριν claim

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 09 — myDATA / e-invoicing (Νο 4 ομαδοποιημένης εκτύπωσης)

07Oct14:58 original13816 actual attempt USER FAIL: Render TimeoutError before response/PDF verification (11:57:40Z). Bounded45second deadline/actionable504 fix AWAITING CI/DEPLOY/LAB. No cap reset/repeated payment/identity bypass. Checkpoint2026-10-07-mydata-original-timeout.md; same09owner.

07Oct14:49 independent read-only DB PASS:5310 inbound/5310 uniqueMARK; new5796/MARK400015568480019 received14:47 with original;5796 and16966 each1 attachment job/1 linked draft. Actual initiating request, replay/concurrency NOT TESTED.13816 original failed3attempts OPEN. Old135848/6538 inbound rows lack matching inbox; retain for audit, no recreation.13 focused regressions PASS; pool incident13:21 corroborated, reliability OPEN. Checkpoint2026-10-07-mydata-receiving-db-evidence.md. Same09owner.

07Oct14:39 HARIBO505-16966/MARK400015564403749: actual Apply/display scoped USER PASS13items/net56.20/gross63.50;0.01 within accepted0.05. Preview14:33:13 complete/0review/55pieces. Supersedes13:47 Apply FAIL only. Supplier Χωρίς (AFM094211509 review), close/reopen and independent DB/cash/stock scopes OPEN. PR1819 fullCI4561/mainCI4562/deploy2078 SUCCESS; exact b0acab10 verified before test. Same09owner; checkpoint2026-10-07-mydata-haribo-unit-apply.md. Overall OPEN.

**Κατάσταση:** ΜΕΡΙΚΟ PASS / OPEN · Epsilon BLOCKED EXTERNAL

**Υπόλοιπο / όρια PASS:** 05–06Oct range/XLSX19unique USER PASS23:52; ΤΠΥ2153 original withholding40 confirms200+48−40=208 USER PASS23:58; exceptionCLOSED. RangePDF19records/2pages USER PASS07Oct00:02. Reversed06→05Oct visible validation USER PASS07Oct00:07. Corrected05→06Oct recovery19results/errorclear USER PASS00:11. Υπόλοιπα other date boundaries/roles/devices (ημερήσιο XLSX και αποθηκευμένο PDF10records USER PASS23:44), closed-user-tab checktimestamp00:31→01:01 USER PASS07Oct; νέα παραλαβή/cursor/replay OPEN, πρωτότυπα παρόχων, ίδιο πρόχειρο/βοηθός και LAB POS σύνδεση. Παλαιότερα search/receiving/Excel/PDF/draft επιμέρους PASS διατηρούνται. Πλήρης εξαγωγή αρχείου ακυρωμένη από ιδιοκτήτη, δεν επαναλαμβάνεται.

**Υπεύθυνη σελίδα / branch:** ASSIGNED `codex/mydata-completion-20261006`

07Oct10:48: PEPSICO094043325 existing card saved/displayed and same38467223709516 draft supplier association USER PASS.9items/101.77/NEW; sample missing-supplier residualCLOSED. Other invoices/actual edited-row persistence OPEN. Checkpoint2026-10-07-mydata-pepsico-supplier.md/manual; browserrevision and independent DB deltasNOTCAPTURED.

07Oct10:10: selected unchanged9rows explicit no-change message USER PASS, supersedes01:45 messageFAIL. PR1811/fullCI4544/merge+exacthealth79908d72; checkpoint2026-10-07-mydata-no-change-message.md/manual. Actual changed-row persistence remainsOPEN; this sample supplier association subsequently USER PASS10:48; no finalization/payment/stock.

07Oct12:20: ΑΛΦΑ8114/MARK400015558996362 targeted assistant review and actual same-draft13-row application/display USER PASS;59units/net48.91/VAT6.38/gross55.29,calculated discounts19.10. Initial unprompted economics FAIL. Supplier absent and independent reopen durability OPEN; no posting/payment or DB/stock-effect PASS. Checkpoint2026-10-07-mydata-alfa-8114-apply.md/manual. Other invoices/overall09 OPEN.

07Oct12:59: ΑΛΦΑ8114 existing supplier095697632 saved/displayed and same-draft association plus13items/48.91/55.29 after requested reopen USER PASS. Sample supplier/reopen-display residual CLOSED; actual reopen relies on owner sequence, independent DB/stock/runtime NOT TESTED. Initial unprompted discount reading FAIL. Other invoices/overall09 OPEN; checkpoint2026-10-07-mydata-alfa-8114-apply.md/manual.

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** 2026-10-06T19:40:58+00:00 · ΑΝΑΛΗΨΗ ΑΠΟ `codex/mydata-draft-pos-receipt-20260930` με νεότερη ρητή εντολή ιδιοκτήτη στην παρούσα συνομιλία. Μόνο #09, οι υπόλοιπες αναθέσεις διατηρούνται. `CHECKPOINTS/CHANGES/2026-10-06-mydata-completion.md` · claim PR1794 / CI4508 πλήρες PASS / mergecc4c232e.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** 2026-10-06T19:47:08+00:00 · Περιορισμένο LIVE read-only PASS: αρχείο5305/σημερινά10 και φίλτρο06Oct→06Oct επέστρεψε10of5305. Manual/checkpoint2026-10-06-mydata-completion. Runtime1e59775b. Νεότερο USER23:18: ημερήσιο XLSX10μοναδικάMARK/1647.93 PASS. PDF23:44 USER PASS:10records/all30amounts match XLSX, long number/MARK and series/number separated. PR1799/CI4520 full1871PASS/merge and exacthealth280db4cd. Physical printNOTTESTED.07Oct01:10 closed-tab timestamp00:31:25→01:01:24 USER PASS; checkpoint2026-10-07-mydata-closed-tab-cycle.md.07Oct00:11 correctedrange19/errorclear USER PASS, checkpoint2026-10-07-mydata-invalid-range.md.07Oct00:07 reverseddate visible validation USER PASS; checkpoint2026-10-07-mydata-invalid-range.md.07Oct00:02 rangePDF19records/all57amounts/2pages USER PASS; checkpoint2026-10-07-mydata-range-pdf.md.23:52 USER range05–06Oct/XLSX19unique PASS;18rows reconcile, ΤΠΥ2153/MARK400015532417480 original shows withholding40,200+48−40=208 USER PASS23:58; checkpoint2026-10-06-mydata-2153-withholding.md. PrismaP2024 pool incident observed/recovered, reliabilityOPEN. Checkpoint2026-10-06-mydata-print-overlap.md. Όλο το scope OPEN: Epsilon, closed-tab timestamp USER PASS01:10; νέα scheduled παραλαβή/cursor/replayOPEN, ίδιο draft application και φυσικό POS/λοιπά paths. Καμία οικονομική/stock πράξη. Ίδιος owner παραμένει.

### 10 — Μισθοδοσία / πληρωμές εργαζομένων

**Κατάσταση:** ΜΕΡΙΚΟ PASS / OPEN

**Υπόλοιπο / όρια PASS:** Η LAB περίοδος εξοφλήθηκε. Παραμένουν ανεξάρτητη συμφωνία cash ledger, αποδεικτικά τραπεζικών εγγραφών, πλήρεις κανόνες μισθοδοσίας και real-store acceptance. Τα synthetic LAB fixtures δεν είναι λογιστική απόδειξη.

**Υπεύθυνη σελίδα / branch:** `codex/n10-payroll-reconciliation-20261007` — συνέχεια της ίδιας ανάθεσης N10, χωρίς αλλαγή ιδιοκτήτη.

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** 07/10/2026 12:28 Europe/Athens · Συνέχεια του owner-directed N10 από `codex/n10-payroll-reconciliation-20261006`, branch από main `ac4b8bb4fb8995b54e3ed870329d06af2f192e0f`. Scope: read-only reconciliation της κλειστής περιόδου 09/2026 και των υπαρχουσών cash/bank εγγραφών, συν ρητά εγκεκριμένα, μοναδικά και μόνο-προεπισκόπησης fictional LAB tests σε μελλοντικό 11/2026 για καλυμμένους κανόνες μισθοδοσίας. Προβλέπεται μόνο synthetic attachment/match test στο ήδη υπάρχον Oct −€13.67 pending row, χωρίς επιβεβαίωση/settlement. Απαγορεύονται replay/νέα πληρωμή, μεταβολή Σεπτεμβρίου, δημιουργία/κλείσιμο payroll period, πραγματικό κατάστημα και νομικές παραδοχές για overtime/absence/leave. Checkpoint `CHECKPOINTS/CHANGES/2026-10-07-n10-payroll-lab-acceptance.md`. Προϋπόθεση state-changing LAB: claim PR merged και green CI.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** 07/10/2026 12:28 · Read-only baseline επιβεβαίωσε LAB, September CLOSED 7/€313 paid/€0 balance, October DRAFT 7/€13.67 paid/€0 balance, November preview €0/no period, και τέσσερα pending/no-proof bank rows totaling €206.67. Cash shift aggregate δεν ταυτοποιεί τις υπάρχουσες payroll cash StoreTransaction IDs. Καμία νέα LAB μεταβολή ή PASS δεν έγινε. Βλέπε checkpoint· η πρόσθετη αποδοχή παραμένει OPEN.


**Read-only follow-up (07/10/2026 14:11 Europe/Athens):** The correct /platform-admin entry was confirmed; authenticated scope visibly showed MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ. The current employee list has 8 existing employees versus 7 at the 12:28 baseline. No records were changed. The visible Μισθοδοσία control opens an expense-entry form, the employee form has no payroll-rate field, and the actual-hours view says integration is still in progress. No November preview or synthetic record was created; no period/payment/bank/cash action was made. Additional preview acceptance remains NOT TESTED / OPEN. The deployed /api/health response at 14:41 Europe/Athens was version 0.22.0+kat-test-pos, revision b0acab108fb01836664c3dd807267e7bfde83579. See the updated checkpoint.

**Additional read-only check (07/10/2026 14:50 Europe/Athens):** The exact October −€13.67 row remained without attachment after the visible “Αποδεικτικό” control did not open a file chooser; nothing was selected/uploaded and no confirmation occurred. The selected LAB-POS-02 shift from 26/09 showed two 17:10 payroll expense rows (€100 and €20, cash-shift method), and €120 expenses total, but no StoreTransaction IDs. September shift was not changed or closed; this does not prove exact-ID reconciliation. See checkpoint.
**Read-only follow-up (07/10/2026 15:08 Europe/Athens):** Correct authenticated `/platform-admin` entry and scoped **MYWORKSTATION LAB · ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ** Backoffice confirmed. Four pending bank rows still have no attachment (−€206.67 total); October −€13.67 row `a2a58e32-ad12-409a-8486-daf3e84b7cdb` remains unattached. The matching synthetic PDF is clearly stamped as no-real-payment and not accounting proof; it was not uploaded because both permitted local transfer attempts failed, and no confirmation/settlement occurred. The historical open `LAB-POS-02` shift still shows €120.00 expenses in two rows (€100/€20) but no exact cash `StoreTransaction` IDs; a separate observed open MAIN test shift shows zero amounts/transactions. No record was created, closed, or edited; September untouched. November payroll preview remains NOT TESTED, exact cash IDs and genuine bank proof remain missing. **N10 remains ΜΕΡΙΚΟ PASS / OPEN.** See checkpoint.\n### 11 — Εστίαση / TABLE_SERVICE

**Κατάσταση:** ΜΕΡΙΚΟ PASS / OPEN

**Υπόλοιπο / όρια PASS:** Μεταφορά/ένωση/split, αλλαγή σερβιτόρου, μερικές πληρωμές, χρεώσιμοι modifiers, πλήρες KDS/ειδοποιήσεις, cross-store και reconnect/idempotency αποδοχή. Τα υπάρχοντα τραπέζια/γύροι/αλλεργιογόνα/Android PASS προστατεύονται.

**Υπεύθυνη σελίδα / branch:** agent/table-service-layout-takeover-20260927

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 12 — efood / Pelican

**Κατάσταση:** BLOCKED EXTERNAL

**Υπόλοιπο / όρια PASS:** Αναμονή απάντησης efood. Πραγματικό callback, παραγγελία και παραγωγική πιστοποίηση δεν επιβεβαιώθηκαν.

**Υπεύθυνη σελίδα / branch:** agent/efood-partner-lab-20261004

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 13 — Μεταφορά barcode

**Κατάσταση:** AWAITING LAB

**Υπόλοιπο / όρια PASS:** Υλοποίηση/CI υπάρχουν. Καμία πραγματική LAB μεταφορά· προηγούμενη απόφαση μη δοκιμής τώρα διατηρείται.

**Υπεύθυνη σελίδα / branch:** agent/barcode-catalog-check-20260928

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 14 — Internet αναζήτηση προϊόντων

**Κατάσταση:** READ-ONLY PASS / WRITE OPEN

**Υπόλοιπο / όρια PASS:** Υποβολή/έγκριση πρότασης τιμής, δημιουργία/αποστολή παραγγελίας και ασφαλής Master Catalog σύνδεση.

**Υπεύθυνη σελίδα / branch:** Δεν μεταφέρεται ανάθεση — έλεγχος τρέχοντος checkpoint πριν claim

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 15 — Πρώτη αυτόματη OCR ανάγνωση

**Κατάσταση:** OPEN / ΜΕΛΛΟΝΤΙΚΟ

**Υπόλοιπο / όρια PASS:** Ακρίβεια πολλών προμηθευτών και δύσκολων παραστατικών. Δεν ανοίγει ξανά το Gate 3 βοηθού.

**Υπεύθυνη σελίδα / branch:** Δεν μεταφέρεται ανάθεση — έλεγχος τρέχοντος checkpoint πριν claim

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 16 — Προχωρημένο Chat

**Κατάσταση:** ΜΕΡΙΚΟ PASS / DEVICE OPEN

**Υπόλοιπο / όρια PASS:** Background Push/ήχος, σωστό terminal, pin/σημαντικό/task management, ρόλοι, logout και πολλαπλές συσκευές. Βασικό Chat/read receipts/αρχεία PASS.

**Υπεύθυνη σελίδα / branch:** fix/task16-chat-push-routing-20261001

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 17 — iOS / PWA / εξοπλισμός

**Κατάσταση:** AWAITING DEVICE LAB

**Υπόλοιπο / όρια PASS:** Πραγματικό iPhone/iPad PWA, Push/ήχος/κάμερα, landscape/Surface/tablet και πρόσθετος εξοπλισμός. Android/QR/scanner PASS προστατεύονται.

**Υπεύθυνη σελίδα / branch:** fix/task17-apple-push-20261001

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 18 — Backup / restore / monitoring

**Κατάσταση:** ΝΕΟ LIVE FAIL / OPEN

**Υπόλοιπο / όρια PASS:** Παλιό backup PASS. Νεότερο HeadObject 404: επιβεβαίωση διόρθωσης σε cron. Πραγματική απομονωμένη επαναφορά, disaster recovery και πλήρης monitoring αποδοχή εκκρεμούν.

**Υπεύθυνη σελίδα / branch:** Δεν μεταφέρεται ανάθεση — έλεγχος τρέχοντος checkpoint πριν claim

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 19 — GitHub / Render build efficiency

**Κατάσταση:** FINAL PASS

**Υπόλοιπο / όρια PASS:** Δεν εντοπίστηκε ενεργό υπόλοιπο του συμφωνημένου scope.

**Υπεύθυνη σελίδα / branch:** Δεν μεταφέρεται ανάθεση — έλεγχος τρέχοντος checkpoint πριν claim

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 20 — Αγορά + δώρο / stock ledger

**Κατάσταση:** FINAL LAB PASS

**Υπόλοιπο / όρια PASS:** Ολοκληρωμένο. Καμία επανάληψη της δοκιμαστικής πώλησης.

**Υπεύθυνη σελίδα / branch:** Δεν μεταφέρεται ανάθεση — έλεγχος τρέχοντος checkpoint πριν claim

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 21 — Καρτέλα προμηθευτών / exports

**Κατάσταση:** USER/LAB PASS / ΟΡΙΑ NOT TESTED

**Υπόλοιπο / όρια PASS:** Οθόνη/XLSX/εκτυπώσιμη αναφορά PASS. Φυσική εκτύπωση/native PDF και ανεξάρτητος DB count δεν καλύπτονται.

**Υπεύθυνη σελίδα / branch:** Δεν μεταφέρεται ανάθεση — έλεγχος τρέχοντος checkpoint πριν claim

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 22 — Κανάλι / ομαδική τιμολόγηση

**Κατάσταση:** OPEN

**Υπόλοιπο / όρια PASS:** Συγκεκριμένη υλοποίηση και αποδοχή.

**Υπεύθυνη σελίδα / branch:** Δεν μεταφέρεται ανάθεση — έλεγχος τρέχοντος checkpoint πριν claim

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 23 — POS Αποστολή Τιμολογίου

**Κατάσταση:** OPEN / SCOPE REVIEW

**Υπόλοιπο / όρια PASS:** Έλεγχος υπάρχουσας ροής πριν από νέα υλοποίηση, ώστε να μη διπλασιαστεί Gate 3.

**Υπεύθυνη σελίδα / branch:** Δεν μεταφέρεται ανάθεση — έλεγχος τρέχοντος checkpoint πριν claim

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 24 — Κανάλι/POS - AI Reader - BackOffice

**Κατάσταση:** OPEN / SCOPE REVIEW

**Υπόλοιπο / όρια PASS:** Ορισμός νέου scope πέρα από τον περασμένο βοηθό τιμολογίων.

**Υπεύθυνη σελίδα / branch:** Δεν μεταφέρεται ανάθεση — έλεγχος τρέχοντος checkpoint πριν claim

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 25 — Συγκεντρωτικές εκκρεμότητες

**Κατάσταση:** ΜΕΡΙΚΟ READ-ONLY PASS / OPEN

**Υπόλοιπο / όρια PASS:** Θετική pending πληρωμή/link, ανεξάρτητος Owner/adversarial roles, unavailable sources/caps και χαμηλό μη αρνητικό stock.

**Υπεύθυνη σελίδα / branch:** codex/task25-pending-sources-20261001

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 26 — Μηνιαία εικόνα ταμία

**Κατάσταση:** ΜΕΡΙΚΟ UI PASS / OPEN

**Υπόλοιπο / όρια PASS:** Θετικές πωλήσεις/βάρδιες με verified εργαζόμενο, Owner και πλήρης αποδοχή αποτελεσμάτων/score.

**Υπεύθυνη σελίδα / branch:** codex/task26-monthly-cashier-20261001

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 27 — Κερδοφορία / έξοδα

**Κατάσταση:** ΜΕΡΙΚΑ LAB PASS / OPEN

**Υπόλοιπο / όρια PASS:** Owner χωρίς SA, πραγματικό mobile/tablet, ιστορικό κόστος, διαφορετικές ημερομηνίες/μήνες, credit/reversal/overpayment, νέα CSV/native/φυσική εκτύπωση. Δόσεις, CENT και ZERO-VAT PASS προστατεύονται.

**Υπεύθυνη σελίδα / branch:** codex/task27-resume-20261005

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 28 — Απώλειες / ύποπτα μοτίβα

**Κατάσταση:** OPEN

**Υπόλοιπο / όρια PASS:** Υλοποίηση και αποδοχή με ανθρώπινη επιβεβαίωση.

**Υπεύθυνη σελίδα / branch:** Δεν μεταφέρεται ανάθεση — έλεγχος τρέχοντος checkpoint πριν claim

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 29 — Σύγκριση προμηθευτών

**Κατάσταση:** ΜΕΡΙΚΟ COST PASS / OPEN

**Υπόλοιπο / όρια PASS:** 23 κωδικοί/4 παραστατικά έχουν περιορισμένο PASS. Δύο προμηθευτές για ίδιο προϊόν, ιστορικό, μονάδες/συσκευασίες, ρόλοι, mobile και Owner visual εκκρεμούν.

**Υπεύθυνη σελίδα / branch:** codex/task29-supplier-comparison-20261004

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 30 — Προτάσεις παραγγελίας

**Κατάσταση:** ΥΛΟΠΟΙΗΣΗ / ΜΕΡΙΚΟ LAB / OPEN

**Υπόλοιπο / όρια PASS:** Αριθμητικό readback υπάρχει. Residual horizontal overflow/help FAIL, τελική desktop/Owner/device αποδοχή. Pending orders και συσκευασίες δεν υπολογίζονται στην καταγεγραμμένη έκδοση.

**Υπεύθυνη σελίδα / branch:** codex/task30-order-suggestions-20261005

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 31 — Προϊόντα χαμηλής απόδοσης

**Κατάσταση:** PR1772 / OPEN

**Υπόλοιπο / όρια PASS:** Υλοποίηση υπάρχει. Τελικό head CI4484 failure: Linux cancelled/build skipped, Windows PASS. Νεότερο main reconciliation, πράσινο CI, merge/deploy, read-only LAB/Owner/device αποδοχή.

**Υπεύθυνη σελίδα / branch:** codex/task31-product-value-20261005

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 32 — AI Βοηθός Ιδιοκτήτη

**Κατάσταση:** OPEN

**Υπόλοιπο / όρια PASS:** Σαφές επιτρεπόμενο scope, υλοποίηση και πραγματική αποδοχή.

**Υπεύθυνη σελίδα / branch:** Δεν μεταφέρεται ανάθεση — έλεγχος τρέχοντος checkpoint πριν claim

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 33 — Μηνιαία Αναφορά Ιδιοκτήτη

**Κατάσταση:** OPEN

**Υπόλοιπο / όρια PASS:** Συμφωνία αποτελεσμάτων και έγκριση πριν PDF/email.

**Υπεύθυνη σελίδα / branch:** Δεν μεταφέρεται ανάθεση — έλεγχος τρέχοντος checkpoint πριν claim

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 34 — Έξυπνο Audit / Συμβάντα

**Κατάσταση:** ASSIGNED / CI4496,4499,4501 PASS / EXACT LIVE VERIFIED / LAB PENDING

**Υπόλοιπο / όρια PASS:** Υλοποίηση και νέο user-reported πρόβλημα: Store Mode εμφανίζει συμβάντα άλλων καταστημάτων. Δεν δηλώνεται διορθωμένο.

**Υπεύθυνη σελίδα / branch:** fix/report-store-context-20261006

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** 2026-10-06T18:50:34.327556+00:00 — selected-store report/Audit context only; CHECKPOINTS/CHANGES/2026-10-06-report-store-context.md. Claim PR1787/CI4494 SUCCESS/merge2d8a187c before code.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** 06/10 — local build/server/DOM technical PASS only; exact CI/deploy and read-only two-store LAB acceptance pending. Same owner retained; no financial/shift replay.

PR1788 merged a5cac431 after full CI4496 SUCCESS (1871 PASS/0 FAIL/0 SKIP). Empty-selection membership guard follow-up: 9 focused PASS, awaiting exact CI/deploy. Owner retained; read-only two-store LAB acceptance still required.

PR1790/head6e081d95 passed CI4499, merged db1f90eb; main CI4501 SUCCESS. Exact LIVE verification and read-only two-store acceptance pending; owner retained.

Exact LIVE /api/health 2026-10-06T19:17Z ok=true, revision=db1f90eb63092d03fa59a06f8e02a01a950c5262. Deployment publication PASS; authenticated read-only two-store LAB NOT TESTED (native credential protection). Existing manual handoff; owner retained.

### 35 — Τελικές δοκιμές ρόλων/modules

**Κατάσταση:** OPEN

**Υπόλοιπο / όρια PASS:** Owner/manager/ταμίας/εργαζόμενος/SA, εταιρεία/κατάστημα και άδειες ανά νέο module. Gate 8 PASS δεν καλύπτει κάθε επέκταση.

**Υπεύθυνη σελίδα / branch:** Δεν μεταφέρεται ανάθεση — έλεγχος τρέχοντος checkpoint πριν claim

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 36 — Πλήρες εγχειρίδιο χρήσης

**Κατάσταση:** OPEN

**Υπόλοιπο / όρια PASS:** Συγκεντρωτική κάλυψη εργαζομένου/ιδιοκτήτη/SA. Υπάρχουν επιμέρους manuals.

**Υπεύθυνη σελίδα / branch:** Δεν μεταφέρεται ανάθεση — έλεγχος τρέχοντος checkpoint πριν claim

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

## Πρόσθετα υπόλοιπα και TODAY UI

### SHIFT-QR — Κλείσιμο βάρδιας με QR/κάρτα

**Κατάσταση:** ΜΕΡΙΚΟ PASS / OPEN

**Υπόλοιπο / όρια PASS:** Άλλος/ανακλημένος/ξένος QR, camera/autofill, ανεξάρτητο OUT/Audit και πλήρης φυσική οικονομική συμφωνία.

**Υπεύθυνη σελίδα / branch:** fix/pos-shift-close-qr-camera-20261005

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### REMOTE-INSTALL-01 — Απομακρυσμένος οδηγός εγκατάστασης

**Κατάσταση:** LIVE / AWAITING DEVICE

**Υπόλοιπο / όρια PASS:** Windows PC, pairing/writer, restart, φυσικός εξοπλισμός και ενιαίος οδηγός.

**Υπεύθυνη σελίδα / branch:** codex/remote-install-wizard-20261005· άλλες εγκαταστάσεις στους υπάρχοντες υπευθύνους

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### PAY-01 — Μικτή πληρωμή RBS/EFTPOS

**Κατάσταση:** OPEN

**Υπόλοιπο / όρια PASS:** Χωριστή αποδοχή fiscal/EFTPOS, χωρίς αναίρεση Gate 4 PASS.

**Υπεύθυνη σελίδα / branch:** Δεν καταγράφεται ενεργή ανάθεση — επιβεβαίωση πριν από claim

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### WORKFORCE-ADV — Άδειες / απόδοση / κανόνες

**Κατάσταση:** OPEN

**Υπόλοιπο / όρια PASS:** Άδειες/υπόλοιπα/δικαιολογητικά, αντικαταστάσεις, ανάπαυση, διαθεσιμότητα, αλλαγές βαρδιών και αναλύσεις.

**Υπεύθυνη σελίδα / branch:** Έλεγχος τρέχοντος owner πριν ανάθεση

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### INVENTORY-ADV — Inventory 2.0 επεκτάσεις

**Κατάσταση:** OPEN

**Υπόλοιπο / όρια PASS:** Απογραφή/αιτιολογία, μεταφορές, φύρα/ληγμένα, ιδιοκατανάλωση, ταυτόχρονες κινήσεις. Χωριστά από Gate 2.

**Υπεύθυνη σελίδα / branch:** Έλεγχος τρέχοντος owner πριν ανάθεση

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### AI-CC-LIMITS — AI Command Center όρια PASS

**Κατάσταση:** ΑΡΧΙΚΟ ΠΛΑΝΟ CLOSED / NOT TESTED

**Υπόλοιπο / όρια PASS:** Τα κλικ μετάβασης Full Digital Twin δεν δοκιμάστηκαν. Δεν ανοίγουν ξανά οι οπτικές αποδοχές 1–14.

**Υπεύθυνη σελίδα / branch:** Προηγούμενος owner — νέα επέκταση μόνο με ανάθεση

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### OPTIONAL-MODULES — Oxygen / Radio / αναλύσεις / billing

**Κατάσταση:** OPEN

**Υπόλοιπο / όρια PASS:** Πλήρης αποδοχή προαιρετικών modules, gates και αδειοδότηση/χρέωση.

**Υπεύθυνη σελίδα / branch:** Έλεγχος ανά ανεξάρτητο module

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### RELIABILITY — Σταθερότητα / staging

**Κατάσταση:** OPEN

**Υπόλοιπο / όρια PASS:** Recovery από διακοπή, monitoring εφαρμογής/DB/ουρών/χώρου, staging και επιβεβαίωση pool-exhaustion mitigation.

**Υπεύθυνη σελίδα / branch:** Έλεγχος τρέχοντος owner πριν ανάθεση

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### TODAY-01 — Επιλογή EFTPOS

**Κατάσταση:** DESKTOP VISUAL PASS / ΟΡΙΑ

**Υπόλοιπο / όρια PASS:** Πληρωμή/mobile δεν καλύπτονται από visual PASS.

**Υπεύθυνη σελίδα / branch:** Υπάρχουσα TODAY σελίδα

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### TODAY-02 — Επεξεργασία είδους/ΦΠΑ

**Κατάσταση:** IN PROGRESS

**Υπόλοιπο / όρια PASS:** Save/readback, διατήρηση πολλών προμηθευτών και τελική αποδοχή.

**Υπεύθυνη σελίδα / branch:** Υπάρχουσα TODAY σελίδα

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### TODAY-03 — Κεντρικά προϊόντα UI

**Κατάσταση:** IN PROGRESS

**Υπόλοιπο / όρια PASS:** Πλήρης visual αποδοχή και no outer scroll.

**Υπεύθυνη σελίδα / branch:** agent/today03-full-page-live-record-20261004

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### TODAY-04 — Κεντρική Διαχείριση: πλήρης LIVE έλεγχος

**Κατάσταση:** ASSIGNED / IN PROGRESS · LIVE ACCESS BLOCKED

**Υπόλοιπο / όρια PASS:** Απογραφή και πραγματικός LIVE έλεγχος κάθε βασικής ενότητας, tab, sub-tab, action και οθόνης που ανοίγει από αυτά· normal/maximize, ορατότητα, πραγματικό vertical scroll ως το τελευταίο λειτουργικό στοιχείο, dropdowns/checkboxes/search/filters/navigation, κάτω/δεξί clipping, αναγνωσιμότητα και regression matrix. Απαιτείται επαλήθευση τρέχουσας production revision. Ιστορική παρατήρηση Bulk Price 07/10 00:25 στο revision `6caa27b7e0667b453ef99db13360e3c0c6e561c1`: normal scroll έφτανε Preview· maximize έκοβε τη φόρμα και το scroll δεν κινούσε. Δεν μεταφέρεται ως τρέχον PASS/FAIL χωρίς νέα LIVE επαλήθευση.

**Υπεύθυνη σελίδα / branch:** ASSIGNED `codex/central-management-live-audit-20261007` — ρητή ανάθεση ιδιοκτήτη 07/10/2026· παλιό handoff μη διαθέσιμο, χωρίς επινόηση αποδέσμευσης. Documentation follow-up: `codex/central-management-auth-blocker-20261007-1335`, based on `5dbac0b3f7580128d4eeac3b4332ffada672cd98`.

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** 07/10/2026 12:09 Athens · Πλήρης Κεντρική Διαχείριση και ασφαλείς scoped διορθώσεις μετά από claim PR/green CI/merge. Τελευταίο γνωστό main `4e1f96ea78ca3a92b4ad7a900b09766f4502d7fd`. Ελέγχθηκαν ανοιχτά PR #1735/#1702 και τα κοινά checkpoints. Checkpoint `CHECKPOINTS/CHANGES/2026-10-07-central-management-bulk-price-scroll.md`. Claim PR #1814 merged as `324a58d64ba75cd1de514bce7e8e333286139d01`; latest main checked for this update: `5dbac0b3f7580128d4eeac3b4332ffada672cd98`.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Μερική ενημέρωση μόνο· το TODAY-04 παραμένει OPEN / LIVE ACCESS BLOCKED. 07/10/2026, 13:35 Athens: άνοιξε η ακριβής σελίδα `/platform-admin`. Η φόρμα εισόδου εμφανίστηκε· η ασφαλής browserAuth υποβολή επέστρεψε `submitted`, αλλά η σελίδα εμφάνισε «Παρουσιάστηκε εσωτερικό σφάλμα.». Δεν έγινε δεύτερη προσπάθεια. Δεν ελέγχθηκαν dashboard, καρτέλες ή ενέργειες· όλα παραμένουν NOT TESTED/BLOCKED. Η production revision δεν επαληθεύτηκε. Δεν έγινε πώληση, χρέωση, εφαρμογή τιμής, μεταβολή αποθέματος/φορολογικών ή άλλη μη αναστρέψιμη ενέργεια. Screenshot capture timeout· η ένδειξη σφάλματος επαληθεύτηκε από accessibility state.

### TODAY-05 — Προσφορές UI

**Κατάσταση:** ΜΕΡΙΚΟ VISUAL / OPEN

**Υπόλοιπο / όρια PASS:** Προβολή/αφαίρεση επιλεγμένων, λειτουργική δημιουργία/αποστολή.

**Υπεύθυνη σελίδα / branch:** Υπάρχουσα TODAY σελίδα

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### TODAY-06 — Excel / Barcode UI

**Κατάσταση:** ΜΕΡΙΚΟ VISUAL / OPEN

**Υπόλοιπο / όρια PASS:** Πραγματικές ενέργειες της ανανεωμένης οθόνης.

**Υπεύθυνη σελίδα / branch:** Υπάρχουσα TODAY σελίδα

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### TODAY-07 — Άγνωστο barcode απογραφής

**Κατάσταση:** IN PROGRESS

**Υπόλοιπο / όρια PASS:** Σύνδεση/δημιουργία και επιστροφή στην ίδια ενεργή απογραφή σε mobile/tablet.

**Υπεύθυνη σελίδα / branch:** Υπάρχουσα TODAY σελίδα

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### TODAY-08 — Εμπορικά modules UI

**Κατάσταση:** CODE CI PASS / OPEN

**Υπόλοιπο / όρια PASS:** Exact LIVE visual αποδοχή νέας ιεραρχίας και εξουσιοδοτημένων λειτουργιών.

**Υπεύθυνη σελίδα / branch:** Υπάρχουσα TODAY σελίδα / PR1775

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### TODAY-09 — Σελίδα ιδιοκτήτη UI

**Κατάσταση:** IN PROGRESS

**Υπόλοιπο / όρια PASS:** Απλοποίηση και πραγματική αποδοχή βαρδιών/πληρωμών.

**Υπεύθυνη σελίδα / branch:** Υπάρχουσα TODAY σελίδα

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### DOC-NUM-01 — Κεντρική αριθμημένη λίστα και κανόνας PASS

**Κατάσταση:** PASS · DOCUMENTATION COMPLETE

**Υπόλοιπο / όρια PASS:** Δημοσιεύτηκαν η διορθωμένη Markdown/PDF λίστα 51 εργασιών, ο generator και σύνδεσμοι από AGENTS, tracker, pending/active lists. Η λίστα αντιστοιχίζει κάθε εκτυπωμένο αριθμό σε tracker ID/status και αποσαφηνίζει #03/#18/#42, supplier PDF/print, cashier report, order suggestions, cross-store Audit και TODAY-08. Κανόνας για όλες τις σελίδες: πλήρες συμφωνημένο κριτήριο + τεκμήριο = PASS· μερική ολοκλήρωση αφήνει residual OPEN. Έλεγχος local generation/text extraction: 51 tracker IDs, PDF 4 A4 pages, no clipping. Έγγραφα μόνο; κανένα product/LAB/financial/stock mutation.

**Υπεύθυνη σελίδα / branch:** Ολοκληρώθηκε από την τρέχουσα συνομιλία Codex Work · PR #1797 merged.

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** 2026-10-06T23:08:45+03:00 · Ανάληψη για έκδοση κεντρικής αρίθμησης και κοινό κανόνα ενημέρωσης PASS. `CHECKPOINTS/CHANGES/2026-10-06-numbered-work-checklist.md`. Χωρίς μεταφορά άλλης ανάθεσης.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** 2026-10-06T23:17:52+03:00 · Η λίστα/γεννήτρια/παραπομπές ολοκληρώθηκαν. PR #1797 merged στο main με commit `65d2c75d2ef16d04b13c95e25b77438d424f6e5f`. Τελικό CI #4516 SUCCESS στο PR head `fcef2ab7db2465b5659ead25c5b1121f594e510d` (docs classification και Windows parse/smoke PASS· build/tests εφαρμογής skipped ως documentation-only). Το content commit `20b346859d8b98df43562086d36477cac72a3c04` παραμένει στην ιστορία του merge.

### INSTALL-SUPPORT — Super Admin: Εγκαταστάσεις & Υποστήριξη

**Κατάσταση:** OPEN / NOT IMPLEMENTED / NOT TESTED

**Υπόλοιπο / όρια PASS:** Καρτέλα ανά κατάστημα, εγκαταστάσεις/checklist/παράδοση, βλάβες/αναθέσεις/επιβεβαίωση, αρχεία/οδηγίες, συντήρηση, κεντρική εικόνα και PDF/Excel. Μόνιμη αποθήκευση, Audit και ανεξάρτητοι έλεγχοι company/store/role/attachments. Πλήρη κριτήρια: docs/roadmap/INSTALLATIONS_SUPPORT_REQUIREMENTS_2026-10-07.md.

**Υπεύθυνη σελίδα / branch:** Υλοποίηση μη ανατεθειμένη. Μόνο καταγραφή απαίτησης: codex/install-support-requirements-20261007. Δεν αλλάζει άλλες αναθέσεις.

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** 07/10/2026 01:11 Europe/Athens — ρητή εντολή ιδιοκτήτη για καταγραφή στο main, όχι έναρξη υλοποίησης.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Μόνο τεκμηρίωση απαίτησης· το module παραμένει OPEN. Καμία αλλαγή κώδικα, βάσης ή LAB πράξη. Σχετικές υπάρχουσες αναθέσεις εγκατάστασης/backup/remote/audit/manual διατηρούνται.
