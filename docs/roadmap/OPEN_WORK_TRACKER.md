# MyWorkStation — κοινό μητρώο εκκρεμοτήτων και αναθέσεων

Έκδοση 07/10/2026 · Ευρώπη/Αθήνα · Βάση main 6f370e1b2aad887a4aa380e27e462391f05b2ca5.

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

07Oct19:32 owner accepts available original13816; automatic-download sample waived/deferred, no more retry and no PDF-delivery PASS.19:33 independent saved-row DB PASS: PEPSICO9/101/101.77,ALFA13/59/55.29,HARIBO13/55/63.50,all existing NEW orders; known PEPSICO/ALFA supplier VATs persisted,HARIBO supplierNULL. Current same-store POS receipts0: POS linkage NOT TESTED. Overall OPEN; checkpoint2026-10-07-mydata-owner-original-and-persistence.md. Same owner; no repeat completed steps.

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
**Read-only follow-up (07/10/2026 15:08 Europe/Athens):** Correct authenticated `/platform-admin` entry and scoped **MYWORKSTATION LAB · ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ** Backoffice confirmed. Four pending bank rows still have no attachment (−€206.67 total); October −€13.67 row `a2a58e32-ad12-409a-8486-daf3e84b7cdb` remains unattached. The matching synthetic PDF is clearly stamped as no-real-payment and not accounting proof; it was not uploaded because both permitted local transfer attempts failed, and no confirmation/settlement occurred. The historical open `LAB-POS-02` shift still shows €120.00 expenses in two rows (€100/€20) but no exact cash `StoreTransaction` IDs; a separate observed open MAIN test shift shows zero amounts/transactions. No record was created, closed, or edited; September untouched. November payroll preview remains NOT TESTED, exact cash IDs and genuine bank proof remain missing. **N10 remains ΜΕΡΙΚΟ PASS / OPEN.** See checkpoint.

**Real-store acceptance pending (07/10/2026 17:24 Europe/Athens):** NOT TESTED; no normal-store action was performed. Schedule a separate normal-store acceptance, verify the selected store and read-only baseline, and agree the scope before any test. No real payment/confirmation/settlement or September replay/change. Exact cash `StoreTransaction` IDs, genuine bank-movement proof, and the supported November preview remain outstanding; synthetic LAB material is not accounting evidence. **N10 remains ΜΕΡΙΚΟ PASS / OPEN.**

### 11 — Εστίαση / TABLE_SERVICE

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

**Κατάσταση:** PASS — 07/10/2026 20:06 Europe/Athens

**Υπόλοιπο / όρια PASS:** Συμφωνημένη εταιρική μεταφορά, live confirmation/cancel/readback/POS/Audit/guard και ανεξάρτητη stock-price-financial συμφωνία ολοκληρώθηκαν. Αρνητικά role/tenant/reset/concurrency/stale-card σενάρια ελέγχθηκαν isolated HTTP/Postgres CI, όπως προβλεπόταν. Φυσικός scanner και νέα πραγματική εγκατάσταση δεν περιλαμβάνονται στο PASS. Άλλα barcode/Excel/απογραφή scopes παραμένουν χωριστά.

**Υπεύθυνη σελίδα / branch:** codex/n13-barcode-transfer-lab-20261007 · ολοκληρωμένο, χωρίς υπόλοιπο προς ανάληψη.

**Ανάληψη:** 07/10/2026 15:12 Europe/Athens, ρητή εντολή ιδιοκτήτη, από agent/barcode-catalog-check-20260928· claim PR1826.

