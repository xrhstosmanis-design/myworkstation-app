# Inventory / Gate 2 - επιβεβαιωμένο PASS

## Επιβεβαιωμένο πεδίο

Το Gate 2 «Αποθήκη και κινήσεις αποθέματος» επιβεβαιώθηκε ως PASS από τον ιδιοκτήτη στις 23/09/2026 και δεν αποτελεί πλέον ενεργή εκκρεμότητα.

Καλύπτει τη βασική store-scoped ροή αρχικού stock, ledger, παραλαβής/αγοράς, χειροκίνητης διόρθωσης με αιτιολογία, φύρας/καταστροφής, επιστροφής, επιτρεπόμενης μεταφοράς και απογραφής Inventory 2.0.

## Χρήση

1. Επιλέξτε το σωστό κατάστημα στο BackOffice.
2. Ανοίξτε `Προϊόντα & Απόθεμα` και βρείτε το προϊόν με όνομα, SKU ή barcode.
3. Επιλέξτε τον σωστό τύπο κίνησης και καταχωρίστε ποσότητα και αιτιολογία όπου απαιτείται.
4. Ελέγξτε ότι η κίνηση εμφανίστηκε μία φορά στο ledger και ότι το νέο υπόλοιπο είναι σωστό.
5. Για απογραφή χρησιμοποιήστε ολική ή μερική απογραφή, barcode-first καταχώριση και οριστικοποίηση μόνο μετά τον έλεγχο διαφορών.

## Δικαιώματα και ασφάλεια

- Η λειτουργία περιορίζεται στο επιλεγμένο tenant/store και στον εξουσιοδοτημένο χρήστη.
- Ο απλός χειριστής POS δεν αποκτά αυτόματα δικαίωμα χειροκίνητης διόρθωσης.
- Οριστικοποιημένη απογραφή δεν διαγράφεται. Διαγραφή επιτρέπεται μόνο σε DRAFT όπου προβλέπεται.
- Κάθε χειροκίνητη μεταβολή χρειάζεται αιτιολογία και Audit.
- Η ίδια πραγματική κίνηση δεν πρέπει να επηρεάζει το stock δύο φορές.

## PASS criteria

- Κάθε κίνηση γράφεται ακριβώς μία φορά.
- Ledger, snapshot και εμφανιζόμενο υπόλοιπο συμφωνούν.
- Η απογραφή εμφανίζει θεωρητικό, πραγματικό και διαφορά.
- Το απόθεμα παραμένει στο σωστό κατάστημα.
- Οι αλλαγές έχουν χρήστη, χρόνο, αιτιολογία και Audit.

## Troubleshooting

- Αν το υπόλοιπο δεν συμφωνεί, μην κάνετε δεύτερη τυφλή κίνηση. Ελέγξτε πρώτα ledger και Audit.
- Αν η απογραφή δεν έχει ελεγχθεί, αφήστε την DRAFT.
- Αν εμφανιστεί διπλή κίνηση, καταγράψτε προϊόν, ώρα, χρήστη και source reference και σταματήστε την επανάληψη.

## Γνωστά όρια

Νέος τύπος κίνησης ή εξωτερική διασύνδεση πέρα από το βασικό Gate 2 απαιτεί ξεχωριστό πραγματικό PASS.

## 08/10/2026 - Κύλιση παραθύρου Απογραφής: USER PASS

Ο ιδιοκτήτης επιβεβαίωσε «είναι οκ»21:13 μετά την οδηγία ελέγχου σε κανονικό και μεγιστοποιημένο παράθυρο. Εξουσιοδοτημένος Ιδιοκτήτης / Super Admin ανοίγει Κεντρική Διαχείριση → Προϊόντα, Τιμές, Προσφορές & Απογραφή → Απογραφή, κάνει ανανέωση και κυλά το περιεχόμενο μέχρι να φαίνεται ολόκληρο το «Έναρξη» και το κάτω περιεχόμενο. Το κριτήριο PASS είναι η προσβασιμότητα αυτών των στοιχείων και στις δύο καταστάσεις παραθύρου. Στον έλεγχο εμφάνισης δεν πατά «Έναρξη».

Οι υπάρχοντες έλεγχοι ρόλου/εταιρείας/καταστήματος ισχύουν. Αν εμφανίζεται η παλιά προβολή, ανανεώνει το παράθυρο και ελέγχει ξανά την κύλιση. Αυτό το PASS αφορά desktop κύλιση μόνο: δεν πιστοποιεί νέα δημιουργία/μέτρηση/οριστικοποίηση απογραφής, κινητό/touch, νέο ρόλο ή stock μεταβολή. Το προηγούμενο Gate2 PASS διατηρείται. Η έκδοση υπηρεσίας1a71471 επαληθεύτηκε χωριστά· η φυσική έκδοση πελάτη δεν δόθηκε.

