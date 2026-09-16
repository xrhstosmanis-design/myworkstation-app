Warning: truncated output (original token count: 39447)
Total output lines: 1293

## 2026-09-16 — Invoice Learning unified Azure recovery

- [x] LAB FAIL reconciled: Coffee Union returned one line / `82.72 EUR` gross instead of seven lines / approximately `1,380.44 EUR`.
- [x] Root cause: any non-empty Azure result was accepted, while QR/mobile still depended on the removed duplicate-reader module.
- [x] One active reader now owns file, camera and QR intake and blocks a second request while one read is running.
- [x] A result with a printed total must reconcile its product-line gross total; proven partial Azure results fall through once and proven partial fallback results are rejected.
- [x] Safe Azure state is visible without exposing provider credentials.
- [x] No payment, credit, stock, approval, finalization or fiscal behavior changes.
- [ ] AWAITING CI, exact deploy verification and one direct plus one QR/mobile LAB read without save, learning or finalization.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-16-invoice-learning-unified-azure-recovery.md`.

## 2026-09-15 — Invoice Learning empty-result guard

## 2026-09-15 — POS FAST header sequential LAB regression

- [x] LAB PASS protected: `2612188` previously returned supplier/ΑΦΜ, `2612188`, `02/09/2026` and `2.369,99 €` when FAST pages were read one after the other.
- [x] LAB FAIL: the concurrent FAST candidate change made both selected pages fail together and left all four fields blank.
- [x] Bounded correction: read FAST header candidates sequentially while retaining independent per-page errors, order-independent merging and the existing 75-second request bound.
- [x] No payment, credit, stock, draft deletion/recovery, approval, finalization or fiscal behavior changes.
- [ ] AWAITING CI, exact deploy verification and one POS-front LAB read of both pages without pressing Paid/Credit.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-pos-fast-header-sequential-lab-regression.md`.

- An Azure/AI response with zero product lines is rejected instead of being presented as a completed empty invoice draft.
- The fallback prompt explicitly preserves each visible product row, including genuinely repeated supplier-code rows.
- No stock, accounting, payment, invoice approval, or finalization action is involved.

## 2026-09-15 — Invoice Learning draft-line correction

- Adds a user-operated draft-line correction dialog for invoice quantity, supplier unit price, package/stock conversion, and decimal discounts.
- The user may save only the supplier rule centrally; an invoice quantity correction remains scoped to its draft.
- Saving or previewing a correction never creates stock, accounting, payment, invoice, or approval movement.

## 2026-09-15 — Supplier packaging and stock-rule editor

- Invoice Learning adds a centrally saved supplier-rule editor for invoice unit, stock multiplier, stock unit, and exact decimal first discount.
- Saving rules changes no stock, accounting, payment, invoice, or approval state.
- Re-checking applies the saved conversion only to the reading preview; existing explicit final approval remains the sole stock-posting action.

## 2026-09-15 — Mixed genuine repeat inside OCR table replay

- Collapse full-table OCR duplication while retaining exactly one genuinely repeated row when that row alone closes the invoice total.
- Reference AA0011467: expected seven rows, with FR1500 retained twice and every other product once.
- No payment or stock mutation; draft remains blocked until totals reconcile.

## 2026-09-15 — Description-driven stock base units

- Coffee/chocolate package weights expressed as KG/KGR convert to grams in stock.
- Explicit TEM/TMX package counts convert cups and similar consumables to pieces.
- Financial invoice quantity/cost remains unchanged; only the stock multiplier is carried to approval.
- Package sizes such as 24x355ml do not trigger a false conversion.

## 2026-09-15 — STEFANIDIS food columns and carton stock conversion

- PR #854: central supplier rule for VAT 997763585 recovers quantity, original price, discount, net and VAT only when printed-row equations balance.
- Keeps invoice economics separate from stock: explicit 12TMX and x14t convert one carton to 12/14 pieces; size text such as 24x355ml is ignored.
- A carton without an explicit piece count remains UNRESOLVED, is shown in red and blocks FINAL.
- No payment mutation and no stock posting before the existing explicit approval flow.

## 2026-09-15 — POS OCR: table-recheck fallback

- [x] LAB 620889 exposed exact failure AI_RECHECK_INTERNAL [table-recheck].
- [x] Supplemental table-provider failure now falls through to Azure recovery instead of aborting.
- [x] Historical failure is retryable with the same draft and payment state.
- [x] 16/16 focused tests PASS; no payment, reversal, stock, approval or finalization change.
- [ ] Αναμονή CI/deploy και ανάκτηση του υπάρχοντος 620889.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-pos-table-recheck-fallback.md`.

## 2026-09-15 — POS: reused LOCAL_COMPLETE handoff

- [x] LAB 620889 was accepted but stayed at LOCAL_COMPLETE / AZURE without full background start.
- [x] Promote reused LOCAL_COMPLETE jobs to POS_QUEUED during the original POS handoff.
- [x] Recover a partial one-page handoff without upload or payment duplication.
- [x] 38/38 targeted tests PASS; no payment, reversal, stock, approval or finalization change.
- [ ] Αναμονή CI/deploy και ανάκτηση του υπάρχοντος 620889.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-pos-local-complete-handoff.md`.

## 2026-09-15 — POS OCR: confirmed total replay anchor

- [x] LAB rerun 43243 remained at 32 rows because generic AI ignored the POS-confirmed 76.58 € during replay detection.
- [x] Apply the confirmed handoff total to every supplier path before completeness and replay checks.
- [x] Preserve the immutable paid amount; no new payment, reversal, stock, approval or finalization behavior.
- [ ] Αναμονή CI/deploy και ανάκτηση του υπάρχοντος προχείρου χωρίς νέα αποστολή.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-pos-confirmed-total-replay-anchor.md`.

## 2026-09-15 — POS OCR: adjacent row replay guard

- [x] LAB invoice 43243 proved that every physical row was inserted twice (32 lines from a 16-row one-page invoice).
- [x] Collapse only a complete adjacent replay whose single copy is strongly corroborated by the printed invoice total.
- [x] Preserve legitimate repeated rows when the full table total is correct.
- [x] Credit mode remains unchanged; no payment, stock, approval, invoicing or finalization change.
- [ ] Αναμονή CI/deploy και ασφαλής επανάγνωση του ίδιου προχείρου χωρίς νέα αποστολή.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-pos-adjacent-ocr-replay.md`.

## 2026-09-15 — Gate 3: AI-recheck safe stage recovery

- [x] LAB after 6311ea0c: exact outer failure `POS_BACKGROUND_AI_RECHECK`; multi-page intake link was no longer the blocker.
- [x] AI recheck now reports a bounded safe sub-stage while full details stay in server logs.
- [x] The historical hidden AI-recheck failure is reclaimable without upload or payment duplication.
- [x] 51/51 targeted tests PASS; no payment, stock, approval or finalization change.
- [ ] Αναμονή CI/deploy. Μετά δοκιμή διαφορετικού μονοσέλιδου τιμολογίου αποκλειστικά από POS για καθαρή αξιολόγηση ανάγνωσης.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-gate3-ai-recheck-stage-recovery.md`.

## 2026-09-15 — Gate 3: secondary-page link during reread

- [x] LAB 12:03–12:11: exact failure `POS_BACKGROUND_PURCHASE_INTAKE`; secondary page was rejected before unified replacement.
- [x] Fix: locked reread accepts only an unclaimed secondary page or one already linked to the same draft; foreign document links remain blocked.
- [x] The exact old failure is reclaimable without a new upload or payment.
- [x] 50/50 targeted tests PASS; no payment, stock, approval or finalization change.
- [ ] Αναμονή CI/deploy και ανάκτηση του υπάρχοντος προχείρου με Ανανέωση.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-gate3-secondary-page-reread-link.md`.

## 2026-09-14 — Gate 3: safe background-operation diagnostics

- [x] LAB 11:48–11:52: 2612188 still failed with a generic internal error; provider-timeout recovery was not the failing branch.
- [x] Automatic handoff now identifies AI recheck, product-line save, or purchase intake without exposing internal data.
- [x] 49/49 targeted tests PASS locally; no payment, stock, approval or finalization change.
- [ ] Αναμονή CI/deploy και μία διαγνωστική επανάληψη για την ακριβή τελική διόρθωση.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-background-stage-diagnostics.md`.

## 2026-09-14 — Gate 3: parallel full-OCR timeout recovery

- [x] LAB 11:31–11:35: 2612188 failed with `POS_FAILED / POS_BACKGROUND_FAILED` and hidden internal error.
- [x] Root cause: sequential Azure page fallback accumulated full per-page timeouts and exposed a generic 500.
- [x] Fix: parallel page recovery; retryable `AZURE_TIMEOUT`/503 retains the failed page and activates the durable worker retry.
- [x] 47/47 targeted tests PASS; no payment, stock, approval or finalization change.
- [ ] Αναμονή CI, merge/deploy και νέα καθαρή POS δοκιμή.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-parallel-timeout-recovery.md`.

## 2026-09-14 — Gate 3: background lines into pre-created POS draft

