Warning: truncated output (original token count: 62585)
Total output lines: 2374

## 2026-09-23 — efood / Pelican LAB schema bootstrap — LAB PASS / FORM LOAD COMPLETE

- [x] Το αρχικό LAB FAIL ήταν «Παρουσιάστηκε εσωτερικό σφάλμα» πριν φορτωθεί η φόρμα efood.
- [x] Η διόρθωση του legacy CHECK constraint έγινε στο PR #1110 και ενσωματώθηκε στο κεντρικό `main`, revision `195a2a27c6c7a8a61d577682215ac432d1d4b582`.
- [x] Main CI #2838 PASS και Render deploy #1397 PASS με επιβεβαίωση της ακριβούς revision.
- [x] Πραγματικό LAB PASS: η φόρμα `efood / Pelican — Indirect POS` ανοίγει στο σωστό `MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ` χωρίς εσωτερικό σφάλμα και εμφανίζει τα SANDBOX πεδία Chain ID, Vendor / Store ID, Client ID, Client Secret και Authorization webhook.
- [x] Η ένδειξη `LAB — ΔΕΝ ΕΧΕΙ ΠΡΟΕΤΟΙΜΑΣΤΕΙ` είναι αναμενόμενη επειδή δεν έχουν ακόμη αποθηκευτεί credentials· δεν αποτελεί αποτυχία του schema bootstrap.
- [x] Δεν καταχωρήθηκε ή εκτέθηκε credential, δεν πατήθηκε αποθήκευση και δεν έγινε εξωτερική κλήση, παραγγελία, πώληση, stock, πληρωμή, fiscal ή myDATA μεταβολή.
- [ ] Επόμενο ξεχωριστό βήμα: έλεγχος του κάτω μέρους της φόρμας, τοπική συμπλήρωση των test credentials χωρίς κοινοποίηση μυστικών και αποθήκευση με όλους τους fail-closed διακόπτες ανενεργούς.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-efood-lab-schema-bootstrap.md`.

## 2026-09-23 — Workforce προσωπικό PIN συναδέλφου από POS — LAB FAIL / LOCAL PASS / AWAITING CI

- [x] Πραγματικό LAB: δεν υπάρχει ακόμη φυσική κάρτα για δοκιμή· απαιτείται ασφαλής εναλλακτική με το υπάρχον προσωπικό PIN.
- [x] Το παράθυρο «Κάρτα εργασίας» προσφέρει PIN ή Κάρτα χωρίς αλλαγή ενεργού χειριστή.
- [x] Το PIN επαληθεύεται με bcrypt σε ενεργό employee/credential του ίδιου company/store και δεν αποθηκεύεται στον browser.
- [x] Πέντε αποτυχίες κλειδώνουν τη συγκεκριμένη προσπάθεια για 15 λεπτά μέσω `StoreOperatorLoginGuard`.
- [x] Διατηρούνται η κάρτα `POS_CARD`, το card audit και η αυτόματη παρουσία ταμία.
- [x] Νεότερο πραγματικό LAB FAIL στο deploy `f0ccd986`: η υποβολή PIN έδειξε λανθασμένα «Υπάρχει ήδη ανοιχτή βάρδια» χωρίς να δημιουργήσει παρουσία.
- [x] Εντοπίστηκε invalid join σε ανύπαρκτο `Employee.companyId` και γενική λανθασμένη μετάφραση κάθε Prisma `P2010` ως διπλής βάρδιας.
- [x] Targeted `4/4`, πλήρες server suite `1427/1427` με `1` skip, client production build και `git diff --check` PASS.
- [ ] Διόρθωση με ίδιο `Employee.storeId` → green CI → merge → exact deploy → LAB PIN προσέλευση/αποχώρηση και έλεγχος Attendance/Audit.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-pos-colleague-pin.md`.

## 2026-09-23 — Workforce πρόγραμμα ανά εργαζόμενο — AWAITING CI / LAB

- [x] Πραγματικό LAB: η προβολή ανά ημέρα είναι σωστή· το Chat χρειάζεται καθαρή ομαδοποίηση ανά εργαζόμενο.
- [x] Προστέθηκε «Ανά εργαζόμενο» με ημερομηνία, βάρδια, ώρες και ΡΕΠΟ για κάθε ημέρα περιόδου.
- [x] Κάθε νέα δημοσίευση δημιουργεί Store Chat μήνυμα ανά εργαζόμενο με τα ΡΕΠΟ.
- [x] Η υπάρχουσα προβολή ανά ημέρα και ο κύκλος έγκρισης/δημοσίευσης δεν αλλάζουν.
- [ ] Green CI → merge → exact deploy → LAB οπτικός έλεγχος της νέας προβολής.
- [ ] Chat LAB στην επόμενη πραγματική δημοσίευση.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-schedule-by-employee.md`.

## 2026-09-23 — Workforce κάρτα συναδέλφων από POS — AWAITING CI / LAB

- [x] Πραγματικό LAB: ο χειριστής μπήκε στο POS· οι μη ταμίες χρειάζονται ξεχωριστή σάρωση προσέλευσης/αποχώρησης.
- [x] Προστέθηκε συμπαγές «Κάρτα εργασίας» με store-scoped hashed lookup και αυτόματο IN/OUT.
- [x] Δεν εμφανίζεται roster ή αριθμός κάρτας· δεν γίνεται name matching· καταγράφεται `POS_CARD` Audit.
- [x] Μπλοκάρεται άμεση δεύτερη σάρωση και διατηρείται η αυτόματη παρουσία του ταμία.
- [x] Τα αιωρούμενα POS κουμπιά έγιναν μικρότερα για να μην καλύπτουν πίνακες.
- [ ] Green CI → merge → exact deploy → LAB με δεύτερο εργαζόμενο (IN, Attendance, OUT, Audit).
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-pos-colleague-card.md`.

## 2026-09-23 — TALOS πλήρης επαλήθευση τυπωμένης ποσότητας — LAB FAIL / LOCAL TESTING

- [x] Πλήρης σύγκριση των 44 γραμμών με τις δύο φωτογραφίες του πρωτοτύπου: 13 ποσότητες είναι λανθασμένες, παρότι οι περισσότερες καθαρές αξίες διατηρούνται σωστά.
- [x] Η γραμμή `4323717` λείπει οικονομικά (`0,00 €` αντί `4,39 €`) και εξηγεί τη διαφορά `247,09 €` έναντι `252,06 €`.
- [x] Η νέα ανάκτηση περιορίζεται αποκλειστικά στο ΑΦΜ TALOS `800802293` και αποδέχεται ποσότητα μόνο όταν η ίδια ωμή γραμμή αποδεικνύει και τις δύο οικονομικές εξισώσεις.
- [x] Οι ήδη σωστές γραμμές διατηρούν την ίδια ποσότητα· άλλοι προμηθευτές και μη ισοσκελισμένες γραμμές δεν αλλάζουν.
- [x] Targeted `36/36`, πλήρες server suite `1411/1411`, client production build και `git diff --check` PASS.
- [ ] CI → merge → exact deploy → LAB επανέλεγχος.
- [ ] LAB PASS μόνο με 44 γραμμές, όλες τις τυπωμένες ποσότητες και `223,05 € + 29,01 € = 252,06 €`.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-22-talos-verified-net-suffix.md`.

## 2026-09-23 — TALOS επαληθευμένη ποσότητα και Azure reading-order suffix — LAB FAIL / LOCAL PASS

- [x] **Νεότερο LAB FAIL μετά το ακριβές deploy `6326a260`**: 44 γραμμές αλλά `214,38 € + 27,87 € = 242,25 €`, αντί `223,05 € + 29,01 € = 252,06 €`.
- [x] Η οθόνη αντικαθιστούσε την ήδη επαληθευμένη server ποσότητα με `τυπωμένη καθαρή αξία ÷ τιμή`, π.χ. εμφάνιζε `2` αντί `4` στον κωδικό `4014386`.
- [x] Όταν μία φυσική TALOS γραμμή επιστρέφεται από Azure σε visual reading order, ανακατασκευάζεται μόνο αν η σειρά και οι δύο εξισώσεις της γραμμής δίνουν μία μοναδική ερμηνεία. Ο κωδικός `4327325` αποδεικνύεται ως ποσότητα `7`, τιμή `0,85 €`, προ έκπτωσης `5,95 €`, καθαρή `4,28 €`, ΦΠΑ `13%`.
- [x] Η Invoice Learning οθόνη διατηρεί πλέον κάθε `supplierProfileRecovered` ποσότητα αντί να την ξαναϋπολογίζει.
- [x] Δεν αλλάζουν υπάρχουσες εκμαθήσεις, mappings/barcodes, άλλοι προμηθευτές, πληρωμές, stock, οριστικοποίηση, λογιστική ή myDATA.
- [x] Targeted TALOS/column-map regression `35/35` PASS.
- [x] Πλήρες server suite `1410/1410`, client production build και `git diff --check` PASS.
- [ ] Πράσινο CI → merge → ακριβές deploy → Ctrl+F5 και επανέλεγχος των ίδιων 2 σελίδων.
- [ ] LAB PASS μόνο με 44 γραμμές και `223,05 € + 29,01 € = 252,06 €`, πριν από «Επιβεβαίωση & Εκμάθηση».
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-22-talos-verified-net-suffix.md`.

## 2026-09-22 — TALOS τυπωμένη καθαρή αξία και ελλιπής ποσότητα — LAB FAIL / LOCAL PASS

- [x] **LAB FAIL μετά το deploy του χάρτη στηλών**: 44 γραμμές αλλά `225,09 € + 27,64 € = 252,72 €`, αντί `223,05 € + 29,01 € = 252,06 €`.
- [x] Η οθόνη χρησιμοποιούσε ξανά `ποσότητα × τιμή × έκπτωση %` και αγνοούσε την αποδεδειγμένη τυπωμένη καθαρή αξία της γραμμής.
- [x] Ο TALOS suffix reader αποδέχεται ποσότητα, τιμή, προ έκπτωσης αξία, ποσό έκπτωσης, καθαρή αξία και ΦΠΑ μόνο όταν οι δύο ανεξάρτητες εξισώσεις γραμμής συμφωνούν.
- [x] Αν το Azure παραλείψει μόνο την ποσότητα, αυτή ανακατασκευάζεται ως `αξία προ έκπτωσης ÷ τιμή` μόνο όταν προκύπτει μοναδικός ακέραιος και επαληθεύεται όλη η γραμμή.
- [x] Δεν αλλάζουν υπάρχουσες εκμαθήσεις, mappings/barcodes, άλλοι προμηθευτές, πληρωμές, stock, οριστικοποίηση, λογιστική ή myDATA.
- [x] Targeted TALOS/column-map regression `34/34`, πλήρες server suite `1409/1409` και client production build PASS.
- [ ] Πράσινο CI → merge → ακριβές deploy → Ctrl+F5 και επανέλεγχος των ίδιων 2 σελίδων.
- [ ] LAB PASS μόνο με 44 γραμμές και `223,05 € + 29,01 € = 252,06 €`, πριν από «Επιβεβαίωση & Εκμάθηση».
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-22-talos-verified-net-suffix.md`.

## 2026-09-22 — Workforce V2 ημερομηνίες χωρίς μετατόπιση ζώνης ώρας — AWAITING CI / LAB

- [x] Πραγματικό LAB FAIL: ο κανόνας Νωπής επιλέχθηκε από 22/09/2026 αλλά εμφανίστηκε αποθηκευμένος από 2026-09-21.
- [x] Οι date-only τιμές κανόνων και καρτελών εργαζομένων μετατρέπονται πλέον σε ρητό UTC ημερολογιακό όριο, χωρίς εξάρτηση από τη ζώνη ώρας του browser.
- [x] Regression tests για αρχή ημέρας, τέλος ημέρας και κενές προαιρετικές ημερομηνίες PASS.
- [x] Client production build PASS.
- [ ] Πράσινο CI, merge, ακριβές Render deploy και διόρθωση/επανάληψη του κανόνα Νωπής με 22/09/2026.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-22-workforce-v2-date-only-timezone.md`.

## 2026-09-22 — Workforce V2 ελεγχόμενη μεταφορά εργαζομένων — LAB FAIL / LOCAL PASS

- [x] Πραγματικό LAB: η παλιά βάση έχει 7 εργαζομένους, αλλά το Workforce V2 εμφανίζει μόνο 2.
- [x] Η Κωνσταντίνα και άλλοι 4 εμφανίζονται στην προεπισκόπηση ως «Χρειάζεται έλεγχο» επειδή λείπει ο ρόλος «Εργαζόμενος».
- [x] Προστέθηκε επιλογή εργαζομένων και ρητή επιβεβαίωση πριν από τη μεταφορά.
- [x] Το apply ξαναϋπολογίζει όλη την προεπισκόπηση, απαιτεί ίδιο hash και μπλοκάρει stale preview, duplicates, ήδη συνδεδεμένους και blocked rows.
- [x] Δημιουργεί/επαναχρησιμοποιεί ρόλο ανά παλιά θέση, συνδέει `legacyEmployeeId`, store access και γράφει αναλυτικό audit μέσα σε μία transaction.
- [x] Targeted Workforce tests `17/17`, πλήρες server suite `1385/1385`, server syntax και client production build PASS.
- [x] CI #2752 έφτασε σε E2E και αποκάλυψε παλιά υπόθεση «κανένα apply endpoint»· ενημερώθηκε ώστε Owner να λαμβάνει `403` και apply να παραμένει μόνο Platform Super Admin.
- [ ] Green CI επανάληψη → merge/deploy → LAB εφαρμογή των 5 επιλεγμένων.
- [ ] Μετά τη μεταφορά: Workforce V2 πρέπει να δείχνει 7/7 και η Κωνσταντίνα 4 ημέρες / 32 ώρες πριν από τη δοκιμή scheduler.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-22-workforce-v2-controlled-migration.md`.

## 2026-09-22 — FRESH SNACK πραγματικό ΑΦΜ προφίλ — AWAITING CI / DEPLOY / LAB

- [x] **LAB FAIL μετά το πρώτο deploy**: το νέο ανέβασμα του `006019` παρέμεινε σε `18 προϊόντα`, επειδή η οθόνη/παραστατικό έχει ΑΦΜ `999162880` ενώ το seed του κανόνα είχε λανθασμένα `099162880`.
- [x] Το κεντρικό προφίλ `FRESH_SNACK_COMPLETE_PRINTED_TABLE` συνδέεται πλέον με το πραγματικό ΑΦΜ `999162880`.
- [x] Δεν αλλάζει ο ασφαλής κανόνας: πλήρης ένωση 18→9 μόνο όταν όλες οι εξισώσεις γραμμών και το footer συμφωνούν.
- [x] Δεν αλλάζουν άλλοι προμηθευτές, ιστορικά οικονομικά στοιχεία, πληρωμές, stock, οριστικοποίηση, λογιστική ή myDATA.
- [ ] Πράσινο CI, merge, ακριβές Render deploy και νέα ανάγνωση του `006019` μετά από `Ctrl+F5`.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-22-fresh-snack-correct-tax-id.md`

