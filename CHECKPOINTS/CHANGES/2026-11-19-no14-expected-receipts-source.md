# Νο 14 — Επιβεβαιωμένες αναμενόμενες παραλαβές / πηγαίο πακέτο

Συνέχεια της δημοσιευμένης ανάληψης #4047, owner /root και βοηθός /root/suppliers. [Σχέδιο και πίνακας αποδοχής](2026-11-19-no14-expected-receipts-claim-design.md). SOURCE PREPARED / AWAITING NATIVE CI, PROFILE COMPATIBILITY, INSTALLATION AND LAB. Συνολικό Νο 14 OPEN.

## Αποτέλεσμα πηγής

- Ρητή επιβεβαίωση ποσότητας προμηθευτή/είδους, μονάδας αγοράς και συντελεστή με αμετάβλητο στιγμιότυπο μονάδας αποθήκης. Τοπικό Decimal clone με precision 60 και κανονική δεκαδική παρουσίαση διατηρεί μέχρι 30 ψηφία χωρίς αλλαγή της καθολικής αριθμητικής άλλων λειτουργιών.
- Σύνδεση πραγματικά παραληφθείσας ποσότητας με ήδη καταχωρισμένη PURCHASE_ORDER αγορά. Η ταυτότητα company/store/order/product, PurchaseOrderPosting και εγκεκριμένου εγγράφου διασταυρώνεται με τυχόν InvoiceStockPosting και τις πραγματικές PURCHASE/PURCHASE_PACK_CORRECTION κινήσεις. Μόνο μία βασική PURCHASE ανά ομάδα γίνεται αποδεκτή. Standalone και επαναφερμένες αγορές (reopenVersion>0) δηλώνονται για χωριστό έλεγχο, επειδή τα παλαιά stock cycles δεν τεκμηριώνουν μονοσήμαντο διαθέσιμο υπόλοιπο.
- Ακύρωση μόνο μη κατανεμημένου υπολοίπου. Store advisory lock συμβατό με τους invoice writers, κλείδωμα πηγής/αναμονής, έλεγχος version, διαθέσιμης ποσότητας και συνολικών κατανομών. Ίδιο actor/payload/idempotency key επιστρέφει το ίδιο αποτέλεσμα. Audit, allocation, version και operation receipt είναι μία συναλλαγή. Η λειτουργία χρησιμοποιεί το ήδη καταχωρισμένο απόθεμα.
- Ακριβείς διαδρομές reuse invoices.read/invoices.approve με τους υπάρχοντες grants, modules και selected-store ελέγχους. Η ίδια authority επανελέγχεται στη συναλλαγή και σε replay. Οι παλιές invoice approve whitelist και όλες οι profiles/capabilities/grants διατηρούνται. Το #4007 άλλης σελίδας δεν αποτελεί εξάρτηση. Μικρή είσοδος στην υπάρχουσα σελίδα υπευθύνου ανοίγει το ίδιο OrderSuggestionsPanel με scoped API.
- Όταν είναι εγκατεστημένο το νέο υποσύστημα, οι προτάσεις αφαιρούν μόνο επιβεβαιωμένο ενεργό υπόλοιπο. Άγνωστη μονάδα ή αλλαγμένη συνδεδεμένη πηγή με ανοιχτό υπόλοιπο απαιτεί έλεγχο. Κλεισμένες παλιές αναμονές κρατούν την ένδειξη ιστορικού, χωρίς νέα αφαίρεση ποσότητας. CSV προσθέτει δύο στήλες μετά τις υπάρχουσες 39, χωρίς αλλαγή προηγούμενων θέσεων. Παλιά NEW/FINAL παραμένουν ενημερωτικές εγγραφές.

## Εγκατάσταση και αντίγραφα ασφαλείας — εκκρεμής ουσιαστική εξάρτηση