- [x] LAB: 2612188 reached `POS_FAILED / POS_BACKGROUND_FAILED` at 20:17 after OCR, with generic internal error.
- [x] Root cause: product-line save rejected the worker because the safe empty `POS_OCR_DRAFT` already existed.
- [x] Fix: only `AI_COMPLETE` V2.4.4 background output with the same durable handoff may fill its still-DRAFT POS document; all other linked-document edits stay blocked.
- [x] 46/46 targeted tests PASS; no payment, stock, approval or finalization change.
- [ ] Αναμονή CI, merge/deploy και νέα καθαρή POS δοκιμή.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-fill-linked-pos-draft.md`.

## 2026-09-14 — Gate 3: POS_QUEUED recovery worker successor

- [x] LAB 10:57: 2612188 remained 0 lines at `POS_QUEUED / POS_RECOVERING`.
- [x] Root cause: recovery claimed the database row while an older in-memory worker held the job lock; no successor was attached.
- [x] Fix: one coalesced successor always starts after the old worker settles; repeated polls cannot create duplicate/infinite workers.
- [x] 45/45 targeted tests PASS; same draft/payment, no stock or finalization.
- [ ] Αναμονή CI, merge/deploy και automatic recovery of the existing draft.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-queued-worker-successor.md`.

## 2026-09-14 — Gate 3: παράλληλη πλήρης ανάγνωση ΣΤΕΦΑΝΙΔΗ

- [x] LAB 10:40–10:44:59: το νέο πρόχειρο 2612188 έμεινε 0 γραμμές και ξύπνησε μόνο ως `POS_RECOVERING` μετά από ανανέωση BackOffice.
- [x] Για ΑΦΜ `998878583`, η πλήρης POS ανάγνωση ξεκινά με τις δύο Azure σελίδες παράλληλα και εφαρμόζει τον κεντρικό κανόνα στηλών πριν από τη γενική αργή fallback ροή.
- [x] Ίδιο job/draft/πληρωμή, χωρίς stock ή οριστικοποίηση.
- [x] 41/41 στοχευμένα tests PASS.
- [ ] Αναμονή CI, merge/deploy και νέα χρονομετρημένη δοκιμή αποκλειστικά από POS.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-stefanidis-parallel-background.md`.

## 2026-09-14 — Gate 3: FAST στοιχεία ΣΤΕΦΑΝΙΔΗ ανεξάρτητα από σειρά σελίδων

- [x] LAB: τρεις προσπάθειες από POS έδειξαν `1.492,20 €` και `2 2612188` επειδή η δεύτερη σελίδα είχε επιλεγεί πριν από την πρώτη.
- [x] Διόρθωση κοινής FAST συγχώνευσης POS/BackOffice: για ΑΦΜ `998878583` επιλέγονται `2612188` και `2.369,99 €` ανεξάρτητα από σειρά σελίδων.
- [x] Καμία πληρωμή, handoff, stock, έγκριση ή οριστικοποίηση δεν εκτελείται κατά τη γρήγορη προεπισκόπηση.
- [x] 33/33 στοχευμένα tests PASS.
- [ ] Αναμονή CI, merge/deploy και νέα δοκιμή αποκλειστικά από POS.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-stefanidis-fast-header-page-order.md`.

## 2026-09-14 — Gate 3: τελική ανάκτηση στηλών ΣΤΕΦΑΝΙΔΗ

- [x] LAB 2612188: βρέθηκαν 38 περιγραφές, αλλά η όψιμη ανάκτηση γραμμών άφησε μετατοπισμένες στήλες: 356,1 αντί 608 τεμάχια και 2.363,28 € αντί 2.369,99 €.
- [x] Ο κεντρικός κανόνας `STEFANIDIS_PRINTED_COLUMNS` εφαρμόζεται ξανά μετά το table/Azure merge και πριν από σύνολα/εκπτώσεις, αποκλειστικά για ΑΦΜ `998878583` ή το αντίστοιχο κεντρικό profile.
- [x] Η γνώση είναι κοινή για όλες τις εταιρείες που έχουν τον προμηθευτή, αλλά αποθηκεύει μόνο θέσεις στηλών· όχι ποσότητες, τιμές, προϊόντα ή φωτογραφίες του 2612188.
- [x] Regression: 38 γραμμές / 608 τεμάχια / 2.369,99 € και 18/18 στοχευμένα tests PASS.
- [ ] Αναμονή CI, merge/deploy και νέα αυτόματη LAB ανάγνωση αποκλειστικά από POS. Καμία αποθήκευση/έγκριση του λανθασμένου draft.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-stefanidis-final-column-recovery.md`.

## 2026-09-14 — Gate 3: recovery transient POS_FAILED background OCR

- [x] LAB 2612188: FAST header, υπάρχουσα πληρωμή, draft και 2 φωτογραφίες διατηρούνται σωστά.
- [x] Εύρημα: μετά την εξάντληση transient transport retries το durable job μπορεί να μείνει `POS_FAILED` και το υπάρχον fast-recover δεν το ξανασηκώνει.
- [x] Διόρθωση απευθείας στο source (χωρίς runtime text patch): `POS_FAILED` ανακτάται μόνο όταν το αποθηκευμένο background error είναι transient transport failure.
- [x] Το `fast-status` χρησιμοποιεί τον ίδιο transient-only guard και κάνει guarded reclaim του ίδιου durable job.
- [x] OCR/payment/configuration failures δεν επανεκκινούν αυτόματα.
- [x] Ίδιο job, ίδιο draft, ίδιες φωτογραφίες και υπάρχουσα πληρωμή. Καμία νέα χρέωση, stock κίνηση ή οριστικοποίηση.
- [ ] Αναμονή CI PASS, merge και LAB επαλήθευσης.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-transient-pos-failed-recovery.md`.


Warning: truncated output (original token count: 48857)
Total output lines: 1413

## 2026-09-13 — Gate 3: ανάκτηση POS εργασίας και έντυπες στήλες

- [x] Νέο LAB εύρημα: η καταχώριση POS 2612188 μπορούσε να εμφανιστεί μόνο μετά από έξοδο/νέα είσοδο. Η κανονική «Ανανέωση» δεν αναλάμβανε ασφαλώς εργασία που είχε μείνει σε `POS_PROCESSING`.
- [x] Διόρθωση: κάθε ανανέωση Παραγγελιών & Αγορών καλεί μόνο tenant/store scoped ανάκτηση των durable `POS_QUEUED` ή παλαιών `POS_PROCESSING` jobs. Δεν δημιουργεί ή αλλάζει πληρωμή, πίστωση, βάρδια ή stock.
- [x] Νέο LAB εύρημα: το πρόχειρο 2612188 έχει 38 γραμμές αλλά ποσότητα=λιανική, λιανική `0,00 €` και διαφορά `6,71 €` (`2.363,28 €` αντί `2.369,99 €`). Δεν εγκρίνεται.
- [x] Διόρθωση: πριν από τη συμφωνία ποσού ο reader εφαρμόζει επαληθευμένη ανάκτηση των έντυπων στηλών λιανικής/μονάδας/ποσότητας από το τρέχον πρωτότυπο, χωρίς επαναχρησιμοποίηση παλαιών ποσοτήτων ή τιμών.
- [x] Δεύτερο LAB εύρημα/διόρθωση: όταν το OCR κρατά την πλήρη φυσική σειρά αλλά χάνει μόνο την επικεφαλίδα, ενεργοποιείται η ίδια ανάκτηση αποκλειστικά αν η λιανική είναι μηδέν και η λανθασμένη ποσότητα ταυτίζεται με την τυπωμένη λιανική, ενώ ποσότητα × τιμή μονάδας και αξίες της ίδιας σειράς συμφωνούν. Δεν είναι γενική παράκαμψη και δεν δημιουργεί οικονομική κίνηση.
- [x] Τελική διάγνωση μεταφοράς POS: η κανονική Ανάγνωση Τιμολογίων επέστρεφε τις σωστές γραμμές, αλλά ο τελικός μετασχηματισμός POS επέλεγε μη επαληθευμένο διπλότυπο της ίδιας γραμμής και δεχόταν ποσότητα × αγορά που δεν συμφωνούσε με την αξία. Πλέον προτιμά `sourceColumnsVerified`, απαιτεί συμφωνία γραμμής και διατηρεί ρητά τη λιανική. Δεν αλλάζει πληρωμή, stock, έγκριση ή η γρήγορη ροή.
- [x] POS handoff follow-up: verified source rows now win even when OCR duplicates share source coordinates; payment, stock, approval and quick POS flow unchanged.
- [ ] Αναμονή CI/Render και LAB επανάληψης: διαγραφή μόνο του λανθασμένου προχείρου 2612188 και νέα εισαγωγή των ίδιων δύο σελίδων με διατήρηση της πληρωμής. Αποδοχή μόνο σε 38 γραμμές / 608 τεμάχια / `2.369,99 €` και σωστή λιανική, αγορά, ποσότητα.

## 2026-09-13 — Gate 3: νέο LAB FAIL επανεισαγωγής πληρωμένου τιμολογίου