## 2026-09-22 — FRESH SNACK διπλές τυπωμένες γραμμές — AWAITING CI / DEPLOY / LAB

- [x] **LAB FAIL / νέο πραγματικό δείγμα**: το Invoice Learning χώρισε 9 προϊόντα σε 18 OCR γραμμές (περιγραφή και αριθμητική συνέχεια), με λανθασμένα μηδενικά και σύνολο `55,90 €` αντί του τυπωμένου `99,99 €`.
- [x] Ο κανόνας ενεργοποιείται μόνο από το υπάρχον κεντρικό προφίλ `FRESH_SNACK_COMPLETE_PRINTED_TABLE` και ενώνει μόνο πλήρη εναλλασσόμενα ζεύγη της τρέχουσας εικόνας.
- [x] Κάθε ζεύγος πρέπει να αποδεικνύει `ποσότητα × τιμή × έκπτωση = καθαρή αξία` και ολόκληρος ο πίνακας να συμφωνεί με footer `88,49 € + 11,50 € = 99,99 €`. Αλλιώς διατηρείται αμετάβλητη η ανάγνωση για έλεγχο.
- [x] Δεν αποθηκεύονται ιστορικές τιμές/ποσότητες και δεν αλλάζουν άλλοι προμηθευτές, POS πληρωμές, stock, οριστικοποίηση, λογιστική ή myDATA.
- [ ] Πράσινο CI, merge, ακριβές Render deploy και νέα ανάγνωση της φωτογραφίας στο Invoice Learning. Η επιτυχία απαιτεί 9 γραμμές και ακριβές footer πριν από εκμάθηση.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-22-fresh-snack-wrapped-line-pairs.md`

## 2026-09-22 — POS `pc` χωρίς διπλή μετατροπή ποσότητας — AWAITING CI / DEPLOY

- [x] Η μονάδα `pc` αναγνωρίζεται ως τεμάχιο όπως ΤΜΧ/TEM/PCS.
- [x] Οι σωστές ποσότητες Invoice Learning `24`, `16` και `36` δεν γίνονται `192`, `144` και `360` από το `8TMX/9TMX/10TMX` της περιγραφής.
- [x] Η προστασία εφαρμόζεται και απέναντι σε παλιά learned pack mappings όταν η τυπωμένη γραμμή είναι επιβεβαιωμένη ως `pc`.
- [x] Δεν αλλάζουν τιμές, εκπτώσεις, ΦΠΑ, πληρωμές ή stock πριν την οριστικοποίηση.
- [ ] Πράσινο CI, merge, deploy και νέα ανάγνωση του ίδιου τιμολογίου από POS.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-22-pos-pc-quantity-no-double-conversion.md`

## 2026-09-22 — Άμεση ενημέρωση ΦΠΑ Invoice Learning — AWAITING CI / DEPLOY

- [x] Η επιλογή ΦΠΑ από το dropdown ενημερώνει το πραγματικό draft της γραμμής.
- [x] Τα σύνολα ΦΠΑ και μικτής αξίας επανυπολογίζονται αμέσως.
- [x] Η επαγγελματική προβολή εμφανίζει τον νέο συντελεστή αντί για το παλιό `0%`.
- [x] Δεν αλλάζουν ποσότητες, καθαρές τιμές, εκπτώσεις ή stock.
- [ ] Πράσινο CI, merge, deploy και επανάληψη αλλαγής `0% → 13%`.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-22-invoice-learning-vat-live-update.md`

## 2026-09-22 — Popup επιλογής μονάδας Invoice Learning — AWAITING CI / DEPLOY

- [x] Τα πεδία «Μονάδα τιμολογίου» και «Μονάδα stock» εμφανίζουν προτεινόμενες μονάδες.
- [x] Περιλαμβάνονται ΤΜΧ, ΚΟΥ/ΚΟΥΤΑ, ΚΙΒ/ΚΒ, ΣΥΣΚΕΥΑΣΙΑ, ΠΑΚΕΤΟ, ΚΙΛΟ, ΓΡ και ΛΙΤΡΟ.
- [x] Παραμένει δυνατή η πληκτρολόγηση άλλης μονάδας.
- [x] Δεν αλλάζουν ποσότητες, τιμές, εκπτώσεις ή αποθήκη.
- [ ] Πράσινο CI, merge, deploy και οπτική δοκιμή στη διόρθωση γραμμής.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-22-invoice-learning-unit-suggestions.md`

## 2026-09-22 — Ρητός τύπος παραστατικού Invoice Learning — AWAITING CI / DEPLOY

- [x] Το «ΤΙΜΟΛΟΓΙΟ ΠΩΛΗΣΗΣ – ΔΕΛΤΙΟ ΑΠΟΣΤΟΛΗΣ» παραμένει κανονικό τιμολόγιο ακόμη και με προηγούμενο υπόλοιπο `-0,02` ή μεμονωμένη αναφορά επιστροφής.
- [x] Πιστωτικό αναγνωρίζεται μόνο από ρητό τίτλο: «Πιστωτικό Τιμολόγιο», «Πιστ. Τιμ.», «Credit Note» ή «Δελτίο Επιστροφής».
- [x] Δεν αλλάζουν ποσότητες, τιμές, συσκευασίες, POS, πληρωμές ή stock.
- [ ] Πράσινο CI, merge, deploy και νέα εισαγωγή του ίδιου τιμολογίου.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-22-invoice-learning-explicit-document-type.md`

## 2026-09-22 — Invoice Learning επαναφορά σταθερής ανάγνωσης — AWAITING CI / DEPLOY

- [x] Αφαιρέθηκε η πειραματική ανάγνωση τριών επικαλυπτόμενων crops που δημιούργησε 32 λανθασμένες γραμμές.
- [x] Αφαιρέθηκε το επόμενο φίλτρο που άφησε μόνο 10 ελλιπείς/λανθασμένες γραμμές.
- [x] Επαναφέρθηκε αποκλειστικά η προηγούμενη συμπεριφορά ανάγνωσης πριν από τα PR #1063/#1064, χωρίς αλλαγή σε POS, πληρωμές, αποθήκη ή ήδη αποθηκευμένα τιμολόγια.
- [x] Το Invoice Learning χρησιμοποιεί πλέον το κοινό POS pipeline για κόψιμο περιθωρίων, ίσιωμα, αφαίρεση σκιάς, ενίσχυση αντίθεσης, όριο 3000 px και απόρριψη θολής/μικρής φωτογραφίας πριν από OCR.
- [x] Η ίδια προεπεξεργασία εφαρμόζεται σε φωτογραφία PC, κάμερα και QR· τα PDF παραμένουν ανέπαφα.
- [ ] Πράσινο CI, merge, deploy και επανάληψη της ίδιας πραγματικής δοκιμής.
- [ ] Νέα πραγματική δοκιμή με την ίδια αρχική φωτογραφία και σύγκριση πλήθους, κωδικών, ποσοτήτων, τιμών και εκπτώσεων.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-22-invoice-learning-rollback-crop-reader.md`

## 2026-09-22 — Εκκρεμή Barcodes σε κουμπί — AWAITING CI / DEPLOY

- [x] Η παλιά πλήρης λίστα προϊόντων δεν εμφανίζεται πλέον ανοιχτή στην αρχική φόρτωση.
- [x] Ανοίγει μόνο από το κουμπί «Εκκρεμή Barcodes» και κρύβεται ξανά η συμπληρωματική compact λίστα.
- [x] Διορθώθηκε ο δεύτερος legacy bootstrap που την άνοιγε ξανά.
- [ ] Πράσινο CI, merge και deploy πριν από τελική δοκιμή.

## 2026-09-21 — Αφαίρεση διπλού κουμπιού Invoice Learning — IN PROGRESS

- [x] Αφαιρέθηκε το διπλό «Πρόχειρο τιμολόγιο».
- [x] Παραμένει το ενιαίο κουμπί «Πρόχειρα τιμολόγια».
- [ ] Πράσινο CI, merge και deploy πριν από δοκιμή.

## 2026-09-21 — Συμπύκνωση Invoice Learning Lab — IN PROGRESS

- [x] Προστέθηκε γρήγορη πλοήγηση με ξεχωριστά κουμπιά.
- [x] Χωρίστηκαν τα πρόχειρα και τα εκπαιδευμένα τιμολόγια.
- [x] Η λίστα εκκρεμών barcodes έγινε ξεχωριστή, περιορισμένη και μετρήσιμη.
- [ ] Πράσινο CI, merge και deploy πριν από τελική δοκιμή.

## 2026-09-21 — Αρχικοποίηση mappings προμηθευτή — IN PROGRESS

- [x] Δημιουργείται αυτόματα το mappings όταν λείπει από παλιό προφίλ.
- [x] Δεν αποτυγχάνει η εκμάθηση στον πρώτο κωδικό προϊόντος.
- [ ] Πράσινο CI, merge και deploy πριν από τελική δοκιμή.

## 2026-09-21 — Προστασία εκμάθησης από σφάλμα handler — IN PROGRESS

- [x] Όλη η διαδικασία Επιβεβαίωσης & Εκμάθησης καλύπτεται από try/catch.
- [x] Δεν μένει το κουμπί σε «Κεντρική αποθήκευση…» αν αποτύχει εσωτερικό βήμα.
- [ ] Πράσινο CI, merge και deploy πριν από δοκιμή.

## 2026-09-21 — Μη μπλοκαριστική ολοκλήρωση εκμάθησης — IN PROGRESS

- [x] Το κουμπί ολοκληρώνει αμέσως χωρίς αναμονή δικτύου.
- [x] Η κεντρική αποθήκευση συνεχίζει στο παρασκήνιο.
- [ ] Πράσινο CI, merge και deploy πριν από νέα δοκιμή.

## 2026-09-21 — Κεντρική εκμάθηση τιμολογίου χωρίς μπλοκάρισμα — IN PROGRESS

- [x] Άμεση αποθήκευση του διορθωμένου τιμολογίου ως LEARNED.
- [x] Ανεξάρτητος συγχρονισμός κανόνων χωρίς επιστροφή σε DRAFT.
- [ ] Πράσινο CI, merge και deploy πριν από νέα δοκιμή.

## 2026-09-21 — Αφαίρεση επάνω πίνακα OCR — IN PROGRESS

- [ ] Αφαίρεση επάνω πίνακα από τη διόρθωση παραγγελίας.
- [ ] Διατήρηση κάτω πίνακα γραμμών και φόρμας διόρθωσης.
- [ ] Πράσινο CI και deploy πριν από νέα δοκιμή.

## 2026-09-21 — Άμεση διόρθωση γραμμής τιμολογίου — IN PROGRESS

- [ ] Άνοιγμα μόνο της φόρμας της γραμμής.
- [ ] Αντιστοίχιση προϊόντος μέσα στη φόρμα γραμμής.
- [ ] Έλεγχος CI και deploy πριν από δοκιμή.

Warning: truncated output (original token count: 69316)
Total output lines: 2477

## 2026-09-20 — Employee modal scroll fix rebased — AWAITING CI/LAB

- [x] Fresh current-main rebase after concurrent changes.
- [x] Viewport-contained modal scrolling + reachable actions.
- [ ] CI/merge/deploy → LAB retest.

## 2026-09-20 — Workforce employee action buttons — AWAITING LAB

- [x] Fix overlapping/clipped top-right actions.
- [x] Rename Add to «Νέος εργαζόμενος».
- [x] Keep «Φόρτωση Σεναρίου» as separate LAB action.
- [x] Responsive wrapping.
- [ ] CI/merge/deploy → visual LAB retest.

## 2026-09-20 — Owner unified Workforce hub rebased — AWAITING CI/LAB

- [x] Rebased on current main after PR #1026 became non-mergeable from concurrent changes.
- [x] One sidebar entry: Προσωπικό & Πρόγραμμα.
- [x] Internal tabs reuse Employees/Schedule/Leaves; attendance placeholder retained.
- [ ] CI/merge/deploy → LAB visual test.

## 2026-09-20 — Invoice Learning cross-provider duplicate reconciliation — AWAITING CI / LAB

- [x] Post-deploy LAB: Azure returned `NO_SAFE_RESULT`; Azure+OpenAI hybrid rows totalled `56,59 €` against printed `53,91 €` (unique overage `2,68 €`).
- [x] Hybrid merge now tracks Azure/OpenAI row origin and may collapse one cross-provider description variant only when identity overlaps, at least two economic fields agree, one row equals the entire overage, the candidate pair is unique, and the remaining total reconciles within `0,05 €`.
- [x] Legitimate repeated rows and ambiguous pairs remain untouched and fail closed.
- [x] Targeted `13/13` and full server suite `1367/1367` PASS.
- [ ] Green CI → merge → exact Render deploy → same LAB invoice.
- [ ] LAB PASS requires all real rows and exact `47,48 € + 6,43 € = 53,91 €` reconciliation.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-invoice-learning-cross-provider-duplicate.md`.

## 2026-09-20 — Invoice Learning exact duplicate overage guard — AWAITING CI / LAB

- [x] Post-deploy LAB: POS-style fallback completed, but provider rows totalled `55,65 €` against the printed `53,91 €`; fail-closed `422` correctly prevented a partial draft.
- [x] The `1,74 €` overage is handled with the same independently-totalled safeguard used by POS.
- [x] One row is removed only when exactly one identical economic tuple is duplicated, one copy equals the entire overage, and the remaining rows reconcile to the printed footer within `0,05 €`.
- [x] Legitimate repeated rows and ambiguous duplicate groups remain untouched and fail closed.
- [x] Targeted tests `16/16` and full suite `1365/1365` PASS.
- [ ] Green CI → merge → exact Render deploy → same LAB invoice.
- [ ] LAB PASS requires all real rows and exact reconciliation to `47,48 € + 6,43 € = 53,91 €`.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-invoice-learning-exact-duplicate-overage.md`.

## 2026-09-20 — «Φόρτωση Σεναρίου» — AWAITING LAB

- [x] Exact button label requested by user.
- [x] Explicit confirmation before mutation.
- [x] Calls guarded LAB-only Super Admin endpoint and reloads personnel.
- [ ] CI/merge/deploy → one-click user LAB execution.

## 2026-09-20 — Invoice Learning follows the POS provider fallback — AWAITING CI / LAB