Νέοι πίνακες SupplierExpectedReceiptLine, SupplierExpectedReceiptAllocation και SupplierExpectedReceiptOperation. Το setup function καλείται μόνο ρητά στα απομονωμένα fixtures. Καμία κανονική GET/POST διαδρομή δεν εκτελεί CREATE/ALTER. Οι διαδρομές ελέγχουν readiness μόνο με to_regclass. Χωρίς τους πίνακες οι expected-receipt αναγνώσεις/εγγραφές επιστρέφουν 503 με κατανοητό μήνυμα, η οθόνη διατηρεί τις παλιές προτάσεις από απόθεμα/ζήτηση με ρητή ειδοποίηση μη διαθεσιμότητας και η ποσότητα αναμονής στο CSV μένει κενή.

Το πλήρες pg_dump περιλαμβάνει όλους τους πίνακες. Η scoped εγκατάσταση/εκκαθάριση/επαναφορά των Νο 7 και Νο 5 απαιτεί χωριστή ανασκόπηση ownership, FK, ids και JSON του operation receipt. Ο τρέχων installer απορρίπτει άγνωστους πίνακες. Δεν τροποποιήθηκαν τα ξένα lifecycle profiles ή τα όρια άγνωστων δεδομένων. Εφαρμογή DDL στο hosted περιβάλλον και ενεργοποίηση περιμένουν αυτή τη συμβατότητα. Το υποσύστημα παραμένει λειτουργικά μη εγκατεστημένο μέχρι την εγκεκριμένη εγκατάσταση.

## Έλεγχοι

- Εστιασμένο πακέτο πραγματικών UI/ποσοτήτων/CSV και παλιού shortfall contract: 26 PASS, 0 FAIL, 3 native PostgreSQL SKIP τοπικά.
- Υφιστάμενα staff workspace/permissions, supplier grouping UI και supplier comparison: 68 PASS, 0 FAIL.
- Frontend production build PASS. Διατηρούνται οι προϋπάρχουσες προειδοποιήσεις μεγάλων chunks.
- Απομονωμένο PostgreSQL-WASM/PGlite: 10 PASS, 0 FAIL, για τον πραγματικό service και HTTP router με SQL. Καλύπτει μη εγκατεστημένη κατάσταση, ακριβή ποσότητα 999999999999998000.000000000001 και 0.000000000001, σταθερό replay, διαφορετικό payload, υπερκατανομή, rollback αστοχίας audit, ανταγωνιστικές κατανομές, ακύρωση υπολοίπου, αλλαγμένη πηγή/μονάδα, εταιρεία/κατάστημα, απενεργοποιημένο module και ανακλημένο staff grant. Το StoreProduct και οι δύο StockMovement γραμμές διατηρούνται αμετάβλητα. Το PGlite σειριοποιεί τις συναλλαγές και η τοπική προσομοίωση advisory lock δεν αποτελεί απόδειξη native PostgreSQL ανταγωνισμού.
- Το νέο native fixture εκτελεί ίδιους πραγματικούς service/SQL/HTTP ελέγχους σε χωριστό προσωρινό schema της loopback *_test βάσης, περιλαμβάνοντας Promise.allSettled ανταγωνιστικές κατανομές. Η πραγματική εκτέλεση και τα shared native regressions απαιτούν το full CI του exact source head.

Καμία hosted SQL/schema εφαρμογή, επιχειρησιακή εγγραφή, πληρωμή, κίνηση αποθέματος, email ή εγκατάσταση δεν έγινε από αυτή την υλοποίηση. Δεν προστίθεται νέο LAB PASS/manual. Μετά το full CI και την ανεξάρτητη ανασκόπηση ακολουθούν η επίλυση συμβατότητας εγκατάστασης και η κοινή τελική συνεδρία LAB του πίνακα της ανάληψης.


## 19/11/2026 — Διάγνωση πρώτου πλήρους CI

Exact head 282b241284b19d0dcf151dbe7f9a1833149a6784, CI 44414063026 / job 135189674574: 6.320 PASS, 7 FAIL, 3 SKIP. Το νέο native PostgreSQL fixture αναμενόμενων παραλαβών πέρασε και τα 9 subtests μαζί με το parent (10 PASS), περιλαμβάνοντας πραγματικές ανταγωνιστικές συναλλαγές, rollback audit, ανάκληση grant, ακριβή μεγάλα/μικρά δεκαδικά και καταχωρισμένο HTTP router.