## 10/10/2026 - Μερική ζωντανή απογραφή: συμφωνία αναφοράς και ledger LAB PASS

Επιβεβαιωμένο για εξουσιοδοτημένο Super Admin στο εικονικό LAB, deployed f410a1d (περιλαμβάνει PR2010). Νέα μερική LIVE απογραφή, ένα επιλεγμένο είδος, χωρίς υποχρεωτική επανακαταμέτρηση: θεωρητικό11/καταμέτρηση10, οριστικοποίηση μία φορά, τελική αναφορά−1 και stock10. Στο ledger εμφανίστηκε μία STOCKTAKE_ADJUSTMENT−1 και συμφωνία10/10/διαφορά0. Το μη επιλεγμένο είδος και το άλλο ταμείο παρέμειναν αμετάβλητα.

1. Κεντρική Διαχείριση → Προϊόντα, Τιμές, Προσφορές & Απογραφή → Απογραφή.
2. Νέα Μερική, σωστό κατάστημα, διακριτή ονομασία, επιλεγμένα είδη και επιλογή ζωντανής απογραφής. Έναρξη.
3. Εμφάνιση όλων → Διόρθωση του συγκεκριμένου είδους → νέα πραγματική ποσότητα → Καταχώρηση & επόμενο. Η καταμέτρηση κρατά stock αμετάβλητο.
4. Ελέγξτε θεωρητικό/μετρημένο/διαφορά πριν την οριστικοποίηση. Πατήστε μία φορά Οριστικοποίηση και επιβεβαιώστε μόνο το επιλεγμένο scope.
5. Συγκρίνετε τελικό αποτέλεσμα με Αποθήκη → δεξί κλικ είδος → Κινήσεις είδους. Full Audit εξάγει CSV με καταμετρητή/πηγή/χρόνο.

Ισχύουν τα υπάρχοντα tenant/store/role gates· άλλοι ρόλοι και φυσικές συσκευές δεν πιστοποιούνται από αυτή τη δοκιμή. Οριστικοποιημένη προβολή δεν προσφέρει επεξεργασία/διαγραφή/δεύτερη οριστικοποίηση. Το κριτήριο PASS είναι ίδια πραγματική διαφορά σε αναφορά και μοναδική κίνηση, σωστό νέο stock, αμετάβλητα προϊόντα/ταμεία ελέγχου. Αν διαφέρουν, μην επαναλάβετε κίνηση: κρατήστε αναφορά, ledger και ώρα.

Όρια: generic reason οριστικοποίησης· υποχρεωτική αιτιολογία, recount/ρόλοι, concurrent UI/API edits και πλήρεις λοιπές ροές #39 παραμένουν OPEN. Ανεξάρτητη πώληση νερού08:31 δεν αποδίδεται στη δημιουργία draft· οι μετρήσεις count/finalize χρησιμοποίησαν νέο baselineMAIN1transaction/0.50€ που έμεινε αμετάβλητο. Gate2 και desktopscrollPASS διατηρούνται. Τεκμήρια CHECKPOINTS/CHANGES/2026-10-10-n39-live-tests.md.

## 10/10/2026 — Δύο ανεξάρτητες φύρες: περιορισμένο LIVE διαγνωστικό PASS

Στο LAB ως Super Admin, Αποθήκη → αναζήτηση LAB-EXCEL-20260909-01 → δεξί κλικ → Κινήσεις είδους. Μετά το PR2026, η υπάρχουσα φύρα ληγμένων09:04:26 και η παλιά φύρα10Σεπ παραμένουν χωριστές. Η συμφωνία δείχνει9/9/διαφορά0/11κινήσεις/πιθανέςδιπλές0 στη healthy aec8323 έκδοση. Δεν επαναλαμβάνουμε φύρα για να ελέγξουμε την ένδειξη. Αν εμφανιστεί νέα ασυμφωνία, κρατάμε ledger/χρόνο/reason και ελέγχουμε πριν νέα πράξη. Το PASS αφορά τη συγκεκριμένη read-only διόρθωση ψευδούς ένδειξης· δεν καλύπτει όλη την39, νέους ρόλους ή ταυτόχρονες LIVE υποβολές. Υφιστάμενα company/store/module gates διατηρούνται.


## 10Oct2026 — bounded transfer destination selector LIVE PASS

Από BackOffice επιλεγμένου LAB → Λοιπές εμπορικές λειτουργίες → Αποθήκη → επιλογή είδους → Μεταφορά. Το Από κατάστημα παραμένει το επιλεγμένο LAB και το Προς κατάστημα προσφέρει το άλλο ενεργό κατάστημα της ίδιας εταιρείας, μετά το PR2039/fbfe12dc. Πρόκειται μόνο για PASS προετοιμασίας επιλογέα. Η TRANSFER-01 επέστρεψε εσωτερικό σφάλμα χωρίς postings (ιστορικό FAIL). Η νεότερη TRANSFER-02 παρακάτω επιβεβαίωσε την λειτουργική μεταφορά· η TRANSFER-01 δεν επαναλαμβάνεται.