- [x] Exact shared POS Azure transport deployed at `55bb5c90c6ea13db073ae37a6d1351f22166f866`; repeated LAB still returns `ACCESS_403`.
- [x] Remaining flow difference found: POS continues to its configured fallback after Azure failure, while Invoice Learning returned immediate `503`.
- [x] Invoice Learning now continues to OpenAI using the original uploaded document when Azure fails, matching the POS provider chain.
- [x] Existing full economic completeness check remains fail-closed: no empty or partial draft may be returned.
- [ ] Green CI → merge → exact Render deploy → repeat the same invoice upload.
- [ ] LAB PASS requires a complete reconciled result; otherwise the existing explicit `422` remains the safe outcome.
- [x] No change to POS behavior, credentials, payment, draft persistence, stock, approval/finalization, fiscal, accounting or myDATA.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-invoice-learning-pos-provider-fallback.md`.

## 2026-09-20 — LAB Drakou seed rebased on current main — AWAITING CI/LAB

- [x] Fresh branch from current main to restore PR CI triggering.
- [x] Super Admin + explicit confirmation + ΕΡΓΑΣΤΗΡΙΟ-only guard.
- [x] Five requested Drakou employees and shift eligibility.
- [ ] CI → merge → deploy → LAB execution.

## 2026-09-20 — Invoice Learning uses the POS Azure transport — AWAITING CI / LAB

- [x] Πραγματικό LAB: η Azure ανάγνωση λειτουργεί από το POS, ενώ το Invoice Learning απέτυχε με `ACCESS_403` — **LAB FAIL** για το Learning Lab.
- [x] Αιτία κώδικα: το Invoice Learning διατηρούσε δεύτερη ανεξάρτητη υλοποίηση endpoint/auth/upload/polling αντί να χρησιμοποιεί την κοινή λειτουργική ροή του POS.
- [x] Το Invoice Learning χρησιμοποιεί πλέον το exported `callAzure` του `commerce-azure-invoice-reader`; η ειδική κανονικοποίηση/εκμάθηση του Lab παραμένει αμετάβλητη.
- [x] Τοπικά: πλήρες server suite `316/316` και νέος regression έλεγχος PASS.
- [ ] Green CI → merge → exact Render deploy → ίδιο Invoice Learning upload. Μέχρι τότε δεν χαρακτηρίζεται fixed.
- [ ] LAB PASS μόνο όταν η Azure κλήση ολοκληρωθεί χωρίς `ACCESS_403` και η υπάρχουσα fail-closed οικονομική συμφωνία επιτρέψει ασφαλές αποτέλεσμα ή σαφές `NO_SAFE_RESULT`.
- [x] Καμία αλλαγή σε POS συμπεριφορά, credentials, πληρωμή, draft persistence, stock, approval/finalization, fiscal, accounting ή myDATA.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-invoice-learning-pos-azure-transport.md`.

## 2026-09-20 — Invoice Learning bounded OpenAI fallback — AWAITING CI / LAB

- [x] Azure σύνδεση LAB PASS· νέο πραγματικό LAB FAIL: απλό `AI σφάλμα 502` μετά από Azure partial.
- [x] OpenAI fallback σε fast model + minimal reasoning + bounded timeout πριν από Render gateway timeout.
- [x] Timeout επιστρέφει ασφαλές JSON και δεν αποθηκεύει μερικό Azure draft.
- [ ] CI/merge/exact deploy → ίδιο invoice → όλες οι γραμμές και ακριβής συμφωνία `47,48 + 6,43 = 53,91 €`.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-invoice-learning-bounded-openai-fallback.md`.

## 2026-09-20 — Natural-language employee rules v1 — AWAITING LAB

- [x] Employee card: free-language permanent rule + effective date.
- [x] «Τι κατάλαβα» preview before confirmation.
- [x] Confirmed shift/day constraints compile to scheduler structure.
- [x] Rule history retained.
- [ ] CI/merge/deploy → LAB employee test.
- [ ] Cross-employee dependency rules in v2.

## 2026-09-20 — AI Scheduler Workforce employee bridge — FIX AWAITING USER RETEST

- [x] LAB reproduced 0/21 despite active Workforce V2 employees.
- [x] Root cause: generator uses legacy Employee/EmployeeRule while Personnel screen uses WorkforceEmployee.
- [x] Bridge by persistent legacyEmployeeId; no name matching after link is stored.
- [x] Seed shift rules from V2 morning/afternoon/night only if legacy employee has no rules; existing rules preserved.
- [ ] CI/merge/deploy → rerun same LAB generation.

## 2026-09-20 — AI Scheduler generic safety unresolved — FIX AWAITING USER RETEST

- [x] Coverage duplicate warning fixed in LAB.
- [x] Generic «μην παραβιάσεις άδειες/ρεπό/μόνιμους κανόνες» is an enforced constraint, not unresolved.
- [x] Specific dated conflicts remain fail-closed/unresolved.
- [ ] CI/merge/deploy → user repeats analysis.

## 2026-09-20 — AI Scheduler duplicate unresolved — FIX AWAITING USER RETEST

- [x] LAB reproduced: coverage understood and simultaneously marked unresolved.
- [x] Structured shift count fields are authoritative and no longer re-flagged as ambiguous coverage.
- [x] Exact duplicate understood/unresolved text is removed.
- [ ] CI/merge/deploy → user repeats «Ανάλυση οδηγιών».

## 2026-09-20 — Workforce PUBLISHED → Store Chat v4 — AWAITING LAB

- [x] Μόνο PUBLISHED πρόγραμμα στέλνεται στο υπάρχον Store Chat.
- [x] Important SHIFT message, store-scoped, idempotent.
- [x] DRAFT/PREVIEWED/APPROVED δεν στέλνουν μήνυμα.
- [x] Email μένει fail-closed μέχρι verified mail provider.
- [ ] CI/merge/deploy → USER LAB TEST scheduler end-to-end.

## 2026-09-20 — Workforce AI conversation + DRAFT apply v3 — AWAITING LAB

- [x] In-session correction conversation retained.
- [x] Explicit reviewed preview → DRAFT only, with reason/audit.
- [x] Immediate deterministic scheduleValidation.
- [x] Never auto-publishes; normal PREVIEWED → APPROVED → PUBLISHED remains mandatory.
- [ ] CI/merge/deploy → USER LAB TEST.
- [ ] Publish notification to Store Chat/email after scheduler PASS.

## 2026-09-20 — Workforce AI Scheduler structured preview v2 — AWAITING LAB

- [x] Natural Greek instruction → weekly structured PREVIEW.
- [x] Real employees/availability/approved leave/permanent rules/shift minimum coverage.
- [x] Named ρεπό/άδεια weekdays + only morning/afternoon/night + balanced workday counts.
- [x] Uncovered-slot warnings + per-employee workday totals.
- [x] PREVIEW ONLY; no persistence.
- [ ] Conversational corrections preserving previous instructions.
- [ ] Apply to DRAFT → deterministic validation → approval/publish.

## 2026-09-20 — Workforce AI Scheduler foundation — AWAITING LAB

- [x] Natural-language scheduler workspace.
- [x] Verified context: employees/rules/availability/approved leave/shift templates.
- [x] Fail-closed PREVIEW_ONLY — καμία αυτόματη εγγραφή/δημοσίευση.
- [ ] Structured AI proposal + deterministic validation.
- [ ] Conversational corrections preserving prior rules.
- [ ] Approval → publish → Store Chat/email.

## 2026-09-20 — Workforce Human Evaluations v1 — AWAITING LAB

- [x] Category/date/optional 1–5/mandatory comment + creator.
- [x] Workforce audit on creation.
- [x] Separate from measured evidence; no automatic score.
- [ ] LAB test.
- [ ] AI conversational scheduler/publish.

## 2026-09-20 — Workforce POS Actions v3 — AWAITING LAB

- [x] PosSaleActionAudit συνδέεται μόνο με verified operatorId του εργαζομένου.
- [x] Ακυρώσεις / επιστροφές / delayed / discount-labelled audit + source sale IDs.
- [x] Χωρίς name matching ή αυτόματο punitive score.
- [ ] LAB με εργαζόμενο που έχει πραγματικό POS action history.
- [ ] Human evaluation records.
- [ ] AI conversational scheduler/publish.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-workforce-pos-actions-v3.md`.

## 2026-09-20 — Workforce POS Performance v2 — AWAITING LAB

- [x] Verified identity chain WorkforceEmployee → StoreOperatorCredential → operatorId → CashShiftSession → StoreTransaction.
- [x] Χωρίς name matching.
- [x] Καρτέλα: βάρδιες ταμείου, συναλλαγές, cash/card sales, variance, reversals, recent shifts.
- [ ] LAB employee with real POS history.
- [ ] Discounts/voids/returns drill-down + human evaluations.
- [ ] AI conversational scheduler/publish.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-workforce-pos-performance-v2.md`.

## 2026-09-20 — Workforce Employee Performance v1 — AWAITING LAB

- [x] Καρτέλα «Απόδοση & Ταμεία» ανά πραγματικό Workforce employee.
- [x] 30-day attendance evidence: εργασία, υπερωρία, καθυστέρηση, προς έλεγχο + audit.
- [x] POS metrics fail-closed ως NOT_LINKED_YET μέχρι verified employee↔operator/session relation — χωρίς name matching.
- [ ] Authoritative POS link → sales/transactions/discounts/voids/returns/cash variances + drill-down.
- [ ] AI conversational scheduler → preview → approval → publish/chat/email.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-workforce-employee-performance-v1.md`.

## 2026-09-20 — ΚΑΝΟΝΑΣ PASS → MANUAL — ACTIVE

- [x] Κάθε πραγματικό LAB/LIVE/USER PASS μπαίνει υποχρεωτικά στο `docs/manual/` μαζί με checkpoint/active list.
- [x] CI PASS μόνο του δεν θεωρείται λειτουργικό PASS.
- [x] FAIL/AWAITING LAB/RETEST/OPEN δεν μπαίνουν ως ολοκληρωμένες οδηγίες.
- [x] Νεότερο πραγματικό checkpoint υπερισχύει παλιότερου.
- [x] Αρχικές ενότητες manual: Products, Mobile/PWA, POS, Chat, Super Admin, Video Audit.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-pass-to-manual-rule.md`.

## 2026-09-20 — Video FFmpeg timeout / heartbeat protection — AWAITING LAB

- [x] LAB process inspection: πραγματικό Dahua `.dav` έχει κατέβει· κόλλημα στο `ffmpeg DAV→MP4`.
- [x] FFmpeg γίνεται bounded child process: `-nostdin`, 60s timeout, kill, explicit error.
- [x] Connector loop επιστρέφει μετά από hang ώστε να συνεχίζει heartbeat/ONLINE.
- [ ] CI → merge → καθάρισμα stuck process → pinned script → πραγματικό clip.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-video-ffmpeg-timeout.md`.

## 2026-09-20 — Explicit Video command retry after CLAIMED — AWAITING LAB

- [x] Connector parser PASS + task Running + ONLINE, αλλά UI timeout με heartbeat `commands=0`.
- [x] Explicit retry δεν επαναχρησιμοποιεί πλέον ήδη-consumed CLAIMED command· το κλείνει και δημιουργεί νέο PENDING.
- [ ] CI → merge/deploy → ίδιο συμβάν → `commands=1` → Dahua clip pipeline.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-video-command-explicit-retry.md`.

## 2026-09-20 — Video Connector structural duplicate cleanup — AWAITING LAB

- [x] LAB parser error line 59/111 απομονώθηκε σε orphan/duplicated blocks, όχι σε νέο regex θέμα.
- [x] Αφαιρέθηκε duplicate Fail-Command body και corrupted tail μετά το `NvrClient.Dispose()`.
- [ ] CI → merge → pinned download → `-Once` PASS → ONLINE → clip.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-video-structural-duplicate-cleanup.md`.

## 2026-09-20 — Video Connector zero-regex verified source — AWAITING LAB

- [x] Έγινε full-file έλεγχος και βρέθηκαν duplicated/stale regex occurrences που είχαν μείνει.
- [x] Το branch source επαληθεύτηκε με **0 γραμμές** `-match/-notmatch/-replace` πριν το commit.
- [ ] CI → merge → pinned download → LAB findstr 0 → `-Once` PASS → ONLINE → clip.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-video-ps5-zero-regex-verified.md`.

## 2026-09-20 — Video Connector πλήρως χωρίς regex operators — AWAITING LAB

- [x] Static check βρήκε υπόλοιπα regex σε logging, ONVIF και HTTP stage detection.
- [x] Αφαιρέθηκαν όλα τα `-match/-notmatch/-replace` από το script.
- [ ] CI → merge → pinned download → findstr κενό → `-Once` PASS → ONLINE → clip.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-video-ps5-remove-all-regex.md`.

## 2026-09-20 — Video Connector PS5 χωρίς regex operators — AWAITING LAB

- [x] Commit-pinned LAB test πέρασε το προηγούμενο σημείο και αποκάλυψε parser errors σε `-notmatch/-match/-replace`.
- [x] Αφαιρέθηκαν από findFile/found parsing, stream ref και NVR health error path.
- [ ] CI → merge → pinned download → static check → `-Once` PASS → ONLINE → clip.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-video-ps5-remove-remaining-regex.md`.

## 2026-09-20 — Video Fail-Command χωρίς regex — AWAITING LAB

- [x] LAB απέδειξε parser failure και με `-replace` και με `[regex]::Replace`.
- [x] Αφαιρέθηκε πλήρως το regex από Fail-Command· blank fallback + max 120 chars μόνο.
- [ ] CI → merge → cache-busted download → `-Once` PASS → ONLINE → clip.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-video-fail-command-no-regex.md`.

## 2026-09-20 — Video Fail-Command Regex.Replace PS5 — AWAITING LAB

- [x] PR #984 LAB parser test απέδειξε ότι το PowerShell 5 συνεχίζει να απορρίπτει το `-replace` expression.
- [x] Αφαιρέθηκε πλήρως ο operator και αντικαταστάθηκε με `[regex]::Replace`.
- [ ] CI → merge → LAB `-Once` χωρίς parser error → background ONLINE → clip.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-video-fail-command-regex-ps5.md`.

## 2026-09-20 — Video Fail-Command parser hotfix — AWAITING LAB

- [x] Scheduled task Last Result 1 απομονώθηκε σε PowerShell parser error στη Fail-Command line 52.
- [x] Safe errorCode normalization ξαναγράφηκε συμβατά με Windows PowerShell 5.
- [ ] CI → merge → LAB task Running/ONLINE → retry clip.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-video-fail-command-parser-hotfix.md`.

## 2026-09-20 — Video command stale CLAIMED requeue — AWAITING LAB