**Ολοκλήρωση:** 07/10/2026 20:06 Europe/Athens — Νο13 PASS, συμφωνημένο scope ολοκληρώθηκε. Existing transfer/Audit at0245f30d, corrected POS lookup at8836c1c and deployed guard exact5ccf23b25ce5d827abbe7e4141aa8ce5b4c5c443 verified via health. One save of pre-deploy TEST1 card returned «Άνοιξε ξανά την καρτέλα πριν αποθηκεύσεις: απαιτείται έλεγχος της τρέχουσας αντιστοίχισης barcode.». Fresh measured DB17:06:12Z before/after EXACT equal for barcode rows, ProductupdatedAt/cardAudit counts, prices, stock/movements, all22transaction groups and both open MAIN/LABPOS02 shifts. No checkout/payment/restore transfer; barcode remains TEST2. Owner-cleared POS cart visibly total0; financial DB unchanged. CI4604/1877tests0fail/build/invariants/HTTP proves same-company/reset/roles/tenant/stale/duplicate/rollback/competing transfers/fresh-card save and both POS catalogs. These are isolated CI scenarios, not live role/scanner PASS. Physical scanner and future store installation remain outside this accepted scope. Other assigned barcode/Excel/inventory/Internet tasks preserved.
Τεκμήρια: CHECKPOINTS/CHANGES/2026-10-07-n13-barcode-transfer-lab.md · docs/manual/barcode-transfer/PASS.md · PR1828/1829/1834/1836 · CI4601/4604/4607. Ο κωδικός μεταφέρθηκε μία φορά, δεν επαναλήφθηκε πληρωμή.

### 14 — Internet αναζήτηση προϊόντων

**Κατάσταση:** READ-ONLY PASS / WRITE OPEN · συνέχιση περιορισμένου read-only ελέγχου ASSIGNED

**Υπόλοιπο / όρια PASS:** Το read-only USER/LAB PASS της 01/10 παραμένει ως έχει. Owner live και fail-closed behavior αν ο provider είναι ήδη ανενεργός: NOT TESTED. Ασφαλής σύνδεση με Master Catalog: OPEN. Υποβολή/έγκριση πρότασης τιμής και δημιουργία/αποστολή παραγγελίας παραμένουν OPEN και εκτός της παρούσας ανάθεσης. Χωρίς αλλαγές τιμών/ΦΠΑ, provider settings, παραγγελίες, πληρωμές ή stock.

**Υπεύθυνη σελίδα / branch:** ASSIGNED `codex/task14-owner-provider-readonly-20261007-r1`

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** 07/10/2026 19:38 Europe/Athens — Ο ιδιοκτήτης ζήτησε συνέχεια του Νο 14. ASSIGNED: codex/task14-owner-provider-readonly-20261007-r1. Περιορισμένο scope: read-only επιβεβαίωση πρόσβασης Owner και fail-closed συμπεριφοράς όταν ο provider είναι ήδη ανενεργός, καθώς και έλεγχος ασφαλούς σύνδεσης με Master Catalog χωρίς αλλαγές δεδομένων. Δεν θα αλλάξω τιμές/ΦΠΑ, δεν θα υποβάλω ή εγκρίνω πρόταση τιμής, δεν θα δημιουργήσω/στείλω παραγγελία, δεν θα κάνω πληρωμή/stock write ούτε θα αλλάξω ρυθμίσεις provider. Το read-only USER/LAB PASS της 01/10/2026 παραμένει τεκμηριωμένο και δεν επαναλαμβάνεται. Οι υπόλοιπες write ροές μένουν OPEN. Checkpoint: CHECKPOINTS/CHANGES/2026-10-01-task14-internet-search-lab.md. PR #1833 (documentation-only; CI in progress).

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** IN PROGRESS — δεν έχει εκτελεστεί νέος live έλεγχος.

### 15 — Πρώτη αυτόματη OCR ανάγνωση

**Κατάσταση:** OPEN / ΜΕΛΛΟΝΤΙΚΟ

**Υπόλοιπο / όρια PASS:** Ακρίβεια πολλών προμηθευτών και δύσκολων παραστατικών. Δεν ανοίγει ξανά το Gate 3 βοηθού.