## N39 TRANSFER-02 — bounded LIVE PASS / overall OPEN — 10/10/2026 11:15 Athens

Owner codex/n39-inventory-acceptance-20261010 retained. PR2039 selector and PR2043 SQL-managed Product lookup corrections are LIVE verified on bbea3bda7646720abd75d90f9699c1222429daa7, full PR CI38036227841 SUCCESS2027PASS/0FAIL/0SKIP, mainCI38036434279 SUCCESS, guardedRender38036628204 SUCCESS and independent exact health. Fresh baseline recorded before one TRANSFER-02 submit: TEST1 source9 / ledger9/9/diff0/11moves/duplicates0, destination ALL exactSKU absent/0; MAIN5tx cash/total3.50/card0/IRIS0/expense0, controlLAB-POS-02 2tx cash/card/IRIS/total0/expense120; destination no open shift.

Actual11:15:01 source9→8 with one TRANSFER_OUT qty1, destination0→1 with one TRANSFER_IN qty1; same actor Χρήστος Μάνης, timestamp and reason N39-LAB-20261010-TRANSFER-02. Source ledger8/8/diff0/12moves/duplicates0; destination1/1/diff0/1move/duplicates0. Fresh financial refresh confirms both terminals unchanged and destination no open shift. No retry of failed TRANSFER-01 or compensation. Checkpoint2026-10-10-n39-transfer-live.md, evidence CHECKPOINTS/EVIDENCE/n39-transfer02-destination-20261010.jpg. This supersedes AWAITING LAB for single transfer and selector only. Whole39 OPEN for reason/recount/roles, concurrent movements/count/import/edit versus finalize, own consumption, wider replay/isolation/device/repeated-finalization acceptance. Gate2/TODAY-07/other owners preserved.

Secure POS login confirmed LAB POS2/sourceLAB/localqueue0. Preparing own consumption selected TEST1 qty1 but no consumption/payment submitted. POS showed cached stock9 after transfer; refresh failed while credential protection active and browser requires manual handoff. No further POS action, no claim of own consumption PASS, no inferred financial/stock delta. Pending cart qty1/1.20 is preparation only; user must refresh/verify stock8 and correct terminal before any business submission. Physical terminal/shift in this POS session NOT independently confirmed. Existing accepted transactions must not be repeated.

## N39 SELF-01 — bounded LIVE PASS — 10 Oct 2026 11:47:54 Athens

Same owner codex/n39-inventory-acceptance-20261010. New authorized qty1 TEST1 own consumption via LABPOS2 StoreMode/tab29 on observed release de7d5c2e0d5acf1ef4c9b65bf43ebbc28cac9258. Fresh before stock8/ledger8/8/diff0/12moves/duplicates0/latest11:15:01TRANSFER_OUT; MAIN5tx/cash3.50/card0/IRIS0/total3.50/expense0/latest09:51; controlLAB-POS-02 2tx/cash0/card0/IRIS0/total0/expense120/latest—. Newcart qty1/reference1.20/stock8; gift popup closed without TEST2 selection. One ΙΔΙΑ ΚΑΤΑΝΑΛΩΣΗ submit.

After stock7/ledger7/7/diff0/13moves/duplicates0, exactlyone ΠΡΟΣΩΠΙΚΗ ΚΑΤΑΝΑΛΩΣΗ out1/LABPOS2 at11:47:54, Sale cc8ad2db-7ac5-4e9e-9506-b5ac4ca9053d. Fresh finance MAIN and LAB-POS-02 unchanged in all above metrics. POS cleared cart/total0/queue0, no payment/receipt. Ledger intentionally derives the SaleLine; do not add duplicate StockMovement or replay. Evidence CHECKPOINTS/EVIDENCE/n39-self01-ledger-20261010.jpg; checkpoint2026-10-10-n39-consumption-live.md. Prior secure-session blocker superseded by fresh positivelyauthenticated tab. Virtual cloud terminal only; physical-device identity and wider role/replay/isolation/concurrency NOT TESTED. Full39 stays OPEN for reason/recount/roles/concurrent movements/count/import/edit/finalization/device acceptance. Existing transfer/expired/stocktake/Gate2/scroll PASS preserved; No33/44/40/TODAY-07 untouched. Next new simultaneous BackOffice waste pair only after fresh recorded baseline; no existing stock action repeated.

## N39 WASTE-PAIR-01 — bounded LIVE pair PASS — 10 Oct 11:54:12–13 Athens