- [x] Root cause του UI timeout με connector `commands=0`: παλιό CLAIMED command επαναχρησιμοποιούνταν για έως 5 λεπτά.
- [x] CLAIMED >90s γίνεται FAILED/STALE_CLAIM_REQUEUED και δημιουργείται νέο command.
- [ ] CI → merge → ίδιο συμβάν → commands=1 → πραγματικό clip.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-video-command-stale-claim-requeue.md`.

## 2026-09-20 — Dahua native channel mapping — AWAITING LAB

- [x] Επιτυχημένο manual mediaFileFind είχε `condition.Channel=1`.
- [x] Connector αφαιρούσε 1 και έστελνε λάθος Channel 0· διορθώθηκε να χρησιμοποιεί native Dahua channel.
- [x] Η ίδια HttpClient session ήδη διατηρείται σε create/find/findNext.
- [ ] LAB: D1 IPC stream ref 1 → CI/merge → πραγματικό clip.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-dahua-native-channel-mapping.md`.

## 2026-09-20 — Dahua FIND_FILE query format — AWAITING LAB

- [x] Stage diagnostics: CREATE_SEARCH περνά, αποτυχία ακριβώς στο FIND_FILE.
- [x] Timestamp query ευθυγραμμίστηκε με το επιτυχημένο manual 4KS3 request: μόνο space → %20, χωρίς encoding των ':' χαρακτήρων.
- [ ] CI → merge → LAB πραγματικό clip → FIND_NEXT/LOAD_FILE/MP4.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-dahua-findfile-query-format.md`.

## 2026-09-19 — Dahua clip HTTP 400 stage diagnostics — AWAITING LAB

- [x] Connector ONLINE και πραγματικό clip command φτάνει στο LAB.
- [x] Προστέθηκε `condition.Types[0]=dav` όπως στο επιτυχημένο manual mediaFileFind test.
- [x] Stage-specific errors για CREATE_SEARCH / FIND_FILE / FIND_NEXT / LOAD_FILE.
- [ ] CI → merge → LAB πραγματικό clip → MP4.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-dahua-clip-http400-diagnostics.md`.

## 2026-09-19 — Dahua ώρα / PowerShell 5 ParseExact — AWAITING LAB

- [x] Το `result=...` πλέον διαβάζεται· LAB αποκάλυψε ασυμβατό 4-argument ParseExact overload στο Windows PowerShell 5.
- [x] Αλλαγή σε συμβατό 3-argument ParseExact, με timezone/DST εφαρμογή στο επόμενο βήμα όπως πριν.
- [ ] CI → merge → LAB `nvrOnline=True`.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-dahua-time-parseexact-ps5-hotfix.md`.

## 2026-09-19 — Ώρα Europe/Athens + Dahua time parser — AWAITING LAB

- [x] Ρητή εμφάνιση Europe/Athens σε Παραγγελίες/OCR και Platform Audit χωρίς μόνιμο +3.
- [x] Dahua current-time parser διαβάζει το επιβεβαιωμένο `result=YYYY-MM-DD HH:mm:ss`.
- [ ] CI → merge → LAB επιβεβαίωση ώρας → connector ONLINE.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-athens-time-and-dahua-time-fix.md`.

## 2026-09-19 — Video heartbeat degraded-state hotfix — AWAITING LAB

- [x] Root cause HTTP 400: NVR_TIME_UNAVAILABLE left NVR state null and optional heartbeat fields were dereferenced/sent incorrectly.
- [x] Heartbeat now remains valid with process online / NVR health unavailable and logs safe backend response detail.
- [ ] CI → merge → LAB -Once → connector presence → Dahua time fix → ONLINE.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-video-heartbeat-degraded-hotfix.md`.

## 2026-09-19 — Video Connector PowerShell parser hotfix — AWAITING LAB

- [x] LAB αποκάλυψε parser corruption στο VideoConnector.ps1, όχι πρόβλημα Dahua/network/pairing.
- [x] Ανακατασκευάστηκε το Dahua CLIP/mediaFileFind block και αφαιρέθηκε duplicated corrupted tail.
- [ ] CI → merge → αντικατάσταση script στο LAB → ONLINE → πραγματικό video test.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-video-connector-parser-hotfix-awaiting-lab.md`.

## 2026-09-19 — Backoffice Κάμερες / Video Audit — AWAITING LAB

- [x] Προστέθηκε διαχείριση Video Audit στο Backoffice ανά κατάστημα, αντί να εξαρτάται η καθημερινή χρήση από το Platform Admin.
- [x] Owner/Admin + VIDEO_EVENTS gate, connector status, camera mapping και one-time pairing code 15 λεπτών.
- [x] Τα NVR credentials δεν εμφανίζονται στο Backoffice.
- [ ] CI / merge / deploy / LAB connector pairing και πραγματικό video test.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-backoffice-video-audit-manager-awaiting-lab.md`.

## 2026-09-19 — Video Audit ιστορικού on-demand — AWAITING LAB

- [x] Παλιές Audit εγγραφές μπορούν να δημιουργούν Video Event on-demand όταν πατηθεί «Προβολή βίντεο», χωρίς να απαιτείται προϋπάρχουσα video εγγραφή από την ημέρα του συμβάντος.
- [x] Υποστηρίζονται StoreTransaction, PosSaleActionAudit και StoreOperatorAudit με store/POS/camera mapping και NVR time offset.
- [x] Παράθυρο clip 30″ πριν / 60″ μετά και έλεγχος configured NVR retention.
- [ ] Απαιτούνται πράσινο CI, merge/deploy και LAB δοκιμή σε πραγματικό συμβάν 3–10 ημερών πριν γίνει ΟΚ.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-video-audit-on-demand-history-awaiting-lab.md`.

## 2026-09-19 — KAT-10 πραγματικό Dahua media search — AWAITING LAB

- [x] Πραγματικό LAN/API test στο `DHI-NVR2108HS-4KS3` με `DH-IPC-T1E20-A`: RTSP 554, live video, playback, CGI Digest authentication και timestamp media search PASS.
- [x] Η πραγματική `mediaFileFind` αναζήτηση για 20:00:30–20:02:30 επέστρεψε `OK`, `found=2` και Main/Extra1 recording 20:00–21:00.
- [x] Ο Windows Video Connector επαληθεύει πλέον recording στο ζητημένο channel/time πριν από το υπάρχον bounded clip download και αποτυγχάνει κλειστά όταν δεν υπάρχει recording.
- [x] Δεν αλλάζουν POS, πληρωμές, invoice OCR, stock, drafts, fiscal/accounting/myDATA, credentials policy ή outbound-only δικτύωση.
- [ ] PR #969: απαιτούνται πράσινο CI, merge/deploy και πραγματικό end-to-end Audit clip 30″ πριν / 60″ μετά πριν γίνει KAT-10 ΟΚ.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-kat10-dahua-real-connector-awaiting-lab.md`.

## 2026-09-19 — Fresh Snack unverified trailing replay — AWAITING DEPLOY

- [x] Fresh POS-front diagnostic `36-ΤΔΑ 005401` proves the receipt itself was read once correctly: its first five provisional rows reconcile exactly to printed `53.87 EUR`. Four later unverified replay rows inflated the draft to `92.28 EUR`, and the existing safety gate correctly blocked it before approval, stock, fiscal, accounting or payment mutation.
- [x] For a profiled supplier, drop only a trailing unverified replay when the preceding current-image rows already reconcile exactly and each discarded description repeats an earlier row. Any non-identical or non-reconciling tail remains blocked.
- [x] Focused regression suite `78/78` PASS locally. Green CI, merge, exact deploy and operator check of the existing safe draft remain required; no new Fresh invoice is needed for this diagnostic fix.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-fresh-snack-unverified-tail-replay.md`.

## 2026-09-19 — Fresh Delicacies complete printed-table safety rule — AWAITING LAB

- [x] **LAB FAIL retained for diagnostic invoice `BB 6439`**: the actual receipt has `12` rows / `51.20 EUR` net / `6.66 EUR` VAT / `57.86 EUR` gross. The provisional 14-row OCR result contained a malformed `4,201.00 EUR` line and two duplicates (`4,810.44 EUR` gross), so the POS correctly kept it `POS_FAILED` / visibly reviewable. No approval, stock, fiscal, accounting or payment mutation occurred.
- [x] Added a versioned central Learning profile for the Fresh Delicacies legal supplier name. It stores no historic item quantities, prices, discounts or totals.
- [x] On a current-image mismatch the profile now invokes the existing complete printed-table verifier, which must reproduce every physical row, row arithmetic, VAT footer and final total before it can replace the draft; a failure preserves the same draft unchanged.
- [x] Corrected the MANTZILAS verifier's undefined reconciliation condition to use the existing defined gate.
- [x] Focused regression suite `77/77` PASS locally. Green CI, merge, exact deployment and a future fresh one-submit Fresh Delicacies POS invoice remain required; diagnostic `BB 6439` is not an acceptance retry.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-fresh-delicacies-complete-printed-table-rule.md`.

## 2026-09-19 — Fresh Snack complete printed-table safety rule — AWAITING LAB

- [x] **LAB FAIL retained for diagnostic invoice `21-ΤΛΑ 006019`**: the one POS-front submission created one unapproved draft, but the first extraction totalled `68.12 EUR` against the confirmed `99.99 EUR`. It stayed visibly `ΧΡΕΙΑΖΕΤΑΙ ΕΛΕΓΧΟ` / `POS_FAILED`; no false success, approval, stock, fiscal, accounting or payment mutation occurred.
- [x] Added a versioned central supplier profile only for `FRESH SNACK AE` / ΑΦΜ `099162880`. It stores no historical item quantities, prices, discounts or invoice totals.
- [x] When this supplier's current-image rows disagree with the POS-confirmed total, the background flow now requires one complete visual reread of every physical row, row economics, VAT footer and total before replacing the same draft. An incomplete/mismatched reread preserves the existing draft unchanged for review.
- [x] Focused regression suite `76/76` PASS locally. CI, merge, exact deployment and one future fresh POS-front invoice remain required; do not re-upload the diagnostic invoice.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-fresh-snack-complete-printed-table-rule.md`.

## 2026-09-19 — KAT-10 πραγματικός Dahua connector — AWAITING LAB

- [x] **LAB NOT TESTED / AWAITING LAB**: ολοκληρώθηκε η ασφαλής βάση πραγματικής σύνδεσης Dahua/ONVIF, αλλά δεν έχει ακόμη δοκιμαστεί με το φυσικό `DHI-NVR2104-4KS3` και την `DH-IPC-T1E20-A` στο ίδιο LAN με το POS.
- [x] Προστέθηκε outbound-only Windows connector με τοπικό ONVIF/WS-Discovery, Dahua CGI health/time/snapshot/clip, αυτόματη επανασύνδεση και προστασία token/διαπιστευτηρίων με Windows DPAPI LocalMachine. Δεν απαιτείται και δεν επιτρέπεται port forwarding.
- [x] Το συνεχόμενο video παραμένει στο NVR. Snapshot, live preview και Audit clip ζητούνται μόνο κατ' απαίτηση και περνούν από authenticated browser-safe proxy χωρίς άμεσο RTSP στον browser.
- [x] Η υπάρχουσα αντιστοίχιση store/terminal/camera, τα Video Audit events, τα παράθυρα `30″ πριν / 60″ μετά`, τα permissions και το retention διατηρούνται· δεν αλλάχθηκαν POS, πληρωμές, invoice OCR, stock ή drafts.
- [x] Τοπική επαλήθευση: video tests `54/54` (τα υπάρχοντα `43/43` συν `11` νέα), πλήρες server suite `1331/1331`, client build, server build και `git diff --check`: PASS.
- [ ] Απαιτούνται πράσινο GitHub CI, merge και εγκατάσταση του connector στο πραγματικό POS/LAN. Το KAT-10 δεν γίνεται `ΟΚ` πριν επιβεβαιωθούν online status, αυτόματη ώρα `Europe/Athens`, snapshot/preview και πραγματικό clip του Audit από το LAB hardware.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-kat10-dahua-real-connector-awaiting-lab.md`.

## 2026-09-19 — Self-heal a stale POS_RECOVERING durable task

- [x] **LAB FAIL**: invoice `12674` has remained at `POS_QUEUED / POS_RECOVERING` since 17:00 with the preserved old `12`-row / `430.29 EUR` draft. A retry marker without a worker for hours is a stuck queue, not processing.
- [x] Root-cause boundary: the AI job and durable task can remain divergent after a retry. Startup preserved any existing `QUEUED` row, and the periodic dispatcher had no reconciliation step for a stale recovering job.
- [x] At startup, reset every eligible active POS task unless it owns a complete live `RUNNING` lease. During every dispatcher sweep, requeue a `POS_QUEUED / POS_RECOVERING` job older than three minutes when it has no live lease.
- [x] Preserve the existing attempt counter during the watchdog repair, the single worker/lease guards, original attachment, handoff, payment/credit identity, AI job and draft. No duplicate payment/credit/draft, approval, finalization, stock, fiscal, accounting or myDATA mutation.
- [x] Focused durable recovery regressions `53/53`, complete server suite `1311/1311`, production build, syntax and diff checks: PASS.
- [ ] Require green CI, merge and exact deploy. Existing `12674` recovery remains diagnostic; Phase 1 still requires a future new one-submit POS invoice for LAB PASS.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-phase1-stale-recovering-watchdog.md`.

## 2026-09-19 — Startup reread for the completed pre-deploy MANTZILAS draft

- [x] **LAB FAIL**: before the single-verifier revision reached production, invoice `12674` eventually completed after more than six minutes with `12` rows / `430.29 EUR` against printed gross `366.47 EUR` (difference `63.82 EUR`).
- [x] The job is now terminal `AWAITING_APPROVAL`, so ordinary durable startup recovery and stopped POS polling cannot apply the deployed verifier without a browser refresh or another submission.
- [x] Advance the one-attempt strategy to V13 and, at server startup, claim only a recent (`48 hours`), still-unapproved MANTZILAS POS OCR draft whose completed background result explicitly requires reconciliation. Reuse the same attachment, handoff, payment/credit identity, job and draft.
- [x] Queue the claimed draft through the durable worker with `replaceExistingDraft=true`; no new upload, browser refresh, duplicate payment/credit/draft, approval, finalization, stock, fiscal, accounting or myDATA mutation.
- [x] Focused startup/reread regressions `20/20`, complete server suite `1310/1310`, production build, syntax and diff checks: PASS.
- [ ] Require green CI, merge and exact deploy. Recovery of `12674` is diagnostic; Phase 1 remains AWAITING LAB for a future genuinely new one-submit invoice.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-phase1-startup-single-verifier-reread.md`.

## 2026-09-19 — Bound MANTZILAS POS OCR to one complete verifier