**Υπεύθυνη σελίδα / branch:** Δεν μεταφέρεται ανάθεση — έλεγχος τρέχοντος checkpoint πριν claim

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** Διατήρηση παλιάς ανάθεσης όπου υπάρχει· νέα καταγραφή εκκρεμεί.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Βλέπε υπάρχοντα τεκμήρια PASS· κάθε νέο αποτέλεσμα καταγράφεται εδώ.

### 16 — Προχωρημένο Chat

08/10/2026 00:02 Europe/Athens — Νο16 mobile Chat USER FAIL: Android Chrome φωτογραφία6274 και ρητή δήλωση ιδιοκτήτη ότι δεν μπορεί να δει μηνύματα ούτε να γράψει. Μεγάλη κάθετη toolbar γεμίζει το modal. Περιορισμένη responsive αλλαγή: mobile ρυθμίσεις κλειστές πίσω από «Ρυθμίσεις Chat», compact φίλτρα/compose, ύψος dynamic viewport και ανεξάρτητη κύλιση μηνυμάτων. AWAITING CI/deploy/physical LAB, όχι mobile PASS. Android subscription0→1 PASS07Oct23:56 και προηγούμενα OWNER/assignment/logout/anonymous PASS διατηρούνται. Push παραλαβή/ήχος περιμένουν τη διόρθωση mobile UI· κανένα νέο μήνυμα εστάλη. Νο16 overallOPEN, ίδιος ownercodex/n16-owner-acceptance-20261007.

07/10/2026 23:56 Europe/Athens — Νο16 περιορισμένο Android Push ΕΓΓΡΑΦΗΣ LAB PASS. Πραγματικό Android Chrome/SuperAdmin στο ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ δείχνει «Push ενεργό» (6273.jpg). Fresh BEFORE20:53:43.162253Z subscriptions0/pushAudit3/messages50/tasks3· AFTER20:56:51.927421Z subscriptions1/pushAudit4, subscription/chat-push-1791406568214-t1tajv4hn6g και STORE_CHAT_PUSH_SUBSCRIBED20:56:08.22Z με actorcms1k1bje001xhn3xulr0rooz στο σωστό LAB/company. AFTER20:57:19.226655Z messages50/tasks3 ίδια. Exact servedhealth26ccf2cc5b9eda8d1504c3aa49aca1089a18b6ea και PUSH_SUBSCRIBE bundle επιβεβαιώθηκαν πριν την προσπάθεια· το screenshot δεν αποδεικνύει χωριστά mobile revision. Δεν εστάλη νέο μήνυμα/εργασία. Πραγματική παραλαβή, ήχος, tap σωστού store και πολλαπλές συσκευές NOT TESTED. Η αιτία προηγούμενου FAIL δεν τεκμηριώθηκε και δεν αποδίδεται η επιτυχία αυθαίρετα σε μπαταρία ή αλλαγή διάγνωσης. Παλαιά PASS/owners διατηρούνται, Νο16 overallOPEN/ASSIGNED codex/n16-owner-acceptance-20261007.

07/10/2026 23:25–23:41 Europe/Athens — Νο16 Android ενεργοποίηση Push LAB FAIL: φυσικό Android Chrome/SuperAdmin στο ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ επέστρεψε το ίδιο γενικό σφάλμα εγγραφής, ακόμη μετά τη ζητημένη επιλογή «Χωρίς περιορισμούς». Site και OS άδειες ειδοποιήσεων εμφανίζονται ενεργές. SQL20:44:27.056895Z: LABsubscriptions0/pushAudit3, όπως baseline20:01:49.30245Z. Δεν εστάλη δοκιμαστικό μήνυμα ούτε δημιουργήθηκε εργασία. Πραγματική παραλαβή/ήχος NOT TESTED· ακριβής mobile revision και οικονομικά πριν/μετά τελευταίας απόπειρας NOT CAPTURED. Προσθήκη ασφαλών κωδικών browser error names και διατήρηση error στην οθόνη αντί καθαρισμού από polling: AWAITING LAB, όχι διόρθωση αιτίας. Παλαιά OWNER/assignment/logout/anonymous PASS και λοιποί owners διατηρούνται. ASSIGNED codex/n16-owner-acceptance-20261007, Νο16 overallOPEN. Checkpoint2026-10-07-n16-android-push-diagnostic.md.