- [x] Το CI #2081 εντόπισε αποτυχία ανάκτησης παλιάς πληρωμής από την περιγραφή. Η SQL αφαιρεί πρώτα τη σημείωση μετά την παύλα και μετά διαβάζει τον πλήρη αριθμό· οι έλεγχοι δεν χαλαρώθηκαν.
- [x] Νέα τεκμήρια Χρήστου: το 2612188 απουσιάζει από Παραγγελίες / Θυρίδα, αλλά Μετρητά και Πίστωση μπλοκάρονται με ασυμφωνία πληρωμής. Η καρτέλα εξακολουθεί να δείχνει δύο παλιές πληρωμές 2.369,99 €. Το προηγούμενο CI/Render PASS δεν αποτελεί LIVE PASS αυτής της δοκιμής.
- [x] Διόρθωση: κοινή ταυτοποίηση προμηθευτή με ΑΦΜ από τη βάση της ίδιας εταιρείας, επιλογή υπάρχουσας πληρωμής που κατέχει το μοναδικό κλειδί τιμολογίου, συγκεκριμένη ένδειξη του πεδίου που διαφέρει. Δεν παρακάμπτονται κατάστημα, πλήρης αριθμός, ποσό ή εταιρεία.
- [x] Επιβεβαίωση πριν την επανεισαγωγή: «έχει ήδη πληρωθεί — δεν θα γίνει νέα πληρωμή ή πίστωση». Ακύρωση χωρίς εγγραφή. Η γρήγορη φόρμα κλείνει μετά την ασφαλή παραλαβή, ώστε να συνεχίζονται οι πωλήσεις.
- [x] Διαγραφή / φωτογραφίες: έλεγχος πραγματικής ύπαρξης συνδεδεμένου παραστατικού, νέα εργασία για ολοκληρωμένη παλιά ανάγνωση διαγραμμένου παραστατικού, κάλυψη αντίστροφης σύνδεσης παραγγελίας και διατήρηση πληρωμής.
- [x] Τοπικά builds και 1180 tests PASS. Προστέθηκαν δοκιμές επιβεβαίωσης/ακύρωσης και πραγματικό HTTP E2E για παλιές πληρωμές, ΑΦΜ, διαγραφή και νέα καταχώριση από δεύτερο χρήστη.
- [x] PR #802 / CI #2083 PASS (1181 tests και πραγματικό HTTP E2E), merge `d3346a79a794e73655297675b8b5062a3ba78510`, main CI #2086 PASS.
- [x] Render #1110 PASS: health στις 16:34:54 UTC με `ok:true`, revision `c5fb20c3834847a0dda9fc5844ce768e53c19f60`, που περιέχει αποδεδειγμένα το #802 μαζί με νεότερη ανεξάρτητη αλλαγή Super Admin. CI #2087 PASS. Το παλαιότερο deploy #1108 ακυρώθηκε λόγω νεότερης έκδοσης.
- [ ] Έτοιμο για νέα δοκιμή Χρήστου μετά από Ctrl+F5: προειδοποίηση ότι έχει ήδη πληρωθεί, επιβεβαίωση μόνο επανεισαγωγής, επιστροφή στο POS και καμία νέα οικονομική κίνηση σε επιλογή Μετρητών ή Πίστωσης. Δεν έγινε άμεσος έλεγχος της παραγωγικής βάσης· η συγκεκριμένη αιτία της τελευταίας ασυμφωνίας δεν τεκμηριώνεται μόνο από την εικόνα.
- [ ] Gate 3 παραμένει ΑΝΟΙΧΤΟ: 38 γραμμές / 608 τεμάχια / 2.369,99 € με σωστή λιανική, αγορά και ποσότητα. Οι παλιές δύο πληρωμές δεν μεταβάλλονται αυτόματα.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-13-gate3-paid-reread-confirmation.md`.

## 2026-09-13 — Gate 3: διαγραφή λανθασμένου προχείρου / νέα ανάγνωση με διατήρηση πληρωμής

- [x] Νέα οδηγία Χρήστου: διαγράφονται το λανθασμένο πρόχειρο και οι φωτογραφίες του, διατηρείται η υπάρχουσα πληρωμή και επιτρέπεται νέα εισαγωγή από POS / BackOffice χωρίς χρέωση. Αντικαθιστά την προηγούμενη οδηγία αναμονής χωρίς επανεισαγωγή.
- [x] Κώδικας: ενεργή πληρωμή παραμένει με ίδιο ποσό, αρχικό χειριστή, βάρδια, χρόνο και τρόπο πληρωμής. Η νέα εισαγωγή συνδέεται με την αρχική πληρωμή μόνο όταν συμφωνούν εταιρεία, κατάστημα, προμηθευτής, πλήρης αριθμός και ποσό. Δεν δημιουργείται νέο χρέος αν επιλεγεί πίστωση σε ήδη πληρωμένο τιμολόγιο.
- [x] Γρήγορη ροή POS: η φόρμα κλείνει μετά την ασφαλή παραλαβή και ο χειριστής συνεχίζει πωλήσεις. Σε επαναχρησιμοποίηση πληρωμής δεν ανοίγει συρτάρι και το μήνυμα δηλώνει ότι δεν έγινε νέα χρέωση.
- [x] Ανάγνωση: οι τυπωμένες στήλες λιανικής / μονάδας / ποσότητας / τιμής μονάδας ανακτώνται και χωρίς Azure table, μόνο με τεκμήριο των κεφαλίδων και αριθμητική συμφωνία της ίδιας σειράς. Ο επανέλεγχος εκπτώσεων περιορίζεται στη σωστή σελίδα. Δεν αντιγράφονται ποσότητες ή τιμές από παλιότερα τιμολόγια.
- [x] Τοπικά: server build, client build και 1175/1175 server tests PASS. Το fixture των 38 γραμμών του εντύπου επαληθεύει 608 τεμάχια και 2.369,99 €, με χωριστή αγορά και λιανική. Αυτό δεν είναι ακόμη LIVE PASS της νέας φωτογραφίας.
- [x] Επισκευή υφιστάμενου CI blocker: ο προηγούμενος κώδικας PREMIUM χρησιμοποιούσε δύο αδήλωτες σταθερές. Η ίδια επισκευή ενσωματώθηκε παράλληλα στο main με a4189180· διατηρήθηκε αυτούσιο το νεότερο main, μαζί με τις επόμενες αλλαγές του.
- [x] Αποκατάσταση κεντρικής λίστας: αφαιρέθηκε παλαιότερο τεχνητό μήνυμα truncated output και επανήλθε το χαμένο ενδιάμεσο ιστορικό από το πλήρες git revision df63b6bc, διατηρώντας όλες τις νεότερες σημειώσεις.
- [x] Το νεότερο main c0e7c33c έφερε συντακτικό λάθος στο Premium test (κυριολεκτικά backslash-n). Διορθώθηκαν μόνο οι αλλαγές γραμμής, χωρίς αλλαγή assertions ή λειτουργίας.
- [x] CI PASS: πραγματικό HTTP σενάριο: πληρωμένο πρόχειρο → διαγραφή φωτογραφιών / job → επανεισαγωγή από δεύτερο χρήστη → ακριβώς ίδια πληρωμή, χωρίς επιπλέον stock. PR #800 / CI #2073 PASS, merge `41941959211a78f1a7dbbcdc9ba9c2a3c18f88c6`, main CI #2074 PASS, Render #1101 PASS και health με το ακριβές revision στις 14:45 UTC.
- [ ] Δοκιμή Χρήστου: διαγραφή μόνο του λανθασμένου προχείρου 2612188, νέα εισαγωγή των δύο σελίδων, επιβεβαίωση 38 γραμμών / 608 τεμαχίων / 2.369,99 € και ποσότητας, αγοράς, λιανικής σε POS και BackOffice. Το συνολικό Gate 3 παραμένει ΑΝΟΙΧΤΟ.
- [ ] Οι δύο παλιές λανθασμένες πληρωμές δεν διαγράφονται ή αντιστρέφονται από αυτή τη διόρθωση. Η οικονομική αποκατάσταση παραμένει χωριστή ενέργεια με Audit.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-13-gate3-paid-invoice-reread.md`.

## 2026-09-13 — Gate 3: LAB FAIL δεύτερης πληρωμής / καθολικό κλείδωμα τιμολογίου