Owner codex/n39-inventory-acceptance-20261010 retained. SELF-01 published PR2053/full docsCI38039304684 SUCCESS/merged8d0aba2037fad0f8dd62053def51afa977077dbc. Two prepared virtual BackOffice forms same TEST1/sourceLAB/stock7, qty1 each, distinct reasons WASTE-PAIR-01A/01B; both buttons submitted exactlyonce in one Promise.allSettled UI batch. Both success. Ledger shows B11:54:12 out1 stock6, A11:54:13 out1 stock5, actorΧρήστοςΜάνης, exact N39-LAB-20261010 reasons. Source7→5, ledger5/5/diff0/moves13→15/duplicates0; no lost subtraction/no extra posting. RefreshedMAIN5tx/cash3.50/card0/IRIS0/total3.50/expense0/latest09:51 and controlLAB-POS-02 2tx/cash0/card0/IRIS0/total0/expense120/latest— unchanged before/after. Earlier transfer and SELF-01 retained, no replay/compensation/TEST2 action. Evidence CHECKPOINTS/EVIDENCE/n39-waste-pair01-ledger-20261010.jpg, checkpoint2026-10-10-n39-consumption-live.md. This closes AWAITING LAB for the bounded near-simultaneous waste pair after PR2020 only; exact lock overlap not observable in browser, isolated PG coverage remains separate. Full39 OPEN for mandatory stocktake cause/recount/roles, count/import/line-edit versus finalize, broader replay/isolation and physical/device acceptance. No33/44/40/TODAY-07 unchanged. Next causal source review of generic finalization reason and draft-mutation race; do not repeat accepted stock postings.

## 10/10/2026 13:31 — Απόλυτη διόρθωση καταμέτρησης: περιορισμένο LIVE PASS

Επιβεβαιώθηκε για εξουσιοδοτημένο Ιδιοκτήτη/Super Admin στο εικονικό MYWORKSTATION LAB, υπάρχουσα μερική LIVE/ALL απογραφή, έκδοση a90bfd3 (PR2070). Το μολύβι πλέον αντικαθιστά τη συνολική μέτρηση: 8→4, θεωρητικό5, διαφορά−1. Stock5/ledger5/15κινήσεις και δύο ταμεία παρέμειναν αμετάβλητα. Το προηγούμενο pencil-additive FAIL δεν ισχύει στο συγκεκριμένο διορθωμένο δείγμα.

1. Στο σωστό επιλεγμένο κατάστημα ανοίξτε Κεντρική Διαχείριση → Προϊόντα, Τιμές, Προσφορές & Απογραφή → Απογραφή και την υπάρχουσα DRAFT.
2. Πατήστε Διόρθωση στη συγκεκριμένη γραμμή. Η ποσότητα προσυμπληρώνεται με την προηγούμενη συνολική μέτρηση.
3. Γράψτε τη νέα συνολική ποσότητα και ελέγξτε «Αντικατάσταση καταμέτρησης 8 με 4». Πατήστε μία φορά Καταχώρηση & επόμενο.
4. Ελέγξτε πραγματική μέτρηση4/διαφορά−1/αξία4.80 και ότι η απογραφή παραμένει DRAFT. Το stock δεν αλλάζει πριν την οριστικοποίηση.
5. Κενή Αιτιολογία οριστικοποίησης κρατά το τελικό κουμπί ανενεργό. Στο συγκεκριμένο δείγμα συμπληρώθηκε αιτιολογία ως προετοιμασία, χωρίς ακόμη ολοκληρωμένη οριστικοποίηση.

Η κανονική αναζήτηση/barcode καταχώριση διατηρεί την πρόσθεση νέας ποσότητας· χρησιμοποιήστε το μολύβι για συνολική διόρθωση. Αν δείτε προσθετική προεπισκόπηση αντί αντικατάστασης, σταματήστε πριν την υποβολή και φορτώστε την τρέχουσα έκδοση. Σε σύγκρουση ανανεώστε την ίδια απογραφή και συγκρίνετε τη μέτρηση πριν νέα διακριτή πράξη. Δεν επαναλαμβάνετε επιτυχημένη κίνηση stock.

Τα υπάρχοντα company/store/role όρια παραμένουν υποχρεωτικά· αυτό το LIVE δείγμα δεν πιστοποιεί άλλους ρόλους/tenant ή φυσικές συσκευές. Τελική reasoned closure, persisted reason/read-only/stale-tab προστασία παραμένουν OPEN έως πραγματικό έλεγχο, καθώς το native browser dialog χρειάζεται manual handoff. CI-only ασφάλεια/lock proofs δεν περιλαμβάνονται στο LIVE PASS. Checkpoint2026-10-10-n39-recount-reason-live.md.