07/10/2026 23:00 Europe/Athens — Νο16 περιορισμένο ανώνυμο API LAB PASS: PATCH υπάρχουσας εργασίας chat-task-1791393082635-c4vy05z23ea χωρίς cookies/token απορρίφθηκε401 «Απαιτείται σύνδεση» στο exact live955fa2a0dd53a498a9c59cafb5aad807bc057b7c. SQL BEFORE19:59:49.631903Z/AFTER20:00:43.029311Z: ίδια εργασίαOPEN/LABPOS2/assignedAt/assignedBy,50messages/3tasks/fixtureReads0/audit20,22financialgroups/2open shifts/controlstore0 αμετάβλητα. Δεν πιστοποιεί αυθεντικοποιημένο αρνητικό ρόλο/tenant ή token revocation. OWNER keyboard/logout PASS διατηρούνται. Νο16 overallOPEN για live αρνητικούς ρόλους/tenant και πραγματικές συσκευές/Push/ήχο. Android δηλώθηκε διαθέσιμο, αναμονή πραγματικής ενεργοποίησης και επιβεβαίωσης συνδρομής πριν ένα νέο μήνυμα. Owner codex/n16-owner-acceptance-20261007 διατηρείται. Checkpoint2026-10-07-n16-anonymous-api-acceptance.md.

07/10/2026 22:18–22:25 Europe/Athens — Νο16 περιορισμένο LAB PASS πραγματικού OWNER: selector click/Escape/Enter δεν διαβάζει το ΝΕΟ μήνυμα. ArrowDown άλλαξε τον υπεύθυνο της υπάρχουσας εργασίας chat-task-1791393082635-c4vy05z23ea από LAB POS 2 σε Άγγελο και ArrowUp επανέφερε LAB POS 2. assignedBy και δύο STORE_CHAT_TASK_ASSIGNED Audit επιβεβαιώνουν OWNER cmtpopbgm000rrhb5xk15uytz· fixtureAudit18→19→20, fixtureReads0 και 50unread αμετάβλητα. Κανονική έξοδος μετά κλείσιμο Chat, reload στη φόρμα σύνδεσης και ασφαλής επανείσοδος στον ίδιο OWNER PASS· νέο LOGIN_SUCCESS19:24:35.667Z, ίδια εργασία OPEN/υπεύθυνος/ιστορικό. Φρέσκα SQL πριν/μετά κάθε ενέργεια:50messages/3tasks,22financialgroups/2open shifts/controlstore0 αμετάβλητα. Δεν δημιουργήθηκε εργασία και δεν επαναλήφθηκαν παλαιά PASS. Runtime9230c0ab για keyboard/ανάθεση, b7e4da2f για logout. Τεκμήρια CHECKPOINTS/CHANGES/2026-10-07-n16-owner-acceptance.md και CHECKPOINTS/EVIDENCE/n16-owner-*.json. Νο16 συνολικά OPEN: live αρνητικοί API ρόλοι/tenant, server token revocation, πολλαπλές/πραγματικές συσκευές και πραγματικό background Push/ήχος/σωστό terminal. ASSIGNED codex/n16-owner-acceptance-20261007· άλλοι owners και παλαιά PASS διατηρούνται.