- [x] LAB FAIL: το τιμολόγιο `2612188` του ΣΤΕΦΑΝΙΔΗ χρεώθηκε δύο φορές από διαφορετικό χειριστή (`2.369,99 €` στις 14:34 και `2.369,99 €` στις 16:23), με λανθασμένο σύνολο ενεργής βάρδιας `4.739,98 €`.
- [x] Αιτία: η συνέχιση ανολοκλήρωτου AI job δεν συνέδεε την παλαιότερη πληρωμή όταν το checksum της εικόνας και το checksum της κίνησης διέφεραν· το τυχαίο browser idempotency key δεν προστάτευε την επιχειρησιακή ταυτότητα του τιμολογίου.
- [x] Διόρθωση κώδικα: εταιρεία + ΑΦΜ/προμηθευτής + κανονικοποιημένος αριθμός τιμολογίου δημιουργούν κοινό `invoicePaymentKey`, ανεξάρτητο από κατάστημα, POS και χειριστή.
- [x] Το κεντρικό endpoint πληρωμής και η server-side ολοκλήρωση εφαρμόζουν κοινό advisory lock και database unique index. Σε προηγούμενη ανολοκλήρωτη εργασία επαναχρησιμοποιείται η παλαιότερη ενεργή πληρωμή.
- [x] Η γρήγορη φόρμα συνεχίζει να κλείνει αμέσως μετά την ασφαλή παραλαβή. Δεν άλλαξαν οριστικοποίηση, απόθεμα, fiscal/RBS/EFTPOS ή άλλες ολοκληρωμένες ροές.
- [x] Τοπικό build πελάτη/server PASS και πλήρες server suite: 1170/1170 PASS.
- [x] PR #798: head CI #2059 PASS, merge στο `main` ως `3b0572960e4084d97937404edd7bc1204f0379ac`, main CI #2060 PASS και Render deploy #1091 PASS στο ακριβές revision.
- [ ] Η λανθασμένη δεύτερη πληρωμή παραμένει πραγματικό οικονομικό δεδομένο και δεν διαγράφεται αυτόματα. Απαιτείται ελεγχόμενη αντιστροφή με Audit πριν από νέο οικονομικό έλεγχο.
- [x] LIVE έλεγχος ίδιου αρχείου: ο Χρήστος επανέστειλε τις δύο σελίδες του `2612188` / `2.369,99 €`. Η οθόνη επέστρεψε «Η ίδια φωτογραφία/PDF τιμολογίου έχει ήδη καταχωριστεί. Δεν έγινε νέα πληρωμή ή πίστωση.» (τεκμήριο `3b8bd1e5-d4c8-4a6b-91da-75d7df15396d.png`).
- [x] LIVE αποτέλεσμα για τον τρέχοντα χειριστή: η εικόνα `6407f688-e391-4915-a83f-548a145da5a5.png` δείχνει «LAB POS 2 · ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ», καμία δική του πληρωμή/έξοδο και σύνολο `0,00 €` στην ενεργή βάρδια. Η σύγκριση με `4.739,98 €` άλλου χειριστή δεν είναι έγκυρη σε αυτή την προσωπική προβολή.
- [ ] Συνολική οικονομική αποκατάσταση: η προσωπική μηδενική λίστα δεν αποδεικνύει αντιστροφή των παλαιότερων δύο πληρωμών. Ο έλεγχός τους παραμένει στο BackOffice / Audit.
- [ ] Ο έλεγχος ίδιας εικόνας δεν πιστοποιεί ξεχωριστά την αποτροπή ίδιου αριθμού τιμολογίου με διαφορετικό αρχείο, σε άλλο χειριστή/POS/κατάστημα ή σε ταυτόχρονα αιτήματα. Το συνολικό Gate 3 παραμένει ανοιχτό.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-13-gate3-global-invoice-payment-idempotency.md`.

## 2026-09-13 — PREMIUM πλήρης συσχέτιση ανά κλεισμένη βάρδια / αναμονή CI και LAB

- [x] PREMIUM v3: εμφανίζει τελικό αποτέλεσμα για κάθε κλεισμένη βάρδια, ακόμη και όταν δεν υπάρχει απόκλιση, αντί για ετικέτα «Χρειάζεται έλεγχο».
- [x] Για κάθε αποτέλεσμα εξετάζει κλείσιμο → επόμενο άνοιγμα στο ίδιο POS και εμφανίζει μόνο τεκμηριωμένη απόκλιση παράδοσης· δεν κάνει αυτόματο συμψηφισμό.
- [x] Ο Super Admin εγκρίνει το τελικό αποτέλεσμα ανά βάρδια, με καταγραφή Audit, χωρίς οικονομική μεταβολή ή αυτόματη απόδοση ευθύνης.
- [x] Τοπικά PREMIUM v3: 6/6 στοχευμένα tests, production build και `git diff --check` PASS.
- [ ] Αναμονή CI / Render για PREMIUM v3 και δοκιμή μόνο `MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ`.

- [x] PREMIUM v2: κάθε συσχέτιση πώλησης, πληρωμής, ακύρωσης και audit περιορίζεται στο ίδιο `CashShiftSession.sessionId`· δεν συγκρίνει συναλλαγές διαφορετικών βαρδιών.
- [x] Ελέγχει ίδιο καλάθι προϊόντων/ποσοτήτων/γραμμών και ίδιο ποσό στον ίδιο χειριστή, έως 10 λεπτά, για διπλή POS πώληση ή πιθανή αλλαγή μετρητά ↔ κάρτα χωρίς αντίστροφη εγγραφή.
- [x] Ελέγχει επαναλαμβανόμενα audit ακύρωσης/επιστροφής της ίδιας αρχικής πώλησης στην ίδια βάρδια, συμβάντα ασφάλειας διπλής συναλλαγής και, όπου υπάρχει το αντίστοιχο table, λειτουργικά DELETE/REMOVE/VOID/CANCEL συμβάντα.
- [x] COMPLETE: πληρωμές χωρίς παραστατικό και πιθανές διπλές πληρωμές περιορίζονται πλέον επίσης στην ίδια κλεισμένη βάρδια.
- [x] Όλες οι ενδείξεις είναι read-only και δηλώνουν πιθανή εξήγηση· δεν συμψηφίζουν, δεν μεταβάλλουν ποσά/stock και δεν αποδίδουν ευθύνη.
- [x] Τοπικά: 6/6 στοχευμένα tests, client production build και `git diff --check` PASS.
- [x] CI #2049 και Render #1083 PASS για revision `6d8b1f588befb340a7e542ec42f3e4e49fcb24b9`.
- [ ] Δοκιμή μόνο `MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ`: έλεγχος PREMIUM σε μία κλεισμένη βάρδια με καθαρό και με εσκεμμένα συσχετισμένο σενάριο.

## 2026-09-13 — PREMIUM επαναλαμβανόμενες αποκλίσεις / ολοκληρώθηκε από PREMIUM v2

- [x] Νέος PREMIUM, read-only έλεγχος: εντοπίζει μόνο χειριστές με 2+ κλεισμένες βάρδιες που έχουν απόκλιση στα επιλεγμένα φίλτρα.
- [x] Εμφανίζει πλήθος βαρδιών και αθροιστικές αποκλίσεις μετρητών / POS–EFTPOS ως ένδειξη ελέγχου, χωρίς απόδοση ευθύνης, οικονομική εγγραφή ή αλλαγή δεδομένων.
- [x] Τοπικά: 3/3 στοχευμένα tests, client build και `git diff --check` PASS.
- [ ] Αναμονή CI / Render και έπειτα δοκιμή αποκλειστικά στο LAB από τον Χρήστο.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-13-super-admin-premium-variance-controls.md`.

## 2026-09-13 — Super Admin COMPLETE / LAB δοκιμή PASS

- [x] Ο COMPLETE έλεγχος ενεργοποιήθηκε αποκλειστικά στο `MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ` από Super Admin και καταγράφηκε στο Audit.
- [x] Πραγματική LAB εκτέλεση για 01/08/2026–13/09/2026: 5 βάρδιες, καθαρή διαφορά μετρητών −3,00 €, διαφορά POS–EFTPOS 0,00 €, 0 εκκρεμή συμβάντα.
- [x] COMPLETE / μόνο για ανάγνωση: 0 πληρωμές χωρίς παραστατικό και 0 πιθανές διπλές πληρωμές. Δεν άλλαξε οικονομικό δεδομένο ή συναλλαγή.
- [x] CI #2036 και τοπικό client build: PASS. Η παραγωγική σελίδα `/platform-admin` απαντά 200.
- [x] Η δοκιμή έγινε από τον Χρήστο στο LAB. Δεν έγινε νέα ενέργεια στο ΚΑΤ.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-13-super-admin-complete-lab-pass.md`.

## 2026-09-13 — Gate 3: πλήρης τοπικός έλεγχος Node 20 PASS
- [x] Ακριβές απομονωμένο αντίγραφο του branch και npm install με Node.js 20.19.0.
- [x] 1.160/1.160 server tests, server build, client build και 6/6 ομάδες production invariants PASS.
- [x] Ενημερώθηκαν δύο παλιές δοκιμές συμβολαίου για τη νέα πληροφορία centralLearning στην απόκριση και στο audit· οι έλεγχοι απομόνωσης/stock παραμένουν.
- [ ] Δημιουργία PR μέσω GitHub: ακόμη ReadTimeout. Δεν υπάρχει απομακρυσμένο CI, HTTP E2E PASS, merge ή deploy. Το Gate 3 παραμένει ανοιχτό για LAB ακρίβεια.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-13-central-supplier-column-learning.md`.

## 2026-09-13 — Checkpoint συνέχειας / υποβολή PR προσωρινά μπλοκαρισμένη
- [x] Κώδικας και checkpoint αποθηκευμένα στο `codex/gate3-central-supplier-column-learning`. 31/31 στοχευμένες δοκιμές PASS.
- [ ] Η σύνδεση GitHub επιστρέφει `ReadTimeout` / `Internal error` κατά τη δημιουργία PR. Δεν υπάρχει νέο PR/CI/merge/deploy για αυτή τη διόρθωση. Η γενική εντολή παραμένει ήδη καταγεγραμμένη στο main μέσω #791.
- [ ] Συνεχίζουμε από υποβολή PR → πλήρες CI → merge → ακριβές Render revision → LAB επανέλεγχο. Το Gate 3 δεν κλείνει.