- [x] **LAB FAIL** on exact production `1b535650a4bd691b73d7d1480ba7919dc2ed97d1`: the durable worker now claims invoice `12674`, but after six minutes and an operator refresh it still shows `0 items / 0.00 EUR`, with `POS_PROCESSING / POS_BACKGROUND` updated again at `08:21`.
- [x] Root cause: after the central MANTZILAS Azure pass, the mismatch path could serially call a second table AI pass, repeat Azure field recovery, and finally call the complete printed-table/discount verifier. Their independent timeouts exceeded the background request budget and durable retries amplified the delay.
- [x] For the exact central MANTZILAS path, keep the initial Azure table and run only the existing complete printed-table verifier. That verifier already rereads every physical row, can rebuild omitted rows, validates full row arithmetic/discounts and requires the VAT footer plus exact invoice total.
- [x] Other suppliers retain their existing table and Azure recovery paths. Reuse the same attachment, credit/payment identity, AI job and draft; no duplicate payment/credit/draft, approval, finalization, stock, fiscal, accounting or myDATA mutation.
- [x] Focused single-verifier regressions `50/50`, complete server suite `1309/1309`, production build and diff che…32585 tokens truncated… rows / `430.29 EUR` against printed `366.47 EUR`; the latest candidate was safely rejected at `12` rows / `10.15 EUR` difference.
- [x] Acceptance rule: one genuinely new POS submission must create the correct single BackOffice draft automatically. Refresh, reopening, polling, startup reread and a second upload are diagnostic only and can never be reported as LAB PASS.
- [x] Root cause: the one complete visual verifier knew the expected total in server code but its prompt omitted the expected total, current guide total and exact gap, so it could return individually balanced yet incomplete rows.
- [x] Keep one provider call and give it the independent reconciliation anchor; require physical-row count, gross agreement within `0.05 EUR` and VAT-footer agreement before response. Server-side exact-total rejection remains authoritative.
- [x] Preserve the original attachment, settlement, job and draft identities; no duplicate payment/credit/draft, approval, finalization, stock, fiscal, accounting or myDATA mutation.
- [x] Focused POS/MANTZILAS tests `90/90`, complete server suite `1311/1311`, production build, syntax and diff checks: PASS.
- [ ] Require green CI, merge and exact deployment. LAB PASS still requires a future new one-submit POS-front invoice without any refresh.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-18-pos-first-pass-no-refresh.md`.

## 2026-09-18 — Preserve the POS-confirmed supplier during full OCR

- [x] LAB FAIL on invoice `12674`: POS confirmed MANTZILAS, but the full OCR result could omit or garble the supplier header and bypass the supplier-specific complete-table verifier.
- [x] Reload the trusted active tenant supplier from the durable POS handoff and reapply its name/VAT before supplier profiling, reconciliation and fail-closed verification.
- [x] Preserve the existing attachment, settlement, AI job and unapproved draft; no duplicate payment/credit/draft, approval, finalization, stock, fiscal, accounting or myDATA mutation.
- [x] Focused regression, complete server suite `1312/1312` and production build: PASS locally.
- [ ] Require green CI, squash merge and exact Render revision. LAB PASS still requires one future new POS-front submission without refresh or second upload.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-18-pos-confirmed-supplier-full-ocr.md`.
## 2026-09-19 — Invoice 12729 verified-row persistence and packaging restore

- [x] **LAB FAIL** from one POS-front credit submission of invoice `12729`: one automatic 10-line draft reached `AWAITING_APPROVAL / POS_BACKGROUND_COMPLETE`, but displayed `200.09 EUR` instead of `200.08 EUR`, lost printed discounts/excise and exposed package quantities as `1 / 2 / 3` stock pieces.
- [x] Root cause: the complete MANTZILAS verifier emitted safe `AI_PRINTED_ROW_FULL_MATH_VERIFIED` rows, while `verifiedPrintedTableForPersistence` accepted only `AI_COMPLETE_PRINTED_TABLE_VERIFIED`. The worker therefore sent the verified rows through the older lossy finalizer a second time.
- [x] Preserve every complete, source-column-verified row for the bounded safe marker set; retain current-image price, discount, excise, VAT and package metadata. Unverified or materially mismatched tables remain fail-closed.
- [x] Reconcile only a cent-level gross rounding residual (maximum `0.05 EUR`) on one final line so invoice `12729` persists exact `164.66 + 35.42 = 200.08 EUR` without changing net values or discounts.
- [x] Advance the one-attempt strategy to V14 and automatically reread only a recent unapproved MANTZILAS POS draft with a completed mismatch or demonstrably lost `4PACK / 6PACK / KIB` multiplier. Reuse the same attachment, handoff, credit identity, job and draft.
- [x] Exact `12729` fixture expects stock quantities `20, 1, 24, 24, 24, 24, 12, 48, 8, 12`, discounts `22, 0, 17, 17, 17, 17, 0, 0, 31, 0`, ten physical rows and exact totals.
- [x] Focused invoice/POS regressions `49/49`: PASS.
- [x] Exact regressions and focused invoice/POS tests `49/49`, complete server suite `1316/1316`, production client/server/Prisma build and diff checks: PASS.
- [ ] Require green CI, merge, exact deploy and automatic same-draft reread verification. No second upload, BackOffice manual save, approval, finalization, payment, stock, fiscal, accounting or myDATA mutation.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-invoice-12729-verified-row-persistence.md`.

## 2026-09-19 — Invoice 12729 V15 printed-economics persistence

- [x] **LAB FAIL** evidence: the V14 same-draft reread still reached the legacy finalizer after a printed-column reconstruction did not expose a persistence-safe source marker. The screen retained `1 / 2 / 3` package quantities and lost discounts/excise.
- [x] Mark only four-equation reconstructed printed rows as `MANTZILAS_PRINTED_ECONOMICS_VERIFIED` and admit them only with source-column verification plus the independent invoice-total gate.
- [x] A same-draft replacement is now fail-closed: it cannot use the legacy finalizer. Unsafe rereads preserve the existing draft instead of writing incorrect values.
- [x] Advance automatic same-attachment recovery to V15; no second upload, approval, finalization, payment, inventory, fiscal, accounting or myDATA mutation.
- [x] Focused invoice/POS regressions `50/50`, complete server suite `1317/1317`, production client/server/Prisma build and diff checks: PASS.
- [ ] Require green CI, merge, exact deploy and automatic same-draft reread verification.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-invoice-12729-v15-printed-economics-persistence.md`.

## 2026-09-19 — Νέο κριτήριο αποδοχής POS Invoice OCR

- [x] **Απόφαση ιδιοκτήτη:** το LAB PASS δεν απαιτεί πλέον 100% άψογη αυτόματη ανάγνωση κάθε γραμμής, έκπτωσης, ΦΠΑ ή συσκευασίας σε κάθε τιμολόγιο.
- [x] Νέο LAB PASS: μία υποβολή από το POS δημιουργεί αυτόματα ένα και μόνο ασφαλές πρόχειρο, χωρίς διπλή πληρωμή/πίστωση, οριστικοποίηση, κίνηση αποθήκης, φορολογική, λογιστική ή myDATA ενέργεια. Επιτρέπονται έως **2 λανθασμένες ή αβέβαιες γραμμές ανά τιμολόγιο**, εφόσον επισημαίνονται ως **ΠΡΟΣ ΕΛΕΓΧΟ**.
- [x] Κάθε γραμμή χαμηλής σιγουριάς ή χωρίς επαρκή αριθμητική/μονάδα/συσκευασία επιβεβαίωση πρέπει να επισημαίνεται οπτικά ως **ΠΡΟΣ ΕΛΕΓΧΟ** στο BackOffice. Ο χειριστής διορθώνει μόνο αυτές τις γραμμές πριν από ρητή έγκριση.
- [x] Οι χειροκίνητες διορθώσεις χρησιμοποιούν το υπάρχον Invoice Learning και αποθηκεύονται ως κανόνες ανά προμηθευτή, ώστε επόμενο τιμολόγιο του ίδιου προμηθευτή να βελτιώνεται χωρίς να επηρεάζονται άλλοι.
- [x] Σταματούν οι ατέρμονοι στοχευμένοι κύκλοι στα παλιά `12674`, `12729`, `2612188`, `43243`. Τα υπάρχοντα drafts παραμένουν μη οριστικοποιημένα και μπορούν μόνο να χρησιμεύσουν ως αναφορά/ασφαλές regression evidence.
- [x] Η σήμανση **ΠΡΟΣ ΕΛΕΓΧΟ** πλέον αποθηκεύεται μαζί με αιτία για χαμηλή σιγουριά, μη έγκυρη αριθμητική ποσότητα/τιμή ή αβέβαιη συσκευασία και μένει ορατή στο BackOffice ακόμη κι όταν η γραμμή έχει αντιστοιχιστεί με προϊόν.
- [x] Η κανονική αποθήκευση χειροκίνητης διόρθωσης καθαρίζει τη σήμανση μόνο μετά από ρητή ενέργεια χειριστή και διατηρεί το υπάρχον supplier-scoped Invoice Learning/audit.
- [ ] Απαιτούνται unit/full-suite/build/CI/deploy και νέο καθαρό POS τιμολόγιο διαφορετικού προμηθευτή. Μόνο τότε μπορεί να κριθεί LAB PASS με το νέο όριο έως 2 γραμμών.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-pos-invoice-review-acceptance.md`.
## 2026-09-19 — Guard against swapped adjacent OCR rows

- [x] **LAB FAIL** on the fresh POS invoice `445` from supplier `ΚΑΡΑΓΕΩΡΓΙΟΥ Κ ΑΦΟΙ ΑΕΒΕ`: codes `0003012` and `0003013` received the neighbouring quantities (`4` versus printed `6`, and `6` versus printed `4`). The document total reconciled, but that does not prove row correctness.
- [x] New generic acceptance guard: an OCR line is confirmed only when its stored raw physical row independently supports its code, quantity and meaningful description words. A mismatch is persisted as `NEEDS_REVIEW` with the visible reason `Τα στοιχεία δεν επιβεβαιώνονται από την ίδια φυσική σειρά OCR`.
- [x] Carry `sourceColumnsVerified` across OCR finalization, the POS API schema and background handoff; it may no longer be silently discarded before draft persistence.
- [x] No supplier-specific rule or retroactive alteration of invoice `445`; it remains an unapproved diagnostic draft. No payment, stock, fiscal, accounting or myDATA mutation.
- [ ] Require focused/full tests, green CI, merge, exact deploy and one fresh one-submit POS test before declaring the guard or LAB PASS.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-pos-raw-row-review-guard.md`.

## 2026-09-19 — Safe same-draft replay verification (Fresh Snack)

- [x] The existing failed draft `36-ΤΔΑ 005401` must be tested from its stored image; it must not be deleted or submitted again.
- [x] On startup, a recent `POS_FAILED` draft is requeued exactly once only when a complete-table supplier profile records the specific pre-fix trailing-replay verification failure.
- [x] Legacy failed jobs that predate persistence of the profile may use only the linked draft's authoritative `FRESH SNACK` supplier name, together with the same exact failure text; no other supplier is eligible by name.
- [x] The diagnostic recovery endpoint resolves that authoritative supplier from the linked draft after rebuilding a lost durable handoff, so this historic draft can be retried without a new upload.
- [x] The recovery reuses the same job, attachment, credit/draft identity and replaces lines only if the new read is fully verified. It never approves, creates payment, moves stock or finalizes the document.
- [ ] Await CI, deployment and actual result: five physical rows, `47.67 EUR` net, `6.20 EUR` VAT, `53.87 EUR` gross.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-fresh-snack-safe-replay-verification.md`.
## 2026-09-19 — Λεβεντόπουλος ΠΟΣ1 και αποφυγή διπλών γραμμών — AWAITING LAB

- [x] Για τον προμηθευτή ΑΦΜ `800503361` (Λεβεντόπουλος), η ποσότητα και η τιμή διαβάζονται από `ΠΟΣ1` και `ΤΙΜΗ` του Azure πίνακα· όταν δεν επιστρέφεται πίνακας, εφαρμόζεται μόνο η μοναδική ισοσκελισμένη ακολουθία `ΜΜ | ΠΟΣ1 | ΠΟΣ2 | ΤΙΜΗ | ΕΚΠ% | Κ. ΑΞΙΑ | ΦΠΑ` της ίδιας γραμμής.
- [x] Αριθμός από περιγραφή προϊόντος δεν μπορεί να γίνει `ΠΟΣ1`, ενώ item με σπασμένο κωδικό που εκπροσωπείται ήδη από γραμμή πίνακα απορρίπτεται αντί να προστεθεί δεύτερη φορά.
- [x] Δεν αλλάζει υπάρχον draft, πληρωμή, πίστωση, απόθεμα, οριστικοποίηση, fiscal, accounting ή myDATA.
- [ ] Απαιτούνται πράσινο CI, merge/deploy και ένα νέο LAB τιμολόγιο Λεβεντόπουλου για επιβεβαίωση των ποσοτήτων `ΠΟΣ1`.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-19-leventopoulos-mm-pos1-safe-quantity.md`.
## 2026-09-20 — Λεβεντόπουλος complete table fail-closed — AWAITING CI / LAB

- [x] LAB evidence showed `ΤΔΛΠΧ14 15` was corrupted by a free-form numeric column scan: 17 candidate rows / `428,18 €` instead of the printed 9 rows / `194,77 €`.
- [x] The supplier rule now treats `ΠΟΣ1` as quantity only through a verified printed table; `ΜΜ` and `ΠΟΣ2` cannot become quantity by numeric guessing.
- [x] An incomplete reread preserves the same draft unchanged; no payment, credit, stock, finalization, fiscal/accounting or myDATA mutation.
- [ ] Green CI → merge → deploy → recheck the same attachment. A correct candidate must be exactly 9 rows and `194,77 €` before any draft replacement is allowed.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-leventopoulos-complete-table-fail-closed.md`.

## 2026-09-20 — Λεβεντόπουλος existing failed draft recovery — PR #992 / AWAITING CI

- [x] Πραγματική αιτία: το `ΤΔΛΠΧ14 15` παρέμενε `POS_FAILED`, το χειροκίνητο AI reread ήταν disabled και το automatic complete-table recovery δεν περιλάμβανε τον Λεβεντόπουλο.
- [x] Προστέθηκε supplier-specific one-time recovery του ίδιου job/image/draft με strategy `LEVENTOPOULOS_EMPTY_COMPLETE_TABLE_V17` και `replaceExistingDraft=true`.
- [x] Η αντικατάσταση παραμένει fail-closed: απαιτούνται 9 επαληθευμένες γραμμές, footer ΦΠΑ και τελικό σύνολο `194,77 €`. Διαφορετικά το υπάρχον draft δεν αλλάζει.
- [x] 62/62 targeted tests PASS. Καμία διαγραφή, νέα πληρωμή/πίστωση, αποθήκη, οριστικοποίηση, fiscal/accounting ή myDATA ενέργεια.
- [ ] Πράσινο CI → merge/deploy → έλεγχος του ίδιου `ΤΔΛΠΧ14 15` χωρίς νέο upload.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-leventopoulos-existing-failed-reread.md`.