07/10/2026 22:02-22:08 Europe/Athens - Νο16 περιορισμένο OWNER login/chooser/read-only UI LAB PASS. Secure browserAuth και προσωπική αλλαγή προσωρινού κωδικού από ιδιοκτήτη· πραγματικός Υπεύθυνος Εργαστηρίου/cmtpopbgm000rrhb5xk15uytz, roleOWNER/companycmtpopbgk000prhb5qc60zxus/mustChangePasswordfalse και AuthAudit επιβεβαιώθηκαν ανεξάρτητα. Chooser μόνο τα2LAB stores, χωρίς support/SuperAdmin ένδειξη. Ίδια υπάρχουσα εργασίαchat-task-1791393082635-c4vy05z23ea OPEN/assigneeLABPOS2 και μήνυμαΝΕΟ,50unread, managerselect8activeEmployee επιλογές/settings/pin/completion ορατά. SQL19:07:24Z:50messages/3tasks/fixtureReads0/fixtureAudit18, flagsfalse και assignedAt18:16:52.741 αμετάβλητα από προηγούμενο PASS. Δεν εκτελέστηκε Owner μεταβολή ή logout, δεν επαναλήφθηκε εργασία/μήνυμα. Current health9230c0ab, main8132723a μετάdocs-only1851. OWNER mutation/keyboard/live αρνητικοί ρόλοι/tenant και logout/devices/Push OPEN. CHECKPOINTS/CHANGES/2026-10-07-n16-owner-acceptance.md/manualChat. ΑΝΑΛΗΨΗ ΑΠΟ codex/n16-chat-acceptance-20261007 - ASSIGNED codex/n16-owner-acceptance-20261007 μετά greenCI/merge· ονομασμένο handoff από ρητή εντολή αυτής της συνομιλίας. Προηγούμενα16PASS και17/23/27/λοιποίowners προστατεύονται.


07/10/2026 21:12-21:20 Athens - Νο16 LIMITED LAB PASS ανάθεσης υπευθύνου ως signed Super Admin cms1k1bje001xhn3xulr0rooz στο εικονικό ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ/cmtpopbgo000trhb5ng9ytiru. Ίδια εργασίαchat-task-1791393082635-c4vy05z23ea: null->LABPOS2->Εργαστήριο Χειριστής1->null->LABPOS2, Audit12->13->14->15->16. Κλείσιμο/επαναφορά διατήρησαν assignee/assignedBy/assignedAt, Audit16->17->18. ΤελικόOPEN/υπεύθυνοςLABPOS2 μετά πλήρες reload. Χειριστής βλέπει όνομα, επιλογή ανάθεσης0/κλείσιμο0, ίδιοΝΕΟ/2αδιάβαστα/fixtureReads0. Ανά ενέργεια φρέσκο πριν/μετά:50messages/3tasks,22οικονομικές ομάδες/2βάρδιες/controlstore0 και message flags αμετάβλητα· open1->0->1 μόνο στο κλείσιμο/επαναφορά. SKU/stock δεν μετρήθηκαν, legacy sumsNULL διατηρήθηκανNULL. Pre-batch exact88e6cb10528706b7913b4aa8a54253b118a57b6b/PR1846/CI4633-main4634 SUCCESS1888/0FAIL/0SKIP. Posthealth50ad768e832e7f706092a3fa21ecfa3ce78189ce: μόνο docsNo19, καμία Chat source αλλαγή. Exact revision δεν ανακτήθηκε χωριστά πριν από κάθε επόμενη ενέργεια. No16 overallOPEN: Owner/live αρνητικοί server-side ρόλοι/tenant, manager-unread selector/keyboard, logout/πολλαπλές συσκευές και πραγματικό Push/ήχος/terminal. Atomic/no-op/negative guards είναι9isolated route tests PASS, όχι live adversarial PASS. Ownercodex/n16-chat-acceptance-20261007 διατηρείται. Checkpoint2026-10-07-n16-chat-task-assignment.md/evidence2026-10-07-n16-chat-task-assignment.jpg. Παλαιά PASSPR1839/1841/1844,17/λοιποίowners/#27 προστατεύονται. Δεν εστάλη νέο μήνυμα ούτε δημιουργήθηκε νέα εργασία/οικονομική πράξη.

**Κατάσταση:** ΜΕΡΙΚΟ PASS / DEVICE OPEN