## 2026-09-13 — Υλοποίηση γενικού κανόνα εκμάθησης / αναμονή CI και LAB
- [x] Κοινή διόρθωση ανάγνωσης στηλών (ποσότητα / αγορά / λιανική), σειράς και πολυσέλιδων γραμμών, χωρίς ειδική εξαίρεση προμηθευτή.
- [x] Επιβεβαιωμένες διορθώσεις Super Admin ενημερώνουν κεντρικό versioned προφίλ προμηθευτή. Αξιοποίηση σε όλα τα καταστήματα/εταιρείες, στο POS, BackOffice και Invoice Learning, με διατήρηση απομόνωσης δεδομένων.
- [x] 31/31 στοχευμένες δοκιμές και syntax checks PASS. Fixture 38 γραμμών: 608 τεμάχια και 2.369,99 €. Δεν είναι ζωντανό OCR PASS.
- [ ] Πλήρες Node 20 CI / merge / ακριβές Render revision.
- [ ] LAB PASS ακρίβειας 2612188 και εκμάθησης μετά από επιβεβαιωμένη διόρθωση: εκκρεμεί. Το υπάρχον πρόχειρο δεν αλλάζει αυτόματα, το Gate 3 παραμένει ανοιχτό.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-13-central-supplier-column-learning.md`.

## 2026-09-13 — Γενικός κανόνας εκμάθησης / νέο LAB FAIL γραμμών

- [x] Ρητή εντολή Χρήστου: κάθε επιβεβαιωμένη διόρθωση πρέπει να ενημερώνει την εκμάθηση ανά προμηθευτή και να αξιοποιείται σε όλα τα καταστήματα/σε όλες τις ροές του προγράμματο…19447 tokens truncated…st.
- [x] Η αλλαγή δεν επηρεάζει οικονομικά δεδομένα ή τον κανόνα των 40 δευτερολέπτων.
- [ ] Εκκρεμεί επανεκτέλεση CI/deploy.


## 13/09/2026 — Συμπλήρωση σταθερών PREMIUM συσχέτισης

- [x] Προστέθηκαν στον server οι σταθερές του αυστηρού κανόνα: 40 δευτερόλεπτα και απόσταση έως δύο συναλλαγών.
- [x] Ο αλγόριθμος δεν μπορεί πλέον να εκτελείται με αόριστο χρονικό όριο.
- [ ] Εκκρεμεί επανεκτέλεση CI/deploy.


## 13/09/2026 — Επισκευή εκτέλεσης PREMIUM στο ΚΑΤ

- [x] Διορθώθηκε η SQL ταξινόμηση του DISTINCT ON που προκαλούσε εσωτερικό σφάλμα κατά την εκτέλεση PREMIUM.
- [x] Η ουσιαστική χρονολογική σειρά για τον κανόνα 40″/επόμενη–μεθεπόμενη διατηρείται στον αλγόριθμο μετά την ανάγνωση των συναλλαγών.
- [ ] Εκκρεμεί CI/deploy και επανάληψη ελέγχου χρήστη.


## 13/09/2026 — PREMIUM αποδεικτικά ακυρώσεων και λειτουργικών κινήσεων

- [x] Ακυρώσεις/επιστροφές και συμβάντα ασφαλείας εμφανίζουν συγκεκριμένη απόδειξη, ώρα, είδη, ποσό, πληρωμή και αναγνωριστικό συναλλαγής.
- [x] Διαγραφές/ακυρώσεις POS εμφανίζουν ώρα, χειριστή, ποσό, είδη και αναγνωριστικό λειτουργικού συμβάντος.
- [x] Αν η πρωτογενής πώληση δεν υπάρχει πλέον διαθέσιμη, δηλώνεται ρητά το αναγνωριστικό της αντί να εμφανίζεται αόριστο εύρημα.
- [ ] Εκκρεμεί CI/deploy και οπτική δοκιμή χρήστη.


## 13/09/2026 — Επισκευή CI αποδεικτικών PREMIUM

- [x] Διορθώθηκε η μορφοποίηση του στοχευμένου test για τα νέα αποδεικτικά ακυρώσεων και λειτουργικών κινήσεων.
- [ ] Εκκρεμεί επανεκτέλεση CI/deploy.


## 13/09/2026 — PREMIUM δοκιμή αποδεικτικών στο ΚΑΤ

- [x] Ο χρήστης επιβεβαίωσε επιτυχή εκτέλεση PREMIUM μετά τις διορθώσεις SQL και χρονικής συσχέτισης.
- [x] Επιβεβαιώθηκε η εμφάνιση αναλυτικών αποδεικτικών συναλλαγής και λειτουργικών συμβάντων.
- [ ] Συνεχίζεται έλεγχος ποιότητας των κανόνων PREMIUM για επόμενο κύκλο βελτιώσεων.


## 13/09/2026 — COMPLETE αποδεικτικά στοιχείων κινήσεων

- [x] Κάθε εύρημα COMPLETE εμφανίζει πλέον τις ακριβείς κινήσεις που το δημιούργησαν: ώρα, ποσό, τύπο, χειριστή, περιγραφή και μοναδικό αναγνωριστικό.
- [x] Η πιθανή διπλή πληρωμή εμφανίζει όλες τις συγκεκριμένες κινήσεις της ίδιας κλεισμένης βάρδιας μαζί, με κατάσταση παραστατικού ανά κίνηση.
- [x] Η πληρωμή χωρίς παραστατικό δηλώνει ρητά ότι δεν βρέθηκε συνημμένο, χωρίς ανάγνωση ή μεταβολή του αρχείου/των οικονομικών δεδομένων.
- [x] CI, Render deploy και οπτική δοκιμή χρήστη ολοκληρώθηκαν επιτυχώς.


## 13/09/2026 — BASIC αποδεικτικά κινήσεων βάρδιας

- [x] Για κάθε BASIC διαφορά εμφανίζονται έως οι 50 νεότερες κινήσεις της ίδιας κλεισμένης βάρδιας.
- [x] Κάθε κίνηση εμφανίζει ώρα, ποσό, τύπο, χειριστή, περιγραφή, αναγνωριστικό και ένδειξη αντιστροφής.
- [x] Η ανάγνωση παραμένει tenant/store/session scoped και δεν αλλάζει οικονομικά δεδομένα.
- [x] CI, Render deploy και οπτική δοκιμή χρήστη ολοκληρώθηκαν επιτυχώς.


## 13/09/2026 — Επισκευή έγκρισης ελέγχου BASIC/PREMIUM

- [x] Η οθόνη επιβεβαίωσης καλεί πλέον το πραγματικό, tenant-scoped endpoint reviews.
- [x] Η αποθήκευση στέλνει ρητά απόφαση «Ελεγμένο χωρίς αλλαγή» και η σημείωση είναι προαιρετική.
- [x] Η εγγραφή παραμένει μόνο Audit για κλεισμένη βάρδια, χωρίς μεταβολή οικονομικών δεδομένων.
- [x] CI, Render deploy και δοκιμή χρήστη ολοκληρώθηκαν επιτυχώς.


## 13/09/2026 — Αποδεικτικά Τραπεζικού Ταμείου στην κεντρική ανάλυση

- [x] Η κεντρική ανάλυση φορτώνει τις εκκρεμείς εγγραφές Τραπεζικού Ταμείου με τα ίδια φίλτρα εταιρείας/καταστήματος.
- [x] Κάθε εγγραφή δείχνει ώρα, ποσό, τύπο, κατάσταση, αποδεικτικό, λογαριασμό, χειριστή και αναγνωριστικό/σχετική κίνηση.
- [x] Η ανάγνωση είναι μόνο για Super Admin/ιδιοκτήτη και δεν επιβεβαιώνει ή μεταβάλλει τραπεζικές εγγραφές.
- [ ] Εκκρεμεί CI, Render deploy και οπτική δοκιμή χρήστη σε LAB.

# 22. Αναζήτηση προϊόντων στο Internet (2026-09-13)

- [x] Δημιουργήθηκε το owner εργαλείο πίσω από το πληρωμένο module `ADVANCED_ONLINE_PRODUCT_SEARCH`.
- [x] Προστέθηκαν αναζήτηση αγοράς, σύνδεση με κατάλογο, σύγκριση τιμών/margin και tenant-scoped ιστορικό.
- [x] Καμία online ένδειξη δεν αλλάζει αυτόματα τιμές ή απόθεμα.
- [ ] Εκκρεμούν Super Admin κεντρική προβολή, ροή πρότασης/έγκρισης αλλαγής τιμής και LAB PASS με ενεργό provider.


## 13/09/2026 — Αποδεικτικά πληρωμών προμηθευτών και λοιπών εξόδων

- [x] Η κεντρική ανάλυση φορτώνει τις εκκρεμείς πληρωμές προμηθευτών με ακριβές ποσό, τρόπο πληρωμής, αποδεικτικό και συνδεδεμένα τιμολόγια.
- [x] Η κεντρική ανάλυση φορτώνει τα λοιπά έξοδα με ώρα, ποσό, τρόπο, αιτιολογία, αποδεικτικό και αυτόματους ελέγχους.
- [x] Τα φίλτρα εταιρείας, καταστήματος και περιόδου εφαρμόζονται σε αυτές τις εγγραφές. Δεν γίνεται έγκριση ή μεταβολή από την ανάλυση.
- [ ] Εκκρεμεί CI, Render deploy και οπτική δοκιμή χρήστη σε LAB.


## 13/09/2026 — COMPLETE αποδεικτικά στοιχείων κινήσεων

- [x] Κάθε εύρημα COMPLETE εμφανίζει πλέον τις ακριβείς κινήσεις που το δημιούργησαν: ώρα, ποσό, τύπο, χειριστή, περιγραφή και μοναδικό αναγνωριστικό.
- [x] Η πιθανή διπλή πληρωμή εμφανίζει όλες τις συγκεκριμένες κινήσεις της ίδιας κλεισμένης βάρδιας μαζί, με κατάσταση παραστατικού ανά κίνηση.
- [x] Η πληρωμή χωρίς παραστατικό δηλώνει ρητά ότι δεν βρέθηκε συνημμένο, χωρίς ανάγνωση ή μεταβολή του αρχείου/των οικονομικών δεδομένων.
- [ ] Εκκρεμεί CI, Render deploy και οπτική δοκιμή χρήστη σε LAB.


## 13/09/2026 — Ενιαίο ιστορικό Audit στο Κέντρο Ελέγχων

- [x] Η εκτέλεση της ανάλυσης φορτώνει πλέον το ίδιο φιλτραρισμένο ιστορικό Audit για εταιρεία, κατάστημα και περίοδο.
- [x] Κάθε γραμμή δείχνει ώρα, ενέργεια, ακριβή περιγραφή, ποσό, χειριστή, POS, κατάστημα, πηγή και μοναδικό αναγνωριστικό.
- [x] Εμφανίζονται έως 100 πιο πρόσφατες πραγματικές κινήσεις, χωρίς μεταβολή οικονομικών δεδομένων ή αυτόματη έγκριση.
- [ ] Εκκρεμεί CI, Render deploy και οπτική δοκιμή χρήστη σε LAB.



- [x] Super Admin Έλεγχοι: αυτόματος συμψηφισμός διαδοχικών βαρδιών στο ίδιο POS, με τεκμηρίωση στο τελικό αποτέλεσμα (PR #813).


## 14/09/2026 — Gate 3: ορατή επιβεβαίωση αποστολής τιμολογίου από POS

- [x] Το POS εμφανίζει ξεκάθαρα «Ανέβηκε στο BackOffice για έλεγχο» μετά την επιτυχή παρασκηνιακή καταχώριση.
- [x] Σε αποτυχία εμφανίζει «Δεν ανέβηκε στο BackOffice — χρειάζεται επανάληψη/έλεγχος».
- [x] Η γρήγορη ροή POS και η προστασία διπλής πληρωμής παραμένουν αμετάβλητες.


## 14/09/2026 — Gate 3: durable ένδειξη στην πράσινη κεφαλίδα POS

- [x] Η Premium φόρμα εκπέμπει το durable job id μετά την ασφαλή παραλαβή και κλείνει άμεσα, χωρίς να εμποδίζει νέα πώληση.
- [x] Η κεφαλίδα POS παρακολουθεί μόνο την server-side κατάσταση και δείχνει «επεξεργασία», «ανέβηκε στο BackOffice» ή «αποτυχία» για το ίδιο τιμολόγιο.
- [x] Retry επαναχρησιμοποιεί την υπάρχουσα πληρωμή· δεν δημιουργεί δεύτερη χρέωση, stock κίνηση ή οριστικοποίηση.
- [x] PR #816 merged στο main μετά από πράσινο CI #2131.
- [x] Η LAB δοκιμή του `2612188` επιβεβαίωσε ότι το POS ελευθερώνεται, ενώ το background job δηλώνει αποτυχία χωρίς νέα χρέωση ή stock κίνηση.
- [ ] Η αιτία του server-side failure εμφανίζεται με ασφάλεια στην κεφαλίδα POS πριν από οποιοδήποτε νέο submit/retry.
- [ ] Η ίδια αιτία εμφανίζεται read-only στην Κεντρική Διαχείριση → Ανάγνωση τιμολογίων, ώστε να διαγνωστεί το ήδη υπάρχον job χωρίς νέα υποβολή.
## 2026-09-14 — Gate 3: πρόχειρο πριν από OCR και άμεση Θυρίδα

- [x] LAB αιτία: η ήδη διατηρημένη πληρωμή του `2612188` δεν δημιουργούσε πρόχειρο στις Παραγγελίες & Αγορές όταν το πλήρες OCR απέτυχε.
- [x] Διόρθωση: το POS handoff δημιουργεί/επαναχρησιμοποιεί πρώτα `DRAFT` παραστατικό και `NEW` παραγγελία, ενώ κάθε φωτογραφία μπαίνει άμεσα στη Θυρίδα ως `IN_REVIEW`.
- [x] Retry: ίδια σελίδα με ανολοκλήρωτο πρόχειρο ξαναχρησιμοποιεί το ίδιο job, πρόχειρο και πληρωμή· δεν επιτρέπεται δεύτερη πληρωμή, απόθεμα ή οριστικοποίηση.
- [x] LAB επιβεβαίωση `2612188`: η νέα παραγγελία εμφανίζεται στη λίστα με 2 σελίδες και σωστό προμηθευτή χωρίς δεύτερη πληρωμή. Το OCR failure `fetch failed` αφορά μόνο τον worker και δεν μεταβάλλει την εγγραφή.
- [ ] Εκκρεμούν πράσινο CI, merge/deploy και πρακτική δοκιμή LAB.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-paid-draft-before-ai.md`.
## 2026-09-14 — Gate 3: αυτόματη ολοκλήρωση OCR μετά το POS handoff