## 2026-09-20 — Λεβεντόπουλος empty OCR complete-table recovery — AWAITING CI / LAB

- [x] The existing diagnostic draft `ΤΔΛΠΧ14 15` returned zero product rows after the fail-closed gate. The background reader now invokes the full image table verifier even when its first OCR pass is empty.
- [x] It may reconstruct rows only when every physical row, the VAT footer and the operator-confirmed `194,77 €` total independently agree; otherwise the existing draft remains unchanged.
- [ ] Require green CI, merge/deploy and a reread of the same stored attachment. Expected result: exactly 9 rows / `194,77 €`, before any replacement is permitted.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-leventopoulos-complete-table-fail-closed.md`.

## 2026-09-20 — Invoice Learning ενιαίοι κανόνες προμηθευτή — PHASE 1 TESTED / AWAITING LAB

- [x] Αποφασίστηκε ότι δεν δημιουργείται δεύτερος invoice reader: ενισχύεται η υπάρχουσα ροή `POS → Τέλος τιμολογίου → ένα Πρόχειρο BackOffice`.
- [x] Ορίστηκε versioned κεντρικός κανόνας ανά προμηθευτή για στήλες, σελίδες, barcodes/Master Catalog, μονάδες, συσκευασίες, πιστωτικά και ειδικές γραμμές.
- [x] Απαγορεύτηκε η εκμάθηση ιστορικών ποσοτήτων, τιμών, εκπτώσεων και συνόλων ως μελλοντικών σταθερών.
- [x] Ορίστηκε ανεξάρτητη επαλήθευση κάθε νέου παραστατικού και fail-closed `Χρειάζεται έλεγχο` σε κάθε ασυμφωνία.
- [x] Το `Επιβεβαίωση & Εκμάθηση` δημοσιεύει VERIFIED full-table contract· ο POS verifier χρησιμοποιεί το κεντρικό profile flag για κάθε προμηθευτή αντί hard-coded allow-list.
- [x] Learned mappings δεν αποθηκεύουν τιμή/ποσότητα/έκπτωση παλιού τιμολογίου. `41/41` targeted και `1351/1351` full server tests PASS· client/server builds PASS.
- [ ] Offline contract των 33 ενεργών δειγμάτων → CI → LAB νέου απλού/πολυσέλιδου/μετατροπής/πιστωτικού.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-invoice-learning-unified-supplier-rules-plan.md`.

## 2026-09-20 — Invoice Learning Azure footer VAT reconciliation — AWAITING CI / LAB

- [x] LAB evidence: το Azure/OpenAI αποτέλεσμα είχε καθαρές γραμμές `47,48 €`
  και τελικό `53,91 €`, αλλά απορριπτόταν επειδή έλειπε ΦΠΑ ανά γραμμή.
- [x] Νέος fail-closed έλεγχος δέχεται πρόχειρο μόνο όταν το άθροισμα καθαρών
  γραμμών συμφωνεί με την καθαρή αξία footer και `καθαρή + ΦΠΑ = τελικό`.
- [x] Ελλιπής πίνακας εξακολουθεί να απορρίπτεται· δεν επινοείται ΦΠΑ προϊόντος
  και παραμένει απαίτηση ελέγχου γραμμών.
- [x] `9/9` targeted και `1353/1353` full server tests PASS.
- [ ] Green CI → merge/deploy → νέο upload του ίδιου δείγματος στο LAB.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-invoice-learning-unified-supplier-rules-plan.md`.

## 2026-09-20 — Invoice Learning κρατά Azure όταν λείπει μόνο SubTotal — AWAITING CI / LAB

- [x] LAB evidence: το Azure αποτέλεσμα `47,48 €` απορριπτόταν επειδή η φόρμα
  επέστρεφε `TotalTax`/`InvoiceTotal` αλλά όχι `SubTotal`, και το OpenAI-only
  fallback έβρισκε μόνο `30,24 € από 53,91 €`.
- [x] Νέα αυστηρή συμφωνία: `InvoiceTotal - TotalTax = άθροισμα καθαρών
  γραμμών`, μόνο όταν λείπει line-level ΦΠΑ και με ανοχή `0,05 €`.
- [x] Ελλιπείς γραμμές ή υπάρχων line-level ΦΠΑ δεν περνούν από αυτόν τον
  δρόμο. Δεν αλλάζουν stock, πληρωμή, οριστικοποίηση ή λογιστική.
- [x] `11/11` targeted και `1355/1355` full server tests PASS.
- [ ] Green CI → merge/deploy → ίδιο upload στο Invoice Learning LAB.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-invoice-learning-unified-supplier-rules-plan.md`.

## 2026-09-20 — Invoice Learning Azure retry / no AI-only result — AWAITING CI / LAB

- [x] LAB evidence: `Azure: REQUEST_FAILED` ακολουθήθηκε από μερικό AI-only
  αποτέλεσμα `40,90 € από 53,91 €`.
- [x] Προσωρινά Azure failures επαναλαμβάνονται έως 3 φορές· μόνιμα failures
  δεν μπαίνουν σε άσκοπο retry.
- [x] Μετά από τεχνική αποτυχία Azure η ανάγνωση σταματά ρητά και δεν
  παρουσιάζεται OpenAI-only αποτέλεσμα ως κανονική ανάγνωση.
- [x] `11/11` targeted και `1357/1357` full server tests PASS.
- [x] Green CI → merge/deploy `b3e1b69b67a3c9c198fc904ea20784750e1086b0` → ίδιο upload στο Invoice Learning LAB.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-invoice-learning-unified-supplier-rules-plan.md`.

## 2026-09-20 — Invoice Learning Azure safe diagnostics — AWAITING CI / LAB

- [x] Το retry gate λειτουργεί: το LAB δεν παρουσίασε ξανά το ελλιπές
  OpenAI-only αποτέλεσμα μετά από Azure request failure.
- [x] Προστέθηκε ασφαλής διαγνωστικός κωδικός για auth/access/endpoint/model,
  rate limit, network, timeout και Azure 5xx, χωρίς έκθεση μυστικών.
- [x] Το Azure polling timeout επαναλαμβάνεται πλέον έως 3 φορές.
- [x] `3/3` targeted και `1358/1358` full server tests PASS.
- [ ] Green CI → merge/deploy → ίδιο upload και καταγραφή του ακριβούς
  διαγνωστικού κωδικού.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-invoice-learning-unified-supplier-rules-plan.md`.
## 2026-09-20 — Invoice Learning Azure + OpenAI complementary-row recovery — AWAITING CI / LAB

- [x] Υποδομή LAB: σωστό endpoint, νέο Azure key και API-key authentication Enabled· το `ACCESS_403` εξαφανίστηκε.
- [x] Νεότερο πραγματικό LAB αποτέλεσμα: Azure απάντησε, αλλά η συνολική ανάγνωση έμεινε ασφαλώς μπλοκαρισμένη ως `NO_SAFE_RESULT` με `35,72 € από 53,91 €`.
- [x] Azure και OpenAI γραμμές συγχωνεύονται ως multiset, ώστε πραγματικές επαναλαμβανόμενες γραμμές να μη χάνονται.
- [x] Το υβριδικό αποτέλεσμα επιστρέφεται μόνο αν ο υπάρχων ανεξάρτητος footer έλεγχος συμφωνήσει πλήρως· διαφορετικά παραμένει μπλοκαρισμένο.
- [x] Καμία πληρωμή, stock, έγκριση, οριστικοποίηση, fiscal/accounting ή myDATA μεταβολή.
- [x] `14/14` targeted και `1360/1360` full server tests PASS τοπικά.
- [ ] Green CI → merge/deploy → ίδιο upload στο Invoice Learning LAB.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-invoice-learning-hybrid-row-recovery.md`.

## 2026-09-20 — Invoice Learning → POS verified handoff — AWAITING CI / POS

- [x] Πραγματικό Invoice Learning αποτέλεσμα: DELTA `28897`, 11 γραμμές,
  `53,92 €` έναντι τυπωμένου `53,91 €` (αποδεκτή απόκλιση `0,01 €`).
- [x] Η αιτία του `POS_BACKGROUND_AI_RECHECK` εντοπίστηκε: οι συμφωνημένες
  γραμμές δεν περνούσαν από τον current-image verifier όταν δεν υπήρχε διαφορά
  συνόλου, ενώ ο τελικός ασφαλής έλεγχος απαιτούσε τη σφραγίδα του.
- [x] Κάθε μη επαληθευμένη γραμμή προφίλ Learning οδηγείται πλέον σε πλήρη
  οπτικό και αριθμητικό έλεγχο της τρέχουσας εικόνας πριν γεμίσει το υπάρχον
  πρόχειρο POS.
- [x] Δεν αλλάζει πληρωμή, stock, fiscal, λογιστική, myDATA, έγκριση ή
  οριστικοποίηση. Αποτυχία επαλήθευσης αφήνει το πρόχειρο ανέπαφο.
- [x] `73/73` targeted και `1367/1367` full server tests PASS τοπικά.
- [ ] Green CI → merge/deploy → μία ασφαλής επανάληψη του `28897` από POS.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-invoice-learning-pos-verified-handoff.md`.

## 2026-09-21 — Exact Learning bypasses generic OCR mutation — READY FOR CI

- [x] **Fresh POS FAIL (12:26):** the post-deploy attempt still ended as
  `POS_FAILED / POS_BACKGROUND_FAILED` with zero lines.
- [x] The exact learned rows were being passed again through generic OCR/profile
  recovery, allowing their `sourceColumnsVerified` proof to be lost.
- [x] Exact central Learning now ends AI recheck directly as `AI_COMPLETE` after
  exact supplier/invoice identity, confirmed row arithmetic and gross-total
  reconciliation. No second OCR/profile mutation is allowed.
- [x] Targeted `7/7` and full server suite `1382/1382` PASS.
- [ ] Push → PR → green CI → merge → exact Render deploy.
- [ ] Delete the empty diagnostic draft and submit `28897` once after deploy.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-invoice-learning-pos-verified-handoff.md`.
## 2026-09-20 — DELTA 28897 POS economics + durable Learning draft — AWAITING CI / LAB

- [x] **LAB FAIL:** the first POS draft showed printed quantities multiplied by 1000 (`2 → 2000`, `1 → 1000`), discounts as `99,9` instead of `10/15`, and VAT `0` instead of `13`, despite gross `53,91 €`.
- [x] Plain `ΤΜΧ/TEM` rows no longer interpret `1LT/450ML` capacity metadata as stock-piece multipliers; package/weight conversion still requires an explicit verified rule.
- [x] A claimed complete printed table is revalidated immediately before persistence. Corrupted quantity/discount/VAT arithmetic now fails closed and cannot fall back to the lossy legacy finalizer.
- [x] Exact regression fixture preserves the 11 printed quantities, discounts `10%/15%`, VAT `13%`, and gross `53,91 €`.
- [x] **LAB FAIL:** «Αποθήκευση Προχείρου» gave no durable/visible confirmation. It now awaits the central workspace `PUT`, disables during save, and displays explicit success or failure.
- [x] No approval, finalization, payment, stock, fiscal, accounting or myDATA mutation.
- [ ] Green CI → merge → exact Render deploy.
- [ ] LAB: save a Learning draft and reload it; then delete the erroneous diagnostic POS draft and submit `28897` once from POS. Acceptance requires one draft with quantities `2,1,3,6,3,3,3,2,4,3,1`, discounts `10%` for rows 1–9 / `15%` for rows 10–11, VAT `13%`, and total `53,91 €` (cent rounding tolerance only).
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-delta-28897-pos-economics-and-draft-save.md`.

## 2026-09-21 — DELTA exact Learning at final persistence — TESTING

- [x] **Fresh POS FAIL:** after Learning success, the BackOffice draft still
  showed quantities `2000/1000/3000` and discount `99,9%`; do not finalize it.
- [x] Final `pos-intake` now revalidates the exact central Learning invoice
  after supplier validation and before product matching/database insertion.
- [x] Exact reuse remains fail-closed: same supplier, `28897`, `53,91 €`, all
  11 rows confirmed and every line equation balanced.
- [x] Targeted DELTA/Learning regression `9/9` PASS.
- [ ] Full suite → push → PR → green CI → merge → exact Render deploy.
- [ ] Delete this erroneous draft and retry once only after exact deployment.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-delta-28897-pos-economics-and-draft-save.md`.

## 2026-09-20 — DELTA 28897 fresh-run display repair — AWAITING CI / LAB

- [x] Η ώρα `10:49 μ.μ.` επιβεβαίωσε ότι η προβληματική εγγραφή ήταν νέα και όχι παλιό πρόχειρο.
- [x] Αφαιρέθηκε η εμπιστοσύνη σε raw OCR multiplier (`1LT → 1000`) για μονάδα `ΤΜΧ`.
- [x] Προστέθηκε ασφαλής αποκατάσταση `99,9 → 10/15` και `ΦΠΑ 0 → 13` μόνο όταν αποδεικνύεται από ποσότητα, αρχική τιμή, καθαρή και μικτή αξία.
- [x] Η υπάρχουσα νέα POS OCR παραγγελία διορθώνεται κατά το επόμενο άνοιγμα λεπτομερειών μετά το deploy.
- [x] `1373/1373` full server tests PASS.
- [ ] Green CI → merge → exact Render deploy → άνοιγμα της υπάρχουσας `28897` και οπτική επιβεβαίωση.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-delta-28897-pos-economics-and-draft-save.md`.

## 2026-09-21 — DELTA Learning exact POS handoff — READY FOR PUSH

- [x] **Fresh POS FAIL (09:27):** `28897` created a zero-line draft and ended as
  `POS_FAILED / POS_BACKGROUND_FAILED`, because the background reader ignored
  the already-confirmed Learning document and required another provider read.
- [x] «Επιβεβαίωση & Εκμάθηση» now confirms every non-rejected row and awaits
  the central workspace save; it cannot display a false central-save success.
- [x] Before Azure/OpenAI, POS may reuse only a `LEARNED` document with the
  exact supplier, invoice number and gross total, all rows confirmed, and
  independently balanced quantity/price/discount/VAT arithmetic.
- [x] Exact `28897` regression preserves 11 rows, quantities
  `2,1,3,6,3,3,3,2,4,3,1`, discounts `10%/15%`, VAT `13%`, and total within
  the existing `0,05 €` safety tolerance.