**Υπόλοιπο / όρια PASS:** Πραγματικός OWNER login/chooser, keyboard αλλαγή και επαναφορά υπευθύνου χωρίς read, και logout/reload/login LAB PASS07Oct22:25. Υπόλοιπο live αρνητικοί API ρόλοι/tenant, server token revocation, πολλαπλές/πραγματικές συσκευές και πραγματικό Push/ήχος/terminal. Παλαιά SA/operator PASS διατηρούνται. ASSIGNED codex/n16-owner-acceptance-20261007, overallOPEN.

**Υπεύθυνη σελίδα / branch:** ASSIGNED codex/n16-owner-acceptance-20261007 - named continuation from codex/n16-chat-acceptance-20261007 after this handoff merges.

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** 07Oct19:58-20:02, owner-directedNo16 takeover και έγκριση εικονικώνLAB μηνυμάτων/δοκιμών. Checkpoint2026-10-07-n16-chat-takeover.md. Η17 παραμένει στον δικό της owner.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Περιορισμένο assignmentLABPASS07Oct21:12-21:20, checkpoint2026-10-07-n16-chat-task-assignment.md. PR1846/CI4633+4634 SUCCESS1888tests0FAIL0SKIP, pre-batch88e6cb/post50ad768 docs-only. Δημοσίευση αποτελέσματος/CI/merge καταγράφεται στο associatedPR. Fixture παραμένει μίαOPENεργασία μεLABPOS2. Νεότερο PASS07Oct22:25: πραγματικός OWNER keyboard αλλαγή/επαναφορά και logout/reload/login, fixtureReads0/audit20. Υπόλοιπο live αρνητικοί API ρόλοι/tenant και φυσικέςLABσυσκευές/Push/ήχος· Νο16OPEN. Κανένα δεύτεροclaim/παλιόfixture repeat.

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

**Κατάσταση:** PASS / CLOSED — συμφωνημένο υπόλοιπο Νο19

**Υπόλοιπο / όρια PASS:** Native PDF, διορθωμένη ημερομηνία και φυσική εκτύπωση USER PASS. Ανεξάρτητη SQL συμφωνία LAB58/348 και pilot-company30/180 PASS. Άλλες λειτουργίες/roles/devices εκτός συμφωνημένου scope.

**Υπεύθυνη σελίδα / branch:** COMPLETED codex/n19-supplier-pdf-20261007 · κανένα υπόλοιπο ανάθεσης Νο19

**Ολοκλήρωση:** 07/10/2026 21:39 Europe/Athens — Printed No19 / tracker21 agreed residual CLOSED / PASS. Original LAB58 suppliers/348 money cells independently reconciled07Oct20:31 and native PDF content/layout checked20:53, protected. Date-caption regression fixed by PR1845, fullCI4630 SUCCESS, merge f2bbde13d10e3a33b2702fd1a5309e5c788f4a53 and exact live health observed21:06; publication record PR1847 merged50ad768e832e7f706092a3fa21ecfa3ce78189ce.
Owner uploaded corrected native PDF file_0000000070a882108c9cf21f0e596d1f / Library libfile_75f249055fa88191b06008357c5c6d26 at21:23. Actual period1/1/2026–7/10/2026,2A4landscape pages,30 supplier identities, repeated headers and global totals; both pages visually reviewed with no clipped table rows/cells. Date/PDF layout USER PASS. Physical paper USER PASS from Χρήστος Μάνης explicit confirmation21:34:41 ("ναι αυτο εννοω" in response to paper-print question); no paper photo/device model supplied, no agent-observed physical print claim.
Read-only SQL at21:37–21:39 identifies this PDF as company pilot-company by all30 names/AFMs, separate from MYWORKSTATION LAB companycmtpopbgk000prhb5qc60zxus. Independent grouped CTEs reconcile all180 supplier money cells and both repeated global totals at displayed cent precision: invoice378.4260→378.43,credit0,payment680.72,adjustment0,periodnet/all-historybalance−302.2940→−302.29. PDF's ΕΥΑΓΓΕΛΙΑ residual−0.0050→−0.01 and BLOOM residual−0.0040→display−0.00 reflect existing precision; no ledger change. Company-level report covers active suppliers, not just one selected store. Current static rows match uploaded historical date range; session/role/runtime of owner's ownPC PDF cannot be independently determined from file alone.
No business writes, no invoice/payment/stock/fiscal or shift action; new SQL transactions are read-only. Agreed native saved PDF/date/content and physical printing residual complete; No19 CLOSED. This does not certify other supplier tabs/roles, all stores/devices, XLSX corrected-date metadata runtime or future financial movements. Owner codex/n19-supplier-pdf-20261007 completed, no remaining assigned residual.

