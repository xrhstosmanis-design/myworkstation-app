# Gate 6 — terminal/βάρδια fail-closed — 26/09/2026

## Πραγματικό LAB αποτέλεσμα πριν από αλλαγή

Κατάστημα: `MYWORKSTATION LAB` / «ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ».

- Η `ONL-001` προχώρησε πραγματικά `NEW → ACCEPTED → PREPARING → READY → OUT_FOR_DELIVERY` και η εκτύπωση δελτίου λειτούργησε.
- Στο checkout επιχειρήθηκαν πρώτα κάρτα και μετά μετρητά. Η οθόνη εμφάνισε ότι δεν υπάρχει ενεργή ταμειακή στο `MAIN`, όμως είχε ήδη δημιουργηθεί μία εμπορική πώληση **0,50 € / `SALE_CASH`**.
- Το BackOffice επιβεβαίωσε ασυνεπή μερική ολοκλήρωση: `Sale COMPLETED`, `terminal άγνωστο`, `NON_FISCAL / ΛΕΙΠΕΙ`, κίνηση αποθέματος `ΧΩΡΙΣ ΚΙΝΗΣΗ / ΛΕΙΠΕΙ`, ενώ η παραγγελία παρέμεινε `OUT_FOR_DELIVERY` και το POS εξακολουθούσε να εμφανίζει «ΣΤΟ POS / ΠΛΗΡΩΜΗ».
- Η πώληση γράφτηκε στη λανθασμένη βάρδια `MAIN`. Μετά από διοικητικό κλείσιμο της μηδενικής `MAIN`, το ίδιο φυσικό POS άνοιξε ξανά αυτόματα νέα `MAIN` στις 16:27, παράλληλα με την ήδη ενεργή `LAB-POS-02`.
- Το `LAB-POS-02` είχε αποθηκευμένο mapping `LAB-FISCAL-02`, `LAB-EFTPOS-02A` και `LAB-EFTPOS-02B`. Άρα το εύρημα δεν είναι απουσία mapping αλλά χρήση μη δεσμευμένης/λανθασμένης terminal ταυτότητας πριν από τον τελικό handoff.
- **Απαγορεύεται επανάληψη πληρωμής της ONL-001**: υπάρχει ήδη συνδεδεμένη πώληση και νέα απόπειρα μπορεί να δημιουργήσει δεύτερη οικονομική κίνηση.

Κατάσταση: **LAB FAIL / Gate 6 OPEN**.

## Αιτία και προστατευόμενη διόρθωση

Το γενικό POS checkout δημιουργεί πώληση, πληρωμή και stock πριν ο μεταγενέστερος `complete-from-pos` επαληθεύσει το ετεροχρονισμένο terminal. Επιπλέον η αναζήτηση delayed terminal βασίζεται σε ανοιχτές βάρδιες και δεν αναγνωρίζει αξιόπιστα όνομα όπως `LAB-POS-02`.

Branch: `agent/gate6-terminal-fail-closed-20260926`.

Η αλλαγή πρέπει:

1. να επιλύει το μοναδικό ενεργό delayed terminal από το αποθηκευμένο Fiscal/EFTPOS mapping,
2. να απορρίπτει λάθος ή μη δεσμευμένο POS πριν από Sale/Payment/StoreTransaction/stock,
3. να απαιτεί ανοιχτή βάρδια ακριβώς στο mapped terminal,
4. να διατηρεί idempotency και ακριβώς μία stock μεταβολή,
5. να μην αλλάζει Gate 3, Gate 4, Gate 5, Gate 7, Gate 8 ή efood/Pelican.

## Υλοποίηση και τοπικός έλεγχος

- Το delayed terminal επιλύεται πλέον από τη μοναδική ενεργή σύνδεση `StoreFiscalDevice` → `StoreEftposDevice(role=DELIVERY)`. Το `KAT_DELAYED_TERMINAL_POS` παραμένει μόνο ως ρητή τεχνική ρύθμιση.
- Το POS checkout επαληθεύει terminal, ανοιχτή βάρδια και απαιτούμενη ταμειακή/EFTPOS πριν από `Sale`, `Payment`, `StoreTransaction` ή stock mutation.
- Το online panel στέλνει ρητά `operationChannel=DELIVERY_DELAYED`.
- Το handoff και το checkout χρησιμοποιούν τον ίδιο resolver, ώστε το `LAB-POS-02` να μην αντικαθίσταται από `MAIN`.
- Στοχευμένα tests: **19/19 PASS**.
- Πλήρες server suite: **1572 PASS, 0 FAIL, 1 SKIP**.
- Production client build: **PASS**.

Κατάσταση κώδικα: **LOCAL PASS — AWAITING PUSH / CI / DEPLOY / LAB RETEST**. Δεν αποτελεί ακόμη τελικό Gate 6 PASS.

## Αποδοχή μετά το deploy

- Η παλιά `ONL-001` δεν ξαναπληρώνεται.
- Νέα, ξεχωριστή δοκιμαστική παραγγελία εκτελείται μόνο μετά από πλήρες πριν/μετά.
- Λάθος terminal: απόρριψη χωρίς καμία οικονομική, fiscal ή stock μεταβολή.
- Σωστό mapped terminal: μία πώληση, μία πληρωμή, μία stock μεταβολή, ίδια βάρδια/terminal και τελική κατάσταση `DELIVERED`.