- [x] Client production build PASS; full server suite `1377/1377` PASS.
- [ ] User approval → push → PR → green CI → merge → exact Render deploy.
- [ ] LAB: reopen Learning `28897`, press «Επιβεβαίωση & Εκμάθηση» once, then
  delete the zero-line diagnostic draft and submit the invoice once from POS.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-delta-28897-pos-economics-and-draft-save.md`.

## 2026-09-21 — Central Learning restore before OCR — READY FOR PUSH

- [x] **LIVE evidence:** a new Learning upload remained safely blocked as
  `NO_SAFE_RESULT` (`55,25 €` versus printed `53,91 €`). No partial draft was
  created.
- [x] Root cause: the Lab rendered from the local cache while the central
  workspace restore was still running, so the saved `28897` was not available
  for continuation and the user was forced into another provider read.
- [x] The Lab now awaits central restore before rendering and no longer has a
  competing static bootstrap.
- [x] Every restored invoice exposes «Συνέχιση / Επιβεβαίωση», loading its
  saved rows into the editable review without Azure/OpenAI.
- [x] Targeted `8/8`, full server `1379/1379`, client production build PASS.
- [ ] Green CI → merge → exact Render deploy → refresh Learning and continue
  saved `28897` without uploading the image again.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-delta-28897-pos-economics-and-draft-save.md`.

## 2026-09-21 — DELTA stale Learning header total — READY FOR CI

- [x] **Fresh POS FAIL (11:53):** `28897` remained a zero-line draft and ended
  as `POS_FAILED / POS_BACKGROUND_FAILED` after a successful Learning save.
- [x] Root cause: Learning retained stale OCR header total `55,25 €`, while its
  11 confirmed rows reconcile to the trusted POS/printed total `53,91 €`.
- [x] Exact replay no longer trusts that stale header. It still requires exact
  supplier + invoice number, all rows confirmed, balanced line arithmetic and
  complete learned gross within `0,05 €` of the POS total.
- [x] Targeted exact-Learning regression `6/6` and full server suite
  `1381/1381` PASS, including real quantities and discounts with stale header
  `55,25 €`.
- [ ] Push → PR → green CI → merge → exact Render deploy.
- [ ] Delete the empty diagnostic draft and submit `28897` once after deploy.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-20-invoice-learning-pos-verified-handoff.md`.
## 2026-09-21 — Invoice Learning: supplier identity vs commercial format — AWAITING CI / LAB

- [x] Νομικός εκδότης παραμένει δεμένος με επωνυμία και ΑΦΜ.
- [x] Προστέθηκαν ξεχωριστά εμπορική οικογένεια τιμολογίου και διανομέας/περιοχή.
- [x] Η οικογένεια χρησιμοποιείται μόνο για διάταξη/στήλες· δεν αντιγράφονται ποσότητες, τιμές ή εκπτώσεις.
- [x] Νέο migration και UI εκμάθησης για επιβεβαίωση του νέου ΑΦΜ ΜΑΝΤΖΑΒΑΣ με μορφή ΔΕΛΤΑ.
- [ ] Πράσινο CI → merge → deploy → δοκιμή νέου τιμολογίου ΜΑΝΤΖΑΒΑΣ.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-21-invoice-learning-supplier-commercial-family.md`.
## 2026-09-21 — Invoice Learning supervised partial correction — AWAITING CI / LAB

- [x] Partial OCR/AI results now remain editable only inside Invoice Learning Lab.
- [x] Added «＋ Προσθήκη γραμμής» so missing printed rows can be entered manually.
- [x] POS/order intake remains fail-closed and cannot create a partial invoice/order.
- [x] Targeted invoice-learning tests and JavaScript syntax checks PASS.
- [ ] Green CI → merge → deploy → retest the same DELTA invoice.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-21-invoice-learning-supervised-partial-correction.md`.
## 2026-09-21 — Invoice Learning mathematical discount recovery — AWAITING CI / LAB

- [x] Recover a missing discount only when quantity × unit price × discount reconciles with the printed net value.
- [x] Example verified: `6 × 1,74 − 10% = 9,40 €`.
- [x] Do not invent missing product rows; keep them for supervised manual addition.
- [x] Targeted invoice-learning tests `17/17` PASS.
- [ ] Green CI → merge → deploy → retest the DELTA invoice.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-21-invoice-learning-discount-recovery.md`.

## 2026-09-21 — Invoice Learning document management and AFM lookup — AWAITING CI / LAB

- [x] Added user-controlled deletion for an individual learned invoice, with confirmation.
- [x] Deletion removes only the selected learning document; supplier profiles and DELTA format rules remain.
- [x] Added top-level official supplier-name lookup by 9-digit AFM through the existing VAT lookup path.
- [x] Local client build, JavaScript syntax checks and diff validation PASS.
- [ ] Green CI → merge → deploy → user deletes the duplicate MANTZAVAS 38001 record and verifies AFM lookup.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-21-invoice-learning-document-management.md`.

## 2026-09-21 — POS exact Learning replay with missing draft total — READY FOR CI

- [x] LAB evidence: MANTZAVAS `38001` remains `LEARNED`, but POS created a safe zero-line draft and rejected the background reread.
- [x] Exact replay now loads the matching learned invoice even when a failed POS retry lost the temporary header total.
- [x] The fallback uses only the same supplier + invoice number and the learned line arithmetic; it does not copy DELTA economics.
- [x] Targeted exact-handoff regression `8/8` PASS; syntax and diff checks PASS.
- [ ] Green CI → merge → deploy → retry the existing safe MANTZAVAS `38001` draft once.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-21-invoice-learning-pos-missing-total.md`.

## 2026-09-21 — POS retry for every confirmed complete-table profile — READY FOR CI

- [x] LAB evidence: the existing MANTZAVAS 38001 failed job stayed `POS_FAILED` after refresh because its complete-table profile had no generic retry strategy.
- [x] Every centrally confirmed complete-table profile can now restart the same failed draft; exact Learning replay remains supplier + invoice scoped.
- [x] No payment, duplicate invoice, stock or cross-supplier economics are introduced by the retry.
- [ ] Green CI → merge → deploy → refresh POS and retry MANTZAVAS 38001.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-21-invoice-learning-pos-generic-retry.md`.

## 2026-09-21 — POS reviewable draft on header-total difference — READY FOR CI

- [x] A valid printed table may now populate the existing POS draft even when its line total differs from the invoice header.
- [x] The server preserves verified row economics when the table reconciles to its own total; it does not copy another supplier's quantities, prices or discounts.
- [x] The existing intake reconciliation flag records the difference and keeps the document in draft/approval review with stock and finalization blocked.
- [x] A table with corrupted row arithmetic or no usable lines remains fail-closed.
- [x] Targeted POS handoff/recovery/line-contract tests `45/45` PASS.
- [ ] Green CI → merge → deploy → retest MANTZAVAS 38001 and manually correct 1–2 codes if needed.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-21-invoice-learning-pos-review-draft.md`.

## 2026-09-21 — Invoice Learning draft save separated from profile sync — READY FOR CI

- [x] «Αποθήκευση Προχείρου» writes the central workspace immediately without waiting for all supplier-profile/product-knowledge synchronization.
- [x] «Επιβεβαίωση & Εκμάθηση» continues to synchronize supplier rules centrally.
- [x] Added a 30-second request timeout and explicit error path so a stuck request cannot look like a silent save.
- [x] Targeted draft-save and POS contract tests PASS.
- [ ] Green CI → merge → deploy → save the 12-line draft again and verify it remains after refresh.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-21-invoice-learning-draft-save.md`.
## 2026-09-21 — Κοινός καθαρισμός φωτογραφιών παραστατικών — AWAITING CI / LAB

- [x] Μία κοινή ροή για φωτογραφίες από PC/κινητό/κάμερα σε νέο τιμολόγιο, πληρωμή ανοιχτών τιμολογίων, λοιπά έξοδα και κατάθεση.
- [x] Αυτόματο συντηρητικό κόψιμο, ίσιωμα, αφαίρεση σκιάς, ενίσχυση αντίθεσης και διατήρηση έως 3000 px πριν από Azure OCR/upload.
- [x] Έλεγχος ανάλυσης και θολώματος πριν επιτραπεί αποστολή· σαφές μήνυμα για νέα λήψη.
- [x] Τα PDF παραμένουν ανέπαφα. Καμία αλλαγή σε πληρωμή, πίστωση, duplicate guard, draft, stock, fiscal, accounting ή myDATA.
- [x] Client production build PASS.
- [ ] Πράσινο CI → merge → ακριβές deploy → LAB με καθαρή/θολή φωτογραφία και PDF.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-21-shared-document-image-quality.md`.


## 2026-09-22 — Invoice Learning review navigation

- Enter μετακινεί το focus στο επόμενο ενεργό κελί.
- Η περιοχή ελέγχου δεν έχει κάθετη εσωτερική κύλιση.
- Επιβεβαιωμένες γραμμές πράσινες και απορριφθείσες κόκκινες.
- Δεν τροποποιήθηκε η λογική του «Επιβεβαίωση & Εκμάθηση».
- PR: #1061.


## 2026-09-22 — Invoice Learning no horizontal scroll

- Ο πίνακας ελέγχου προσαρμόζεται στο πλάτος της οθόνης χωρίς οριζόντια κύλιση.
- PR: επόμενη αλλαγή Invoice Learning.
## 2026-09-22 — Νέο είδος τιμολογίου: barcode και δεκαδικά — LAB PASS