Checkpoint: CHECKPOINTS/CHANGES/2026-10-07-n19-supplier-pdf.md · manual docs/manual/suppliers/PASS.md. Αρχική υλοποίησηPR1578, αρχική πλοήγησηPR1580, claimPR1840, DBPASSPR1842. Προηγούμενα PASS προστατευμένα· δεν επαναλαμβάνονται οικονομικές πράξεις.

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

**Υπόλοιπο / όρια PASS:** Αρχικό επιλεγμένο LAB/κλειδωμένο κριτήριο USER PASS07Oct22:37. Αλλαγή γονικού store σε απομόνωση USER PASS07Oct22:52: Chat1→0/πηγές21→0. Επιστροφή LAB USER PASS07Oct23:03: Chat1/πηγές21. Ανανέωση USER PASS23:04 βάσει ρητής δήλωσης χρήστη και εικόνας200256 (χωρίς ανεξάρτητο API trace).  Θετική pending πληρωμή/link, ανεξάρτητος Owner/adversarial roles, unavailable sources/caps και χαμηλό μη αρνητικό stock.

**Υπεύθυνη σελίδα / branch:** ASSIGNED codex/n23-pending-acceptance-20261007 · named transfer approved07Oct

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** 07/10/2026 21:52 Europe/Athens — Owner explicitly approves named transfer of printed No23 / tracker25 to this page. ΑΝΑΛΗΨΗ ΑΠΟ codex/task25-pending-sources-20261001 — ASSIGNED codex/n23-pending-acceptance-20261007. Prior owner released for this residual only when this record reaches main; no parallel second assignment. Preserve #1595/CI4006–4007 limited invoice/negative-stock/filter/navigation PASS and historical Chat PASS. Residual: existing positive PENDING_REVIEW/DISCREPANCY supplier settlement and source navigation, low nonnegative stock, independent Owner and negative role/tenant checks, real source unavailability/cap acceptance. New scope NOT TESTED. Initial sequence: inspect live LAB and independent read-only baseline; one existing pending payment/link, then existing low stock. No new payment, invoice, stock, approval, shift or task mutation merely for evidence; #16/#17/#27 and completed No19 untouched. Test only MYWORKSTATION LAB companycmtpopbgk000prhb5qc60zxus/storecmtpopbgo000trhb5ng9ytiru and label-isolation control. Actual Owner login needs existing authorized session/secure owner credential flow; never use Super Admin as Owner PASS. If no natural cap/error exists, record NOT TESTED rather than cause production failure. No source change until evidence reconciled. Checkpoint CHECKPOINTS/CHANGES/2026-10-07-n23-pending-acceptance.md.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Περιορισμένο USER PASS07Oct22:37 για αρχική επιλογή ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ/κλειδωμένο φίλτρο· εικόνα193700 και ρητό ΕΙΝΑΙ ΟΚ. PR1854/CI4654/merge και exactlivec4b74fe40aaade6609c32bd8abf73320f63abf69. Manualpending-center/checkpoint2026-10-07-n23-pending-acceptance. Πρόσθετο περιορισμένο USER PASS07Oct22:52: εικόνες195012/195234, γονικό και κλειδωμένο store απομόνωσης, Chat0/πηγές0 χωρίς παλιές LAB γραμμές. Δημόσια health revisiond9646b10fc32d27b7ab48d78b42faa02d17bc204· PC revision δεν εκτίθεται. ΣυνολικόOPEN· Επιστροφή LAB USER PASS23:03 (εικόνα200256: κλειδωμένοLAB/Chat1/πηγές21), Ανανέωση USER PASS23:04 βάσει ρητής δήλωσης χρήστη/εικόνας200256, χωρίς ανεξάρτητο API trace· λοιπά residualNOT TESTED.

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