Οι 7 αποτυχίες ανήκουν σε δύο παλαιά harness προτάσεων. Το grouped PostgreSQL harness περνούσε το root mock ως transaction client με διαθέσιμο $transaction, ενώ πραγματικό Prisma TransactionClient δεν έχει αυτή τη μέθοδο. Αυτό προκαλούσε εικονική δεύτερη συναλλαγή και σύγκρουση με το ακριβές options assertion. Το harness πλέον δίνει tx-like αντικείμενο χωρίς $transaction, διατηρεί ακριβείς ελέγχους για τις δύο νόμιμες υπογραφές grouped/flat και επιβεβαιώνει μία συναλλαγή ανά grouped request. Το pure grouped harness δηλώνει τη νέα εξάρτηση readiness ως μη εγκατεστημένο συμβόλαιο και ελέγχει ακριβώς μία ανάγνωση readiness. Οι υπάρχοντες έλεγχοι ποσοτήτων, εταιρείας/καταστήματος, evidence caps και αμετάβλητων πινάκων διατηρούνται. Η πηγαία υλοποίηση μένει byte-identical· νέο πλήρες CI του διορθωμένου head εκκρεμεί.


## 19/11/2026 — Διόρθωση ambiguous UI intent / WIP, NOT READY

Η ανεξάρτητη ανασκόπηση βρήκε ότι το παλιό in-memory key χανόταν μετά από άλλο payload ή κλείσιμο της φόρμας. Το νέο journal γράφει το ακριβές request/key σε sessionStorage πριν από POST, με actor/company/store από την έμπιστη GET απάντηση. Η επαναφορά οθόνης/σελίδας εμφανίζει το εκκρεμές αίτημα και περιμένει ρητό επανέλεγχο με το ίδιο key. Άλλες ενέργειες περιμένουν μέχρι επιβεβαιωμένη απόκριση και επιτυχημένη ανανέωση αναφοράς. Η οθόνη μπορεί να κλείσει. Δεν αποθηκεύονται credentials ή tokens και δεν εκτελείται αυτόματο POST.

Για journal-aware POST το actor/company intent συγκρίνεται με την τρέχουσα αυθεντικοποίηση και το scoped κατάστημα. Γνωστή επιχειρησιακή απόρριψη καταγράφεται ως terminal REJECTED operation receipt μόνο μετά το rollback της αρχικής συναλλαγής, σε δεύτερη store-locked συναλλαγή με νέο έλεγχο authority. Προϋπάρχον επιτυχές αποτέλεσμα υπερισχύει. Διαφορετικό payload/actor δεν αντικαθιστά receipt. 403/503/500 παραμένουν μη επιβεβαιωμένα αποτελέσματα. Legacy αιτήματα χωρίς journal context διατηρούν τις αποκρίσεις σφάλματος.

Το actual mounted UI regression καλύπτει A με χαμένη απόκριση → απόρριψη νέου B → ίδιο A/key, κλείσιμο/remount, νέο document με διατηρημένο sessionStorage, απομόνωση actor/company/store, επιτυχημένο POST με αποτυχημένο refresh και terminal rejection. Τοπικά 1 PASS. Προστέθηκαν native SQL/HTTP regressions για terminal rejection, late original/retry race, prior committed result, απόρριψη διαφορετικού payload, rollback audit του rejection receipt και αλλαγμένη ταυτότητα actor. Η εκτέλεσή τους και το νέο πλήρες CI εκκρεμούν για το journal head. Το αποθηκευμένο result JSON έχει πλέον και variant rejected/message· η ανασκόπηση scoped backup/profile πρέπει να το διατηρεί μαζί με το προηγούμενο committed variant. Καμία εφαρμογή schema/hosted write ή εγκατάσταση δεν εκτελέστηκε. Το PR παραμένει Draft / NOT READY μέχρι native CI και τελική ανασκόπηση.

## 19/11/2026 — Αρχική lifecycle generation του journal / WIP