- [x] Ρητή απαίτηση Χρήστου: δεν επιτρέπεται «Επανεπεξεργασία γραμμών» ως κανονικό βήμα. Η αξία της ροής είναι ότι το POS κλείνει και ο χειριστής συνεχίζει πωλήσεις ενώ η πλήρης ανάγνωση ολοκληρώνεται μόνη της.
- [x] Διόρθωση: ο durable POS background worker επιχειρεί αυτόματα το ίδιο job στις `0s`, `3s`, `12s` και `30s` πριν δηλώσει οριστική αποτυχία. Χρησιμοποιεί loopback και ασφαλές fallback στο Render origin.
- [x] Ασφάλεια: κάθε προσπάθεια χρησιμοποιεί το ίδιο job, `PurchaseDocument`, `PurchaseOrder`, συνημμένες φωτογραφίες και ήδη επιβεβαιωμένη πληρωμή. Δεν δημιουργεί δεύτερη χρέωση/πίστωση, κίνηση αποθήκης ή οριστικοποίηση.
- [x] Τοπικά: 1.197/1.197 server tests PASS.
- [ ] Αναμονή CI/Render και τελική LAB δοκιμή: ανέβασμα από POS → άμεση επιστροφή στις πωλήσεις → αυτόματη συμπλήρωση των γραμμών στο ίδιο πρόχειρο χωρίς κουμπί επανεπεξεργασίας.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-paid-draft-before-ai.md`.
## 2026-09-14 — Gate 3: αποκατάσταση γρήγορης ανάγνωσης 4 στοιχείων

- [x] Νέο LAB FAIL: μετά από επιλογή των δύο φωτογραφιών του `2612188`, η φόρμα παρέμενε κενή και έδειχνε γενικό «εσωτερικό σφάλμα» πριν από πληρωμή ή δημιουργία προχείρου.
- [x] Επιβεβαιωμένος κανόνας checkpoint: η γρήγορη ανάγνωση των δύο σελίδων επιστρέφει ΑΦΜ/προμηθευτή `998878583 / ΣΤΕΦΑΝΙΔΗΣ Ι ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ`, αριθμό `2612188`, ημερομηνία `02/09/2026` και τελικό ποσό `2.369,99 €`.
- [x] Διόρθωση: αν το Azure FAST αποτύχει, ο server χρησιμοποιεί αυτόματα τον ήδη διαθέσιμο FAST reader. Η φόρμα δεν μένει κενή και δεν γίνεται πληρωμή, πρόχειρο, stock ή οριστικοποίηση πριν εμφανιστούν τα 4 στοιχεία.
- [x] Τοπικά: 1.198/1.198 server tests και production client build PASS.
- [ ] Αναμονή CI/Render και LAB δοκιμή μόνο γρήγορης ανάγνωσης των ίδιων δύο φωτογραφιών.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-11-fast-header-supplier-handoff.md`.
## 2026-09-14 — Gate 3: κεντρική εκμάθηση ΣΤΕΦΑΝΙΔΗ από επιβεβαιωμένο checkpoint

- [x] Πηγή αλήθειας: `2026-09-13-central-supplier-column-learning.md` και fixture δύο σελίδων του `2612188`: 38 γραμμές, 608 τεμάχια, `2.369,99 €`, με τυπωμένη σειρά λιανική → μονάδα → ποσότητα → τιμή αγοράς → αξία.
- [x] Κεντρική εκμάθηση: ΑΦΜ `998878583` / ΣΤΕΦΑΝΙΔΗΣ Ι ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ λαμβάνει versioned profile `STEFANIDIS_PRINTED_COLUMNS` με επαληθευμένες σχετικές θέσεις στηλών. Εφαρμόζεται σε όλες τις εταιρείες και ροές ανάγνωσης.
- [x] Ασφάλεια: ο κανόνας δεν αποθηκεύει παλιές ποσότητες, τιμές, σύνολα, company product IDs ή φωτογραφίες. Κάθε νέα γραμμή εφαρμόζεται μόνο αν το νέο τυπωμένο ποσότητα × αγορά συμφωνεί με τη δική της αξία.
- [x] Τοπικά: 1.199/1.199 server tests και Prisma/server build PASS.
- [ ] Αναμονή CI/Render και τελική LAB προεπισκόπηση των δύο φωτογραφιών, χωρίς νέα πληρωμή, stock ή οριστικοποίηση.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-13-central-supplier-column-learning.md`.

- 2026-09-14: Pending POS invoice source photos can be deleted from Invoice Inbox; processed evidence and payments are protected.

## 2026-09-14 — FAST header provider timeout before POS 30″ deadline

- [x] LAB: three consecutive two-page attempts exceeded the POS 30-second request timeout before any transaction.
- [x] Azure FAST header is bounded to 9 seconds so the configured fallback can run before the client aborts.
- [x] OpenAI FAST fallback is bounded to 17 seconds; background V2.4.4 timing is unchanged.
- [x] No payment, credit, draft, stock, approval or finalization behavior changed.
- [ ] Αναμονή CI, merge και LAB επανάληψης μόνο της αρχικής γρήγορης ανάγνωσης.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-fast-header-provider-timeout.md`.
## 2026-09-14 — Restore proven FAST header LAB behavior