- [x] **LAB FAIL**: σε LAB χωρίς Master Catalog η διόρθωση γραμμής δημιουργούσε νέο είδος χωρίς επιλογή barcode.
- [x] Προστέθηκαν τρεις ρητές επιλογές: υπάρχον barcode, αυτόματο εσωτερικό EAN-13 MyWorkStation ή προσωρινά χωρίς barcode.
- [x] Το νέο προϊόν δημιουργείται και αντιστοιχίζεται στην ίδια ασφαλή συναλλαγή πριν από την οριστικοποίηση.
- [x] Διορθώθηκε η διπλή επεξεργασία των πεδίων έκπτωσης σε ευρώ που μηδένιζε δεκαδικά με κόμμα· γίνονται δεκτά `1,50` και `1.50`.
- [x] Δεν γίνεται stock posting, πληρωμή, οριστικοποίηση, λογιστική ή myDATA από τη διόρθωση.
- [x] Πράσινο CI, merge και ακριβές Render deploy (`dc79662a`, PR #1074).
- [x] Πραγματικό LAB PASS: νέα είδη δημιουργήθηκαν χωρίς `404` και η παραγγελία `7460` οριστικοποιήθηκε σωστά.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-22-invoice-new-product-barcode-decimals.md`
## 2026-09-22 — Generate εσωτερικού barcode και LAB 404 — LAB PASS

- [x] LAB evidence: η επιλογή «Δημιουργία εσωτερικού MyWorkStation» δεν είχε κουμπί παραγωγής και η καταχώρηση νέου προϊόντος επέστρεφε `Σφάλμα 404`.
- [x] Προσθήκη `Generate Barcode` με άμεση εμφάνιση έγκυρου εσωτερικού EAN-13 και αποθήκευση του ίδιου κωδικού.
- [x] Διόρθωση client API prefix σε `/api/commerce/purchase-orders/.../ocr-lines/.../create-product`.
- [x] Πράσινο CI, merge και ακριβές Render deploy (`dc79662a`, PR #1074).
- [x] Νέα πραγματική δοκιμή χρήστη ολοκληρώθηκε χωρίς `404`; το εσωτερικό barcode αποθηκεύτηκε στο νέο προϊόν.
## 2026-09-22 — Πολυσέλιδο `AI_COMPLETE` resume — IN PROGRESS

- [x] LAB FAIL: ΤΑΛΩΣ `01T00125909`, 2 σελίδες, `252,06 €`, έμεινε πάνω από 10 λεπτά σε `AI_COMPLETE` με 0 είδη.
- [x] Εντοπίστηκε κενό ανάμεσα στην ολοκλήρωση AI και στο durable background handoff.
- [x] Το ίδιο `AI_COMPLETE` job γίνεται recoverable από τις ήδη αποθηκευμένες γραμμές, χωρίς νέο upload ή νέα πληρωμή.
- [x] Η πρώτη πραγματική επανάληψη αποκάλυψε ότι το BackOffice `fast-recover` παρέλειπε το `AI_COMPLETE`, παρότι startup/worker το δέχονταν.
- [x] Το refresh της λίστας επιλέγει πλέον `AI_COMPLETE`, το προωθεί σε `POS_QUEUED` και επανεκκινεί το ίδιο durable handoff.
- [x] Δεύτερο LAB FAIL: το recovery ξεκίνησε αλλά το παλιό handoff έκανε νέο `AI_RECHECK` και έληξε σε timeout.
- [x] Όταν υπάρχουν αποθηκευμένες AI γραμμές, το recovery τις επαναχρησιμοποιεί ρητά χωρίς δεύτερη κλήση OCR/AI.
- [x] Η αυτοΐαση ξεκινά απευθείας από το POS polling και καλύπτει stale `POS_PROCESSING`; δεν απαιτείται BackOffice refresh.
- [x] Στοχευμένα recovery tests `44/44` PASS και πλήρες server suite `1399/1399` PASS.
- [ ] Πράσινο CI, merge, ακριβές Render deploy και αυτόματη συνέχιση του υπάρχοντος job.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-22-gate3-multipage-ai-complete-resume.md`
## 2026-09-22 — Invoice Learning πολυσέλιδο upload — LAB FAIL / LOCAL PASS

- [x] Πραγματικό Gate 3 δείγμα ΤΑΛΩΣ: το Learning δέχεται μόνο μία φωτογραφία και δεν μπορεί να εκπαιδεύσει το δισέλιδο παραστατικό.
- [x] Post-deploy LAB FAIL: η σελίδα έμεινε λευκή από recursive `MutationObserver` μετά την αλλαγή της ετικέτας του κουμπιού.
- [x] Idempotent hotfix: η ετικέτα γράφεται μόνο όταν διαφέρει και δεν ξαναπυροδοτεί ατέρμονα observer loop.
- [x] Επιλογή έως 5 φωτογραφιών, διατήρηση σειράς και ενιαία Azure → AI ανάγνωση όλων των σελίδων.
- [x] Targeted `23/23`, πλήρες server suite `1402/1402`, client build και server build PASS.
- [ ] Πράσινο CI, merge, ακριβές deploy και LAB επανάληψη.
- [ ] LAB PASS μόνο με 44 γραμμές και `223,05 € + 29,01 € = 252,06 €`, χωρίς οριστικοποίηση/stock/νέα πληρωμή.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-22-invoice-learning-multipage-upload.md`.

## 2026-09-22 — TALOS χάρτης στηλών και ασφαλής επανέλεγχος — LOCAL PASS / AWAITING CI + LAB

- [x] LAB FAIL: μετά τον χάρτη στηλών, η ίδια δισέλιδη εικόνα επέστρεφε cached μετατοπισμένες στήλες (`0,78` αντί ποσότητας `6`) και λάθος σύνολα.
- [x] Το πραγματικό κουμπί αποθηκεύει πλέον κεντρικά μόνο τον χάρτη του επιλεγμένου προμηθευτή και εκκινεί αυτόματα νέο επανέλεγχο.
- [x] Δεν γίνεται bulk επανεγγραφή προφίλ: διατηρούνται όλες οι υπάρχουσες εκμαθήσεις, mappings/barcodes και τα προφίλ άλλων προμηθευτών.
- [x] Το cached αποτέλεσμα ξαναπερνά από την τρέχουσα κεντρική διάταξη και από νέο οικονομικό reconciliation.
- [x] Ο ρητός χειροκίνητος χάρτης υπερισχύει από λάθος provider column map μόνο όταν η τρέχουσα ωμή γραμμή επαληθεύεται μαθηματικά.
- [x] TALOS regression και πλήρες server suite `1407/1407` PASS· client production build PASS.
- [ ] Πράσινο CI → merge → ακριβές deploy → Ctrl+F5 και επανέλεγχος των 2 σελίδων.
- [ ] LAB PASS μόνο με 44 γραμμές και `223,05 € + 29,01 € = 252,06 €`, πριν από οποιαδήποτε «Επιβεβαίωση & Εκμάθηση».
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-22-talos-column-map-recheck.md`.

## 2026-09-23 — TALOS server-side printed-row verification — LOCAL PASS / AWAITING CI + LAB

- [x] LAB FAIL μετά το πρώτο deploy: το client-only repair δεν εφαρμοζόταν στο πραγματικό Azure/cached αποτέλεσμα και παρέμενε σύνολο `247,09 €`.
- [x] Η επαλήθευση μεταφέρθηκε στον server και εφαρμόζεται σε Azure, cached reread, OpenAI fallback και hybrid αποτέλεσμα.
- [x] Αυστηρό scope μόνο σε ΤΑΛΩΣ (`800802293` ή αναγνωρισμένη επωνυμία) και μόνο όταν ισοζυγίζουν `ποσότητα × τιμή = προ έκπτωσης` και `προ έκπτωσης − έκπτωση = καθαρή αξία`.
- [x] Regression για τις 13 λανθασμένες ποσότητες PASS· άλλοι προμηθευτές και μη ισοζυγισμένες γραμμές παραμένουν αμετάβλητοι.
- [x] Στοχευμένα `38/38`, πλήρες server suite `1413/1413` και client production build PASS.
- [x] Αυτόνομο browser LAB μετά το πρώτο server deploy: 44 γραμμές αλλά `218,66 € + 28,43 € = 247,09 €`; τρεις OCR παραλλαγές παρέμεναν (`4320394`, `4323717`, `4332684`).
- [x] Προστέθηκαν οι δύο επαληθεύσιμες επταψήφιες σειρές ανάγνωσης, fallback αναγνώρισης επωνυμίας ΤΑΛΩΣ και άθροιση ΦΠΑ με στρογγυλοποίηση ανά γραμμή όπως στο παραστατικό.
- [x] Δεύτερο αυτόνομο LAB στο `b0cae260`: 44 γραμμές, `218,66 € + 28,44 € = 247,10 €`· η αποτυχία απομονώθηκε σε μεταγενέστερο wrapper που ξανάγραφε 3 ήδη επαληθευμένες γραμμές με stale package-conversion τιμές.
- [x] Ο wrapper διατηρεί πλέον ολόκληρη την επαληθευμένη τυπωμένη οικονομική γραμμή μόνο όταν ισοζυγίζουν ποσότητα, τιμή, έκπτωση, καθαρή αξία και ΦΠΑ, χωρίς αλλαγή στις ήδη σωστές γραμμές.
- [x] Τρίτο αυτόνομο LAB στο `2cf30505`: το production bundle ήταν σωστό αλλά η ταυτότητα προμηθευτή συμπληρωνόταν από την εξωτερική upload ροή μετά το σύγχρονο result hook, οπότε ο αυστηρός TALOS verifier έκλεινε ασφαλώς χωρίς εφαρμογή.
- [x] Προστέθηκε deferred same-tick εφαρμογή πάνω στις ίδιες ήδη διαβασμένες ωμές γραμμές, αφού εμφανιστεί η ταυτότητα προμηθευτή· χωρίς νέο OCR και χωρίς διεύρυνση σε άλλον προμηθευτή.
- [x] Τέταρτο αυτόνομο LAB σε καθαρή καρτέλα στο `9053b68a`: `44 / 218,66 € / 28,44 € / 247,10 €`· η ταυτότητα προμηθευτή εμφανίζεται αργότερα από ένα event-loop tick.
- [x] Ο TALOS verifier περιμένει πλέον οριοθετημένα έως 5 δευτερόλεπτα για το ΑΦΜ/επωνυμία και διαφορετικά βγαίνει χωρίς αλλαγή· δεν εκτελεί νέο OCR και δεν εφαρμόζεται σε άλλον προμηθευτή.
- [x] Πέμπτο αυτόνομο LAB στο `77c64418`: το cached provider αποτέλεσμα παρέμενε χωρίς supplier identity και έδωσε `44 / 218,66 € / 28,44 € / 247,10 €`.
- [x] Προστέθηκε fail-closed server fallback μόνο για ακριβώς 44 γραμμές και τουλάχιστον 5 από 6 διακριτούς κωδικούς TALOS· δεν αποθηκεύει παλιές οικονομικές τιμές και συνεχίζει να αλλάζει μόνο μαθηματικά επαληθευμένες γραμμές.
- [x] Νέα θετικά και αρνητικά regressions PASS· πλήρες server suite `1416/1416` και client production build PASS.
- [x] Έκτο αυτόνομο LAB στο `89589d1a`: η ζωντανή φόρμα απέδειξε ότι η ταυτότητα TALOS επιστρέφεται ως top-level `supplierTaxId` / `supplierName`, ενώ ο server verifier διάβαζε μόνο nested `supplier`.
- [x] Ο verifier δέχεται πλέον και τα δύο response shapes με αμετάβλητο supplier scope και τον ίδιο αυστηρό μαθηματικό έλεγχο ανά γραμμή.
- [ ] Πράσινο CI → merge → ακριβές deploy → αυτόνομο browser LAB με τις 2 σελίδες.
- [ ] LAB PASS μόνο με 44 γραμμές και `223,05 € + 29,01 € = 252,06 €`, πριν από «Επιβεβαίωση & Εκμάθηση».
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-talos-server-verified-rows.md`.

## 2026-09-23 — Workforce AI draft employee/week fix — AWAITING CI + LAB

- [x] LAB FAIL: AI preview DRAFT save returned «Δεν βρέθηκε εργαζόμενος Workforce v2.».
- [x] LAB FAIL: selected week 21/09–27/09 was previewed as 23/09–29/09.
- [x] Authenticated Workforce validation context restored for AI apply.
- [x] AI weeks normalized to Monday–Sunday with approved leave loaded from Monday.
- [x] Stale employees, inactive templates and out-of-week dates rejected before persistence.
- [x] Cross-store candidates require active `canSchedule` access.
- [x] Targeted tests, syntax and diff checks PASS.
- [ ] Green CI → merge → exact Render deploy → LAB retry of AI preview and DRAFT save.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-ai-draft-employee-week.md`.


## 2026-09-23 — Workforce εύκολη ροή και καθαρή εβδομάδα — AWAITING CI + LAB

- [x] Η αναλυτική εβδομάδα χωρίστηκε σε responsive κάρτες ημέρας και βάρδιας χωρίς επικαλύψεις.
- [x] Οι καθημερινές ενέργειες κρατούν αυτόματη αιτιολογία στο Audit χωρίς textarea.
- [x] Η δημοσίευση έχει μία σύντομη τελική επιβεβαίωση.
- [x] Μετά τη δημοσίευση ανοίγει αυτόματα η τελική αναλυτική εβδομάδα.
- [ ] Πράσινο CI → merge → ακριβές Render deploy → browser LAB της πλήρους ροής.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-easy-week-view.md`.

- [x] Δεύτερη οπτική διόρθωση Workforce: modal σχεδόν πλήρους οθόνης και scoped overrides ώστε οι τρεις βάρδιες να μην συγχωνεύονται.
- [ ] Πράσινο CI → merge → ακριβές deploy → νέα οπτική δοκιμή εβδομαδιαίου προγράμματος.


## 2026-09-23 — TALOS εκπτώσεις κλάδου και κενή λιανική — LOCAL PASS / AWAITING CI + LAB

- [x] Η στήλη έκπτωσης κλάδου δεν περνά πλέον ως λιανική· η λιανική μένει κενή.
- [x] Η έκπτωση κλάδου και η επόμενη έκπτωση εφαρμόζονται διαδοχικά ως Εκπτ.1 και Εκπτ.2.
- [x] Η γραμμή `4323717` επαληθεύεται ως ποσότητα `6`, τιμή `1,02 €`, εκπτώσεις `18,40% + 12%` και καθαρή αξία `4,39 €`.
- [x] Πολυγραμμικές Azure εγγραφές διαβάζονται πλήρως και η αλλαγή παραμένει αυστηρά περιορισμένη στον TALOS.
- [x] Targeted `42/42`, πλήρες server suite `1417/1417` και client production build PASS.
- [ ] Πράσινο CI → merge → ακριβές deploy → νέο upload των 2 σελίδων χωρίς «Επιβεβαίωση & Εκμάθηση».
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-talos-industry-discounts-retail.md`.


## 2026-09-23 — Workforce Πρόγραμμα βαρδιών — PRODUCTION PASS / ΟΛΟΚΛΗΡΩΘΗΚΕ

- [x] AI preview και ασφαλής αποθήκευση ως νέα έκδοση DRAFT.
- [x] Επιλεγμένη εβδομάδα Δευτέρα–Κυριακή και πραγματικοί εργαζόμενοι/κανόνες/άδειες.
- [x] Έλεγχος 21/21 αναθέσεων, προεπισκόπηση, έγκριση και δημοσίευση.
- [x] Αυτόματες αιτιολογίες Audit στις καθημερινές ενέργειες και μία απλή επιβεβαίωση στη δημοσίευση.
- [x] Χωριστές ενότητες AI Πρόγραμμα, Βάρδιες, Άδειες & Ρεπό και Audit.
- [x] Μεγάλο responsive modal, ξεχωριστές ημέρες και βάρδιες, χωρίς επικαλύψεις.
- [x] Πράσινο CI #2813, PR #1100, merge και ακριβές Render deploy `5eb06f2c307029d044efe5cc8ea732b425c33154`.
- [x] USER VISUAL PASS από την τελική παραγωγική εικόνα.
- [ ] Επόμενο και μόνο επόμενο Workforce βήμα: ολοκλήρωση Παρουσιών / Κάρτας εργασίας και σύνδεση με POS.
- **ΜΗΝ επαναλάβετε την υλοποίηση ή την οπτική διόρθωση του Προγράμματος βαρδιών.**
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-easy-week-view.md`.


## 2026-09-23 — Workforce Παρουσίες από POS — AWAITING CI + LAB

- [x] Άνοιγμα ταμειακής βάρδιας → αυτόματη έναρξη παρουσίας.
- [x] Κλείσιμο ταμειακής βάρδιας → αυτόματη λήξη και πραγματικές ώρες.
- [x] Σύνδεση με δημοσιευμένο πρόγραμμα, νυχτερινή βάρδια και έλεγχοι απόκλισης.
- [x] Πάνω από 8 ώρες → NEEDS_APPROVAL.
- [x] Διόρθωση late clock-in που έκλεινε πρόωρα την OPEN κατάσταση.
- [x] Audit POS_SHIFT με Cash Shift ID και προστασία από διπλή παρουσία.
- [ ] Πράσινο CI → merge → exact deploy → LAB με PIN εργαζομένου, άνοιγμα και κλείσιμο POS.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-pos-attendance.md`.
## 2026-09-23 — TALOS POS learned mismatch — LAB FAIL / LOCAL PASS / AWAITING CI

- [x] Real POS draft `01T00125909`: 44 rows, `825,82 €` against `252,06 €`; repeating `13,00 €`/`14,69 €` values. No approval or deletion.
- [x] Production revision observed as `d426f2df`, behind main `d8abc2cf` and its later TALOS changes.
- [x] Read-only live Learning view: VAT `800802293`, learned number `00125909`, 44 rows, `223,05 € + 29,00 € = 252,05 €`. POS sent `01T00125909`, `252,06 €`: series mismatch skipped exact replay.
- [x] TALOS-only full-series alias enables exact learned replay if every row and the total pass; invalid learned economics stop without generic AI substitution.
- [x] Centrally learned complete-table profiles now block POS orders with mismatched totals across all stores. Learning reports shared success only after row reconciliation and central profile save complete.
- [x] Targeted exact-learning, profile-sync and POS contract tests `16/16` PASS; full server suite `1420/1420`, client build and diff check PASS.
- [ ] Green CI → merge → verify exact Render revision → inspect all 44 learned rows and reconcile `223,05 € + 29,01 € = 252,06 €`.
- [ ] LAB PASS only after one new POS submission creates a single correct BackOffice draft without manual refresh or resubmission; do not approve or post stock before reconciliation.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-talos-pos-learned-mismatch.md`.
## 2026-09-23 — Ενιαίος κανόνας POS έως 2 γραμμές προς έλεγχο — LAB FAIL / LOCAL TESTING

- [x] Ισχύει σε κάθε σελίδα και κατάστημα η απόφαση 19/09: έως 2 **υπαρκτές** αβέβαιες γραμμές ανά τιμολόγιο, με εμφανές «ΠΡΟΣ ΕΛΕΓΧΟ» και αιτία· ο χειριστής διορθώνει πριν από έγκριση. Καταγράφηκε στο root `AGENTS.md`.
- [x] Νέο LAB FAIL: LAB POS 2 Λεβεντόπουλος `ΤΑΜΠΧ14 15` παραμένει `POS_FAILED` με 0 είδη. Αυτό δεν είναι αποδεκτή περίπτωση δύο διορθώσεων. Ο παλιός αριθμός `ΤΔΛΠΧ14 15` δεν ταυτίζεται αυθαίρετα.
- [x] Η πρόσφατη καθολική πύλη απόλυτης συμφωνίας προσαρμόζεται: υποψήφιος πίνακας με έως 2 ρητά μη επαληθευμένες γραμμές και αποδεδειγμένη αριθμητική στις υπόλοιπες μπορεί να γίνει ασφαλές πρόχειρο προς έλεγχο. Κενός πίνακας, 3+ αβέβαιες ή αλλοιωμένη βεβαιωμένη γραμμή μπλοκάρονται.
- [x] Στοχευμένα tests (17 + 46) και client build πέρασαν τοπικά.
- [x] Πλήρης server suite: 1423/1423 passed.
- [ ] Πράσινο CI → merge → ακριβές deploy → μία νέα γνήσια υποβολή POS για LAB αποδοχή. Το παλιό draft μόνο για διάγνωση, χωρίς νέο upload/διαγραφή.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-pos-two-review-lines-central-rule.md`.