Το journal v2 διατηρεί αρχική generation και το ακριβές header του υπάρχοντος originalLifecycleHeaders πριν από POST. Η έμπιστη GET απάντηση επιστρέφει τη δεσμευμένη request generation. Το storage key παραμένει actor/company/store, ώστε νέο GET στη generation 2 να εμφανίζει το παλιό intent generation 1 χωρίς αναβάθμιση. Η ρητή επανάληψη στέλνει το αρχικό header 1. Ο server συγκρίνει intentGeneration και request ALS context, ενώ κανονική εγγραφή και terminal rejection επανελέγχουν το ίδιο lifecycle fence. Παλιό header 1 σε fence 2 δεν γράφει ούτε operation outcome· retagged header 2 με body 1 απορρίπτεται πριν από εγγραφή. Journal χωρίς τεκμηριωμένη αρχική generation απαιτεί έλεγχο και δεν αναβαθμίζεται αυτόματα.

Δύο τοπικοί έλεγχοι PASS: πραγματικός fetch wrapper → πραγματικό request middleware → πραγματικός fence validator, και mounted UI με αποκατάσταση intent 1 μετά GET 2. Το native fixture επεκτάθηκε με πραγματικό HTTP/global wrapper/middleware/SQL fence: generation 1 success, αποθηκευμένο μη εκτελεσμένο intent 1, νέα generation 2, stale retry 1 και forced retagged header 2· όλα τα line/allocation/operation/audit/stock counts διατηρούνται. Η νέα native εκτέλεση και το πλήρες CI εκκρεμούν.

Το πρώτο πακέτο καταγράφει χειροκίνητες πρόσθετες μελλοντικές ποσότητες. Δεν έχει sourceOrderId/sourceOrderLineId για ταυτοποίηση εξερχόμενης παραγγελίας, επομένως δεν αποτελεί πλήρη αυτόματη συμφωνία πραγματικών εκκρεμών παραγγελιών. Η UI το δηλώνει ρητά και ζητά manual σύνδεση αφού καταχωριστεί η παραλαβή στην αποθήκη. Ο έλεγχος πιθανής επικάλυψης νεότερης ήδη καταχωρισμένης ποσότητας πριν από manual σύνδεση βρίσκεται σε επόμενη περιορισμένη διόρθωση αναγνώστη. Συνολικό Νο 14 OPEN, όχι έτοιμο για ενεργοποίηση.


## 19/11/2026 — Readonly έλεγχος νεότερης ήδη καταχωρισμένης ποσότητας

Ο αναγνώστης επισημαίνει πιθανή επικάλυψη όταν υπάρχει θετική καταχωρισμένη κίνηση από την επιβεβαίωση και μετά για ίδιο company/store/supplier/product, συνδεδεμένη με εγκεκριμένη PURCHASE_ORDER αγορά και με διαθέσιμη μη κατανεμημένη ποσότητα. Η χρονική ένδειξη αφορά λογιστική καταχώριση, όχι απόδειξη φυσικής ώρας παραλαβής. Δεν γίνεται αυτόματη σύνδεση. Η σχετική ενεργή αναμονή δίνει review αντί αριθμητικής πρότασης, ώστε ήδη αυξημένο stock και ακόμη ανοιχτό pending να μη διπλοαφαιρεθούν σιωπηρά. Η ρητή σύνδεση παραλαβής παραμένει διαθέσιμη για την επίλυση του review. Ιστορικές καταχωρίσεις πριν τη χειροκίνητη δήλωση πρόσθετης μελλοντικής ποσότητας αποτελούν τη βάση αποθέματος.

Το native fixture ελέγχει ιστορικό baseline πριν τη δήλωση, άσχετο supplier/store/product, νεότερη διαθέσιμη ποσότητα μετά τη δήλωση → review χωρίς αριθμητική πρόταση και explicit allocation 4 από 12 → υπόλοιπο 8, ορθή πρόταση 15 και αμετάβλητο stock από τη λειτουργία σύνδεσης. Χρησιμοποιεί μόνο συνθετικά stock fixtures στο απομονωμένο schema. Καμία νέα στήλη/table/DDL ή writer αποθέματος δεν προστέθηκε από αυτόν τον guard. Νέα native εκτέλεση και full CI αναμένονται. Το manual-first όριο sourceOrder/sourceOrderLine παραμένει OPEN.