- [x] PR #828 did not restore the previously working header read; LAB returned an internal error.
- [x] FAST header gets a dedicated 60-second client budget while all other POS requests remain at 30 seconds.
- [x] Azure keeps a 40-second allowance and fallback 15 seconds; price/discount/background logic is unchanged.
- [x] No payment, credit, draft, stock, approval or finalization behavior changed.
- [ ] Αναμονή CI, merge και LAB επανάληψης μόνο της αρχικής γρήγορης ανάγνωσης.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-restore-fast-header-lab-window.md`.
## 2026-09-14 — Gate 3: hung POS_PROCESSING background OCR

- [x] LAB 2612188 remained at 0 lines / 0,00 € for more than six minutes with both photos and payment preserved.
- [x] Full multipage OCR provider requests are bounded to 75 seconds so the durable job cannot remain processing forever.
- [x] Provider timeouts are transient and use the guarded recovery added by PR #827.
- [x] FAST header, payment, draft, stock, price and discount calculation are unchanged.
- [ ] Αναμονή CI, merge and LAB recovery of the existing draft.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-bounded-background-ocr.md`.
## 2026-09-14 — Gate 3: final unbounded discount-verifier transport

- [x] LAB: PR #830 reclaimed 2612188 at 08:04, but the draft remained at 0 lines / 0,00 € after the full window.
- [x] Only the POS background discount-verifier transport now receives the existing 75-second provider deadline.
- [x] Price/discount arithmetic and every other verifier caller remain unchanged.
- [x] Same job, draft, photos and payment; no stock, approval or finalization.
- [ ] Αναμονή CI, merge and LAB recovery of the existing draft.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-bounded-discount-verifier.md`.
## 2026-09-14 — Gate 3: preserve timeout identity for recovery

- [x] LAB health confirmed revision cb1850b from PR #831.
- [x] Refresh at 08:20 did not update the 2612188 draft; it remained at 0 lines / 0,00 € and updatedAt 08:04.
- [x] Actual provider timeouts now survive the Azure fallback instead of becoming a generic non-retryable error.
- [x] The exact generic error already stored by this LAB path is eligible for guarded recovery; unrelated failures remain excluded.
- [x] Same job, draft, photos and payment; no FAST header, calculation, stock, approval or finalization change.
- [ ] Αναμονή CI, merge and LAB recovery of the existing draft.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-preserve-provider-timeout.md`.

## 2026-09-14 — Gate 3: POS job observability

- [x] Confirmed live revision 277222c1; LAB refresh at 08:32 left invoice 2612188 at 0 lines / 0,00 € and updatedAt 08:04.
- [x] Added tenant-scoped, read-only visibility of the linked OCR job status, stage, timestamp and bounded stored background error.
- [x] No OCR, payment, draft, calculation, stock, approval or finalization behavior change.
- [ ] Αναμονή CI, merge and LAB read of the exact `OCR job:` diagnostic.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-pos-job-observability.md`.

## 2026-09-14 — Gate 3: preserve full OCR provider error

- [x] LAB proved recovery ran and failed again at 17:12 with the generic all-pages error.
- [x] Preserve bounded OpenAI and exact Azure page/provider failure details in the same durable job.
- [x] No OCR algorithm, payment, draft, pricing/discount, stock, approval or finalization change.
- [ ] Αναμονή CI, merge and one LAB refresh for the exact provider/page result.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-preserve-full-ocr-provider-error.md`.

## 2026-09-14 — Gate 3: recover filter in code

- [x] LAB after live 4d33312a stayed on the old 17:12 generic failure, proving the job was not reclaimed.
- [x] Removed the redundant database error regex; the existing tested application guard remains authoritative before UPDATE.
- [x] Non-transient failed jobs remain excluded and cannot starve eligible candidates; maximum recovery remains 3.
- [x] No payment, OCR algorithm, draft, pricing/discount, stock, approval or finalization change.
- [ ] Αναμονή CI, merge and LAB recovery of invoice 2612188.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-recover-filter-in-code.md`.

## 2026-09-14 — Gate 3: show recovery outcome

- [x] LAB on live 7e6f22f8 remained on the unchanged 17:12 failure; no reclaim was observable.
- [x] Surface safe recovery counters or the endpoint error beside the refresh timestamp.
- [x] No OCR/provider, payment, draft, pricing/discount, stock, approval or finalization change.
- [ ] Αναμονή CI, merge and one immediate LAB refresh outcome.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-show-recovery-outcome.md`.

## 2026-09-14 — Gate 3: rebuild lost durable handoff

- [x] LAB recovery counters proved both scanned failures were skipped only because `posHandoff` was missing.
- [x] Preserve future handoffs by merging AI results instead of replacing `resultJson`.
- [x] Rebuild an existing handoff only from the same tenant/store draft, linked payment and exact transaction page group.
- [x] Reuse already stored product lines without a new provider call; no payment, stock, approval or finalization.
- [ ] Αναμονή CI, merge and LAB validation of 38 lines / 608 pieces / 2.369,99 €.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-rebuild-lost-handoff.md`.

## 2026-09-14 — Gate 3: reread incomplete recovered draft

- [x] LAB proved the recovered draft reused an incomplete stored result: 24 lines / 1.465,98 € with a 904,01 € reconciliation difference.
- [x] Reread the original two durable pages once and replace lines atomically only when the result reconciles or strictly improves the draft.
- [x] Keep the same draft and original payment; no new charge, credit, stock, approval or finalization.
- [ ] Αναμονή CI, merge και LAB validation of 38 lines / 608 pieces / 2.369,99 €.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-reread-incomplete-pos-draft.md`.

## 2026-09-14 — Gate 3: POS automatic incomplete reread

- [x] Corrected the trigger: normal POS polling continues automatically when the first complete result has a reconciliation mismatch.
- [x] BackOffice refresh is not required for the normal invoice flow.
- [x] Same durable draft, pages and payment; no new charge, credit, stock, approval or finalization.
- [ ] Αναμονή CI, merge και νέα LAB δοκιμή αποκλειστικά από το POS.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-pos-automatic-incomplete-reread.md`.
## 2026-09-14 — Gate 3: parallel full-OCR timeout recovery

- [x] LAB 11:31–11:35: 2612188 failed with `POS_FAILED / POS_BACKGROUND_FAILED` and hidden internal error.
- [x] Root cause: sequential Azure page fallback accumulated full per-page timeouts and exposed a generic 500.
- [x] Fix: parallel page recovery; retryable `AZURE_TIMEOUT`/503 retains the failed page and activates the durable worker retry.
- [x] 47/47 targeted tests PASS; no payment, stock, approval or finalization change.
- [ ] Αναμονή CI, merge/deploy και νέα καθαρή POS δοκιμή.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-parallel-timeout-recovery.md`.
## 2026-09-14 — Gate 3: safe background-stage diagnostics

- [x] LAB 11:48–11:52: 2612188 still failed with a generic internal error; provider-timeout recovery was not the failing branch.
- [x] Automatic handoff now identifies AI recheck, product-line save, or purchase intake; AI recheck also returns a bounded safe sub-stage.
- [x] 49/49 targeted tests PASS; no payment, stock, approval or finalization change.
- [ ] Αναμονή CI/deploy και μία διαγνωστική επανάληψη για την ακριβή τελική διόρθωση.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-background-stage-diagnostics.md`.
## 2026-09-15 — Gate 3: secondary-page link during reread

- [x] LAB 12:03–12:11: exact failure `POS_BACKGROUND_PURCHASE_INTAKE`; secondary page was rejected before unified replacement.
- [x] Fix: locked reread accepts only an unclaimed secondary page or one already linked to the same draft; foreign document links remain blocked.
- [x] The exact old failure is reclaimable without a new upload or payment.
- [x] 50/50 targeted tests PASS; no payment, stock, approval or finalization change.
- [ ] Αναμονή CI/deploy και ανάκτηση του υπάρχοντος προχείρου με Ανανέωση.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-gate3-secondary-page-reread-link.md`.

## 2026-09-15 — POS OCR: adjacent row replay guard

- [x] LAB invoice 43243 proved that every physical row was inserted twice (32 lines from a 16-row one-page invoice).
- [x] Collapse only a complete adjacent replay whose single copy is strongly corroborated by the printed invoice total.
- [x] Preserve legitimate repeated rows when the full table total is correct.
- [x] Credit mode remains unchanged; no payment, stock, approval, invoicing or finalization change.
- [ ] Αναμονή CI/deploy και ασφαλής επανάγνωση του ίδιου προχείρου χωρίς νέα αποστολή.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-pos-adjacent-ocr-replay.md`.
## 2026-09-15 — POS OCR: confirmed total replay anchor

- [x] LAB rerun 43243 remained at 32 rows because generic AI ignored the POS-confirmed 76.58 € during replay detection.
- [x] Apply the confirmed handoff total to every supplier path before completeness and replay checks.
- [x] Preserve the immutable paid amount; no new payment, reversal, stock, approval or finalization behavior.
- [ ] Αναμονή CI/deploy και ανάκτηση του υπάρχοντος προχείρου χωρίς νέα αποστολή.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-pos-confirmed-total-replay-anchor.md`.
## 2026-09-15 — POS draft idempotent replacement