**Κατάσταση:** ASSIGNED / IN PROGRESS · LIVE ACCESS VERIFIED · UI FAILS OPEN · CI/DEPLOY/REGRESSION PENDING

**Υπόλοιπο / όρια PASS:** Παραμένει απαιτούμενος ο πλήρης έλεγχος κάθε ενότητας/tab/sub-tab/action/result screen σε normal και maximize, με πραγματικό scroll έως το τελευταίο λειτουργικό στοιχείο, dropdowns/checkboxes/search/filters/navigation, clipping, αναγνωσιμότητα και regression. Δεν δηλώνεται συνολικό PASS. Τρέχουσες επιβεβαιωμένες αποτυχίες: Workforce shared validation message, POS Designer right clipping, Payments/Expenses summary layout, Internet search header clipping, Subscriptions/Modules horizontal clipping, Online Radio checkbox alignment, fixed shortcuts πάνω στη φόρμα νέου καταστήματος, terminal-routing panel πάνω στη φόρμα τερματικού, Invoice Learning supplier-profile undefined counts. Οι scoped πηγαίες διορθώσεις είναι σε branch, όχι ακόμη green CI/merged/deployed/retested. Matrix/checkpoint περιέχει ακριβείς παρατηρήσεις και NOT TESTED scope.

**Υπεύθυνη σελίδα / branch:** Owner assignment διατηρείται: codex/central-management-live-audit-20261007. Scoped fix branch: codex/today04-platform-admin-live-fixes-20261007-1526, based on current main 0245f30d0746d92bba124e3dcea5124e4897f9dd. Claim PR #1814 merged; prior sign-in blocker PR #1818 docs-only. Implementation PR #1827 is open at head c6a2aa27f9895012a106e69129110ae573b551f1; full CI pending. Checkpoint: CHECKPOINTS/CHANGES/2026-10-07-central-management-bulk-price-scroll.md.

**Ανάληψη (χρόνος / ακριβές scope / checkpoint / PR):** 07/10/2026, 12:09 Athens, owner-authorized full Central Management live audit and fixes. Latest main checked 07/10 15:26 Athens: 0245f30d0746d92bba124e3dcea5124e4897f9dd (merge PR #1826, docs-only). Open PR overlaps and shared checkpoints were reviewed before scoped changes; changes avoid PlatformAdminApp.jsx, platform-admin.css, PosDesignerPanel.jsx, invoice-learning-lab-bootstrap.js and shared active-owner files where possible.

**Ολοκλήρωση (χρόνος / scope / τεκμήριο / PR / CI / revision):** Μερική, όχι ολοκλήρωση. 07/10/2026 15:26 Athens: authenticated LIVE page reloaded; /api/health now reports revision 0245f30d0746d92bba124e3dcea5124e4897f9dd, matching main. Payments and Expenses summary clipping was reproduced on this revision. Earlier LIVE sweep found the other listed UI issues; per-tab current-revision regressions remain pending. Scoped source branch contains targeted layout/validation/profile-summary changes. Local checks: node syntax checks, focused Invoice Learning summary behavior harness, CSS brace balance and git diff --check PASS. Full supported Node20 build/CI, merge, Render deploy and LIVE regression remain PENDING. No sale, charge, price apply, stock/fiscal change, supplier/payment review, payroll action, customer/store/terminal create or irreversible action occurred.


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