- [x] LAB `ΔΑ0011467`: outer summary showed 1,246.38 €, while the linked order had every OCR row twice and showed 2,492.76 €.
- [x] Any successful fill/reread of the same linked DRAFT now replaces its OCR order rows atomically instead of appending.
- [x] Active V2.4.4 intake applies explicit stock conversions such as `3KGR -> 3000g` and `100TEM -> 100 pieces` without altering invoice economics.
- [x] 70/70 targeted tests PASS; payment/credit, stock, approval and finalization remain untouched.
- [ ] Await CI/deploy, then refresh the existing draft and verify one canonical set of lines and one common total inside/outside.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-pos-draft-idempotent-replacement.md`.
## 2026-09-15 — POS printed repeat and warehouse-quantity display

- [x] LAB `ΔΑ0011467` after #860: duplicate append fixed; six canonical rows and the same 1,246.38 € inside/outside.
- [x] Remaining exact difference 134.06 € identifies the omitted second physical `FR1500` 12OZ cup row.
- [x] Genuine-repeat recovery now reads complete local OCR text and the existing mismatched draft is eligible for one versioned safe reread.
- [x] Purchase review shows converted warehouse quantity and unit while retaining invoice quantity for all financial calculations.
- [x] 47/47 targeted tests PASS; no payment/credit, stock posting, approval or finalization.
- [ ] Await CI/deploy, refresh once, then verify seven lines, 1,380.44 € and converted grams/pieces.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-pos-printed-repeat-and-stock-display.md`.

## 2026-09-15 — Invoice Learning inline unit fallback

- [x] FRESH MILK LAB receipt has `ΤΕΜ` inline but no dedicated unit column; the saved supplier map was incorrectly blocked.
- [x] Unit column is optional only when the profile stores the safe `ΤΜΧ` fallback.
- [x] Runtime anchors on the printed inline unit and still requires line-level economic reconciliation.
- [x] Both column-map editors and the runtime path have regression coverage.
- [ ] Await CI/deploy, then save the map and recheck this credit note without finalizing it.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-invoice-learning-inline-unit.md`.

## 2026-09-15 — POS exact-gap row and stock-unit reread

- [x] LAB `ΔΑ0011467` still showed six rows / 1,246.38 € and raw cup quantities after refresh.
- [x] Restore one uniquely matching omitted charge when its gross amount closes the exact invoice-total gap, even if OCR text exposes its code once.
- [x] Start one new versioned POS reread so the existing draft receives current description-based gram/piece conversions.
- [x] 23/23 targeted tests PASS; no payment, stock posting, approval or finalization change.
- [ ] Await CI/deploy, refresh POS once, then verify seven rows, 1,380.44 €, and 2,400/500/500 cup pieces.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-pos-exact-gap-stock-reread.md`.

## 2026-09-15 — POS printed kilogram priority

- [x] LAB proved `36 ΚΙΛΑ` was incorrectly multiplied again by the `3KGR` package description, producing 108,000 g.
- [x] Printed KG/KGR/ΚΙΛΑ now has priority and converts once to grams; description weight remains package metadata.
- [x] Piece/package descriptions retain their existing conversion behavior.
- [x] 23/23 targeted tests PASS; no payment, stock posting, approval or finalization change.
- [ ] Await CI/deploy and verify the first line displays 36,000 g.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-pos-printed-kilogram-priority.md`.

## 2026-09-15 — POS Greek piece marker and unique total gap

- [x] LAB still showed six rows and raw cup quantities after kilogram correction.
- [x] Recognize both Latin `TEM/TMX` and Greek `ΤΕΜ/ΤΜΧ` package-count markers.
- [x] Restore the single unique line whose gross value closes the exact invoice gap even when OCR omits its code from the text layer.
- [x] 23/23 targeted tests PASS; no payment, stock posting, approval or finalization change.
- [ ] Await CI/deploy and verify seven rows, 1,380.44 €, and converted cup pieces.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-pos-greek-pieces-exact-gap.md`.

## 2026-09-15 — POS linked-draft total authority

- [x] LAB proved conversions succeeded but six lines were still treated as complete.
- [x] Root cause: recheck could retain the stale OCR/job total instead of the linked POS draft total.
- [x] Reconciliation now prefers the same DRAFT PurchaseDocument total, then safely falls back to the POS handoff.
- [x] 24/24 targeted tests PASS; no payment, stock posting, approval or finalization change.
- [ ] Await CI/deploy and verify the exact missing FR1500 row is restored.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-pos-linked-draft-total-authority.md`.

## 2026-09-15 — POS final-intake exact-gap recovery

- [x] LAB proved all stock-unit conversions are correct but the legitimate second FR1500 charge is still absent from the six-line draft.
- [x] Final POS intake now restores a line only when one unique existing row closes the complete authoritative invoice gap within 0.05 €.
- [x] Ambiguous or non-reconciling gaps remain unchanged for manual review.
- [x] Targeted reread/intake tests PASS; no payment, stock posting, approval or finalization change.
- [ ] Await CI/deploy and verify seven rows and approximately 1,380.44 €.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-pos-final-intake-exact-gap.md`.

## 2026-09-15 — POS supplier stock conversion exactly once

- [x] LAB now has seven rows and a reconciled 1,380.45 € total.
- [x] LAB exposed double stock conversion: 36,000,000 g / 240,000 pieces instead of 36,000 g / 2,400 pieces.
- [x] Supplier rules now preserve invoice quantity and package price and store only one stock conversion multiplier.
- [x] Regression test prevents converted quantity or divided unit cost from being persisted as invoice economics.
- [ ] Await CI/deploy and verify 36,000 g, 2,000 g, 1,000 g, 2,400 / 500 / 500 pieces.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-pos-supplier-conversion-once.md`.

## 2026-09-15 — POS background request timeout

- [x] Two-page LAB invoice 2612188 remained in POS_PROCESSING with zero lines for more than ten minutes.
- [x] Internal POS background requests now have a 90-second deadline and reuse the existing bounded retry/recovery path.
- [x] Persisted pages and the same DRAFT remain authoritative across timeout and restart.
- [x] Regression test covers timeout and retry classification.
- [ ] Await CI/deploy and verify the existing two-page draft completes without another upload.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-pos-background-request-timeout.md`.


## 2026-09-15 — Invoice Learning invalid AI response retry

- [x] A blank or invalid structured fallback response receives one bounded retry against the original invoice.
- [x] Empty drafts remain blocked; payment, stock, accounting, approval and finalization remain unchanged.
- [ ] Await CI/deploy, then re-read Coffee Union `ΔΑ0011467` from the original POS/front flow.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-invoice-learning-ai-response-retry.md`.

## 2026-09-15 — POS multi-page header continuation

- [x] LAB reproduced internal error when page 1-2 was selected before page 1-1.
- [x] Each header candidate is now read independently; one weak continuation page cannot cancel the valid front page.
- [x] Selection fails only when every candidate page fails.
- [x] Regression test covers continuation after one page error.
- [ ] Await CI/deploy and repeat clean two-page selection without payment until all four fields appear.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-pos-multipage-header-continue.md`.

## 2026-09-15 — POS FAST header invalid-response recovery

- [x] LAB retained both selected pages but both FAST calls ended with a generic internal error before filling the four header fields.
- [x] Header candidates now run concurrently and preserve any successful page result.
- [x] Empty, malformed, timed-out, or rejected FAST structured responses receive one bounded retry.
- [x] Exhausted retries explicitly confirm that no payment occurred; no purchase, stock, approval or finalization behavior changed.
- [x] Client/server builds and 32 targeted POS invoice tests PASS locally.
- [ ] Await green CI/deploy, then repeat one clean two-page read from the POS front without submitting payment.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-pos-fast-header-invalid-response.md`.


## 2026-09-15 — Invoice Learning single reader flow

- [x] The Lab now has one automatic Azure/AI read path per upload; the duplicate automatic reader is not loaded.
- [x] The line-correction button remains manual-only and cannot start a provider request.
- [ ] Await CI/deploy, then re-read Coffee Union once without clicking a second reader button.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-invoice-learning-single-reader-flow.md`.


## 2026-09-15 — POS reuse complete FAST page lines

- [x] LAB proved both invoice pages completed FAST recognition but the draft stayed in POS_QUEUED / POS_RECOVERING with zero lines.
- [x] Successful Azure FAST results now carry their already-read product rows into the durable handoff.
- [x] The background worker reuses cached rows only when every selected page returned safe product lines; otherwise the existing full OCR path remains authoritative.
- [x] Payment reuse, stock posting, approval and finalization behavior remain unchanged.
- [ ] Await green CI/deploy, then safely reread invoice 2612188 without creating another payment.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-pos-fast-page-line-reuse.md`.


## 2026-09-15 — Bounded POS multi-page provider chain

- [x] LAB proved invoice 2612188 returned from POS_BACKGROUND to POS_QUEUED / POS_RECOVERING with zero lines.
- [x] Root cause: the 90-second internal request could wrap a provider chain lasting up to 225 seconds, followed by four full retries.
- [x] Stefanidis pages now use one ordered Azure pass, followed by one bounded OpenAI fallback; the same Azure pass is not repeated.
- [x] Transient background retries are bounded to one retry.
- [x] Payment reuse, stock posting, approval and finalization behavior remain unchanged.
- [ ] Await green CI/deploy, then resume the existing 2612188 draft without another payment.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-pos-bounded-multipage-reader.md`.
- Azure invoice recovery: retain multi-row printed headers when mapping table columns; source reading remains non-mutating. (`2026-09-15-azure-split-invoice-headers-ci.md`)


## 2026-09-15 — Mandatory repository-wide checkpoint gate

- [x] Applies to every module, page, conversation and agent.
- [x] Requires the complete active list, relevant checkpoints and current main history before any change.
- [x] Requires explicit LAB PASS / LAB FAIL / NOT TESTED status and reconciliation of contradictory checkpoints.
- [x] CI PASS cannot be reported as LAB PASS; deployed revision must be verified before a new LAB request.
- [x] Protects payment idempotency, deliberate draft deletion, stock, fiscal, accounting and finalization boundaries.
- [ ] Enforce this gate on every subsequent change.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-15-mandatory-repository-checkpoint-gate.md`.
