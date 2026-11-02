## 02/11/2026 01:05 UTC — Περιορισμένο LAB PASS συμφωνίας με πηγές και πλήρεις εξαγωγές

Στην έκδοση3bc8734f ελέγχθηκε η αναγνωστική ροή ως πραγματικός Super Admin με υποστήριξη του επιλεγμένου MYWORKSTATION LAB. Παραμένουν οι ίδιοι έλεγχοι εταιρείας, καταστήματος, Owner/SA και modules· δεν δίνεται πρόσβαση κόστους ή επιβεβαιώσεων σε απογραφείς/προσωπικό.

1. Άνοιξε Εμπορική λειτουργία → Απογραφή, επίλεξε ρητά το κατάστημα και μία ήδη οριστικοποιημένη απογραφή. Πάτησε «Έλεγχος προηγούμενης απογραφής» και έλεγξε την προηγούμενη απογραφή του ίδιου καταστήματος.
2. Διάβασε χωριστά αρχική διαφορά, επιβεβαιωμένη διόρθωση και τελικό αποτέλεσμα. Άνοιξε το είδος για το φυσικό και λογιστικό υπόλοιπο πριν/μετά, τους χειριστές, τα IDs και τους διαφορετικούς χρόνους. Η βάση απογραφής δεν προσμετράται δεύτερη φορά.
3. Άνοιξε «Αρχικό ιστορικό καταμετρήσεων» και «Αποδεικτικά είδους». Οι μετρήσεις διατηρούνται, τα συμβάντα καλαθιού δεν γίνονται κίνηση και η ποσότητα της συνδεδεμένης συναλλαγής δεν υπολογίζεται ξανά από το audit. Η οθόνη δηλώνει το όριο200· το Excel διατηρεί όλα τα αποτελέσματα. Οι πηγές χωρίς αντιστοίχιση και η έλλειψη επαληθευμένου πρωτοτύπου/φυσικού χρόνου παραμένουν ευρήματα.
4. Πάρε PDF/Excel από τη «Συμφωνία δύο απογραφών». Στο πραγματικό δείγμα TEST1 παρατηρήθηκαν10−5=5 αναμενόμενα έναντι4 καταμετρημένων, αρχική−1+διόρθωση0=τελική−1, κόστος/αξίαάγνωστα. Η παλιά ιδιοκατανάλωση εμφανίζεται μία φορά. Αυτό αντικαθιστά τον παλιό ελλιπή αναγνωστικό υπολογισμό−2, χωρίς να αλλάξει καμία καταμέτρηση.
5. Ελέγχθηκαν PDF10σελίδων και Excel12φύλλων: ίδια τελικά σύνολα, μετρήσεις10/4/8/4, θεωρητικά11/5/5/5,1συναλλαγή/46παραστατικά/544γραμμές/3συμβάντα. Δεν πρόκειται για επαλήθευση φυσικών πρωτοτύπων ή επιβεβαίωση πραγματικής απώλειας.

Κριτήρια PASS: οθόνη και πραγματικά αρχεία συμφωνούν, ολόκληρα τα IDs παραστατικών/γραμμών/συμβάντων διατηρούνται, τα36σύνολα πλήθους/περιεχομένου LAB και control παραμένουν ίδια πριν/μετά. Stock4/ίδια τελευταία κίνηση, MAIN0σύνολα/συναλλαγές,7536λοιπάauditκαι0εγγραφέςεπιβεβαίωσης αμετάβλητα. Δεν έγινε νέα απογραφή/πώληση/χρέωση/κίνηση/οριστικοποίηση.

**Ανοιχτό σφάλμα:** ο παλιός πίνακας καταμέτρησης εξακολουθεί να δείχνει0,00€ στη γραμμή και στα σύνολα κόστους, παρότι η αρχική σύνοψη και η νέα αναφορά λένε «Άγνωστο». Δεν χρησιμοποιείται αυτό το0 ως αποτίμηση· έχει αναληφθεί στο2026-11-02-inventory-cost-display.md για διόρθωση και νέο αναγνωστικό έλεγχο. Αποθήκευση LINK/CORRECTION/REVOKE στο hosted LAB παραμένει μπλοκαρισμένη από τον αυτόματο έλεγχο έγκρισης λόγω αναγνωστικής εξουσιοδότησης. Δεν γίνεται παράκαμψη ή επανάληψη παλιών κινήσεων. Ξεχωριστές αποθήκες, πλήρες φυσικό πρωτότυπο/χρονολόγηση και ευρύτεροι ανατεθειμένοι writers δεν περιλαμβάνονται σε αυτό το PASS.

Αν η αναφορά άλλαξε πριν από εξαγωγή, ανανέωσέ την. Αν λείπουν οι νέες ενότητες, κράτησε τυχόν ανολοκλήρωτη εργασία και κάνε κανονική ανανέωση. Τεκμήρια:2026-11-01-inventory-reconciliation-source-evidence.md και CHECKPOINTS/EVIDENCE/inventory-reconciliation-source-evidence-20261102.

## 01/11/2026 23:55 UTC — Συμφωνία απογραφών: περιορισμένο LAB PASS προβολής, PDF/Excel και ακύρωσης επιβεβαίωσης

Ελέγχθηκε στην εγκατεστημένη έκδοση1e293f93 ως πραγματικός Super Admin με πρόσβαση υποστήριξης στο εικονικό MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ. Το PASS αφορά μόνο την παρακάτω αναγνωστική ροή και τη μη αποθήκευση μετά από Ακύρωση. Δεν αποτελεί έγκριση απογραφής, επιβεβαίωση απώλειας ή δοκιμή αποθήκευσης διορθώσεων. Τα υφιστάμενα όρια εταιρείας/καταστήματος, σύνδεσης και module INVENTORY/LOSS_DETECTION εξακολουθούν να απαιτούνται· δεν προστίθεται δικαίωμα σε απογραφείς ή προσωπικούς χειριστές.

1. Στο ρητά επιλεγμένο κατάστημα άνοιξε Εμπορική λειτουργία → Προϊόντα, Τιμές, Προσφορές & Απογραφή → Απογραφή και μία ήδη οριστικοποιημένη απογραφή. Δεν χρειάζεται νέα καταμέτρηση ή οριστικοποίηση.
2. Πάτησε «Έλεγχος προηγούμενης απογραφής». Έλεγξε την επιλεγμένη προηγούμενη απογραφή του ίδιου καταστήματος. Η σύγκριση χρησιμοποιεί τις ώρες καταμέτρησης ανά κωδικό και δείχνει χωριστά αρχική διαφορά, διορθώσεις και τελικό αποτέλεσμα. Η αρχική σύνοψη κάτω από την αναφορά δεν είναι το διορθωμένο τελικό αποτέλεσμα.
3. Άνοιξε το είδος για τις καταγεγραμμένες κινήσεις. Οι προειδοποιήσεις, ασυμφωνίες και ελλείψεις παραμένουν ορατές. «Άγνωστο» κόστος/αξία δεν σημαίνει οικονομική αξία0 και το «προς έλεγχο» δεν σημαίνει επιβεβαιωμένη απώλεια.
4. Χρησιμοποίησε τα PDF/Excel μέσα στη «Συμφωνία δύο απογραφών». Ελέγχθηκαν πραγματικό ελληνικό PDF και Excel6φύλλων, ίδιο τελικό σύνολο και αριθμητικό ιστορικό COUNT/RECOUNT. Αν τα δεδομένα άλλαξαν, ανανέωσε την αναφορά πριν νέα εξαγωγή. Αν δεν φαίνονται τα νέα πεδία, κράτησε τυχόν ανολοκλήρωτη εργασία και κάνε κανονική ανανέωση της εφαρμογής.
5. Ακύρωση στο παράθυρο επιβεβαίωσης διόρθωσης αφήνει τη φόρμα χωρίς αποθηκευμένη διορθωτική εγγραφή. Στο συγκεκριμένο δείγμα ανοίχθηκε μόνο η επιβεβαίωση, ακυρώθηκε και η φόρμα καθαρίστηκε. Μην επαναλαμβάνεις παλιές επιτυχημένες απογραφές/πωλήσεις για τεκμηρίωση.

Πραγματικό δείγμα: παλιές N39-LAB-20261010-0530-STOCKTAKE → N39-LAB-20261010-RECOUNT-REASON-01, TEST1, αρχική−2 + διόρθωση0 = τελική−2, κόστος/αξίαάγνωστα. Το Excel διατηρεί μετρήσεις10/4/8/4 και θεωρητικά11/5/5/5, με όλα τα αρχικά συμβάντα. Ο γνωστός αναγνωστικός υπολογισμός από StockMovement δεν περιλαμβάνει ακόμη μία ιστορική ιδιοκατανάλωση από SaleLine· γι' αυτό εμφανίζεται ασυμφωνία με το θεωρητικό και η φυσική απώλεια ΔΕΝ έχει επιβεβαιωθεί. Η σύνδεση αυτής και των πρόσθετων πηγών παραμένει ξεχωριστή ανοιχτή αλλαγή.

Κριτήρια του συγκεκριμένου PASS: πλήρης συμφωνία οθόνης/αρχείων, διορθωμένη αριθμητική εξαγωγή καταμετρήσεων, μηδέν αποθηκευμένες διορθώσεις μετά την ακύρωση, αμετάβλητα16 σύνολα πλήθους/περιεχομένου LAB και N40control. TEST1stock4/ίδια τελευταία κίνηση, MAIN0μετρητά/κάρτες/συναλλαγές/σύνολο, οι43βάρδιες και7536λοιπές εγγραφές WorkforceAuditLog επίσης αμετάβλητες. Δεν έγινε νέα κίνηση stock, καταμέτρηση, πώληση, χρέωση, αποστολή ή οριστικοποίηση.

Όρια: η αποδοχή του confirm για hosted συνθετική διόρθωση απορρίφθηκε από τον αυτόματο έλεγχο έγκρισης λόγω αναγνωστικής εξουσιοδότησης στην πραγματική βάση. Αποθήκευση LINK/CORRECTION/REVOKE, άλλοι ρόλοι, φυσικές συσκευές, πλήρης φυσική συμφωνία/παραστατικά/συμβάντα και ανεξάρτητες αποθήκες δεν περιλαμβάνονται σε αυτό το PASS. Δεν παρακάμπτεται το μπλοκάρισμα ούτε εξάγεται hosted write PASS από CI. Checkpoint2026-11-01-inventory-reconciliation-reviews.md και evidence/inventory-reconciliation-reviews-20261101.


## 31/10/2026 — Ομαδική άδεια αλλαγής τιμής POS: USER PASS στη Ριζαρείου και στη Διαδόχου

Ο χρήστης επιβεβαίωσε ότι η αλλαγή πέρασε και στα δύο καταστήματα: «ΠΕΡΑΣΕ ΤΑ ΑΛΛΑΞΑ ΚΑΙ ΣΤΗΝ ΡΙΖΑΡΙΟΥ ΚΑΙ ΣΤΗΝ ΔΙΑΔΟΧΟΥ». Η πραγματική ομαδική καταχώρηση καταγράφεται ως USER PASS και η συγκεκριμένη εκκρεμότητα αποδοχής κλείνει. Οι επιτυχημένες αλλαγές δεν χρειάζονται επανάληψη.

Οι παρακάτω οδηγίες ανοίγματος, επιλογής ειδών/όλων, Ναι/Όχι και μίας Καταχώρησης εξακολουθούν να ισχύουν. Η άδεια παραμένει κοινή εταιρική ιδιότητα προϊόντος· απαιτούνται τα υπάρχοντα δικαιώματα εταιρείας/καταστήματος/INVENTORY και στο POS το δικαίωμα χειριστή αλλαγής λιανικής. Ο STORE_OPERATOR δεν αποκτά δικαίωμα ομαδικής διόρθωσης.

Η προηγουμένως επαληθευμένη εγκατάσταση είναι 42ae4a3d, με ελεγχόμενη εγκατάσταση 41201059265. Χωριστά, στο εικονικό LAB ελέγχθηκαν «Όλα → Ναι» και επιλεγμένο «Όχι», σωστό κουτάκι και πλήρης επαναφορά με αμετάβλητες τιμές/stock/οικονομικά (31Oct12:50/12:51UTC, receipts59ef5c83/dabac37e). Οι native έλεγχοι 8.000/10.000 ειδών παραμένουν αυτοματοποιημένο τεκμήριο. Για τις πραγματικές ενέργειες η πηγή είναι η δήλωση χρήστη: ακριβή πλήθη, Ναι/Όχι, receipts, ώρα/συσκευή/revision και ανεξάρτητες πριν/μετά μετρήσεις stock/οικονομικών δεν καταγράφηκαν εδώ.

Σε παλιά ανοιχτή έκδοση κάνε Ανανέωση/Ctrl+F5. Μετά από μία Καταχώρηση περίμενε την επιβεβαίωση. Αν εμφανιστεί μήνυμα timeout ή χρήσης είδους, η πράξη αποτυγχάνει συνολικά· περίμενε πριν από νέα προσπάθεια. Δεν υπάρχει αυτόματη επανάληψη ή μερική αποθήκευση. Οι λοιπές ομαδικές αλλαγές κρατούν το προηγούμενο όριο χρόνου. Checkpoint: 2026-10-31-inventory-bulk-pos-price-large.md. Τα παρακάτω LAB PASS είναι ιστορικά μικρού δείγματος.

## 31/10/2026 — Ομαδική άδεια αλλαγής τιμής POS: scoped desktop LAB PASS

Εγκατεστημένη έκδοση9644e958. Ελέγχθηκε με Super Admin στο εικονικό MYWORKSTATION LAB, στο μοναδικό συνθετικό LAB EXCEL TEST 1: μία μαζική ενεργοποίηση και μία επιλεγμένη απενεργοποίηση, με ανεξάρτητη μέτρηση και πλήρη επαναφορά. Τα ίδια υπάρχοντα κουτάκια της καρτέλας έδειξαν αντίστοιχα τσεκαρισμένο/ξετσεκαρισμένο. Δεν έγινε πώληση ή αλλαγή τιμών/stock/οικονομικών.

1. Στο επιλεγμένο κατάστημα άνοιξε Εμπορική λειτουργία → Λοιπές εμπορικές λειτουργίες → Αποθήκη → Ομαδική διόρθωση.
2. Για συγκεκριμένα προϊόντα, τσέκαρε τις γραμμές και κράτησε «Εφαρμογή άδειας POS → Στα επιλεγμένα». Για όλα, διάλεξε «Σε όλα τα είδη του καταστήματος»: περιλαμβάνει όλες τις σελίδες, ενεργά/ανενεργά και αγνοεί φίλτρα αναζήτησης. Μπορείς να ανοίξεις τη φόρμα χωρίς επιλογές για αυτόν τον σκοπό.
3. Στο «Αλλαγή τιμής στο POS» διάλεξε «Ναι» για ενεργοποίηση ή «Όχι» για απενεργοποίηση. «Χωρίς αλλαγή» διατηρεί την άδεια. Στη λειτουργία όλων πρέπει να επιλέξεις ρητά Ναι/Όχι· εκεί αλλάζει μόνο αυτή η άδεια. Πάτησε μία φορά Καταχώρηση και περίμενε την επιβεβαίωση.
4. Άνοιξε ξανά την καρτέλα του προϊόντος για επιβεβαίωση του υπάρχοντος κουτιού. Αν ο κατάλογος χρειάζεται επαναφόρτωση μετά το κλείσιμο καρτέλας, χρησιμοποίησε Ανανέωση. Για παλιά ανοιχτή έκδοση κάνε κανονική ανανέωση/Ctrl+F5. Επιστροφή απορρίπτει την τρέχουσα φόρμα.

Η άδεια είναι κοινό στοιχείο της εταιρικής καρτέλας και ισχύει όπου χρησιμοποιείται το ίδιο προϊόν. Δεν ορίζει νέα τιμή. Το POS εξακολουθεί να απαιτεί τα ήδη ισχύοντα δικαιώματα χειριστή «Αλλαγή τιμής λιανικής». Backend ρόλοι OWNER/ADMIN/MANAGER/SUPER_ADMIN με ενεργό INVENTORY, εταιρεία και επιλεγμένο κατάστημα ελέγχονται όπως πριν· STORE_OPERATOR δεν μπορεί να κάνει bulk edit. Αν δεν επιτρέπεται αλλαγή από το POS, έλεγξε τόσο το κουτί όσο και το δικαίωμα του χειριστή.

Κριτήριο του πραγματικού PASS: ακριβώς δύο Audit, false→true→false, τιμές1.20/stock1 και control4, κινήσεις/43βάρδιες/ledger/πωλήσεις/πληρωμές αμετάβλητα. Η αποδοχή603ειδών/πολλών σελίδων/ανενεργών, tenant isolation, idempotency και rollback έχει native CI τεκμήριο, όχι μαζικό live PASS. Φυσικές συσκευές/κινητό και πραγματικά καταστήματα δεν εξετάστηκαν εδώ. Προγενέστερα PASS και άλλες αναθέσεις δεν αλλάζουν. Checkpoint2026-10-31-inventory-bulk-pos-price-permission.md και evidence/inventory-bulk-pos-price-20261031.

## 22/10/2026 — KAT 38 old-card retirement / LIMITED LIVE CONFIGURATION PASS

Completed owner-authorized removal of exact38old/test cards from active KAT catalog. Authorized SuperAdmin selected Κυλικείο ΚΑΤ → Εμπορική λειτουργία → Λοιπές εμπορικές λειτουργίες → Αποθήκη, searched exact reviewed identities, selected only26/9/3manifest rows → Ομαδική διόρθωση → Κατάσταση καταστήματος=Ανενεργά; all other fields Χωρίς αλλαγή, SETunchecked → Καταχώρηση once/group. Native active lists remove them; independent readback/audit confirms all38StoreProduct.active=false while Product/history/stock/prices/VAT/departments remain. No permanent deletion, stock movement or financial action.

Active KAT rows1825, zero missing joined fiscal departments;242button identities/layoutv3702 and57coffee fee links retained.38residual is closed; do not repeat retirement or map old cards. Inactive-only archive filter did not expose these store-inactive/Product-active TEST cards in this observation; restoration through that filter is NOT verified. Keep historical records and inspect full-list/card/store state if restoration is later requested. Physical fiscal first receipt is still outside this configuration PASS. Checkpoint2026-10-22-kat-missing-fiscal-mappings.md and measured kat-retire38-20261022 evidence authoritative.

## 22/10/2026 — Real KAT blank fiscal mapping repair / LIMITED LIVE CONFIGURATION PASS

Already applied to57reviewed existing KAT cards:51modern beverages plus6old exact source counterparts. Owner/SuperAdmin used selected Κυλικείο ΚΑΤ Inventory → exact SKU/row selection → Ομαδική διόρθωση → existing source-confirmed department with unchanged13% → allother fields Χωρίς αλλαγή, SETunchecked → one Καταχώρηση per identified group. Native saved display and independent protected-field readback agree. Do not repeat this configuration.

All242published POS-button identities now have a joined fiscal department;57coffee fee links and layoutv3702 retained. Refresh each physical POS catalog before legitimate use. This entry does not certify physical cash/card/receipt or all-store operation.38old/test active cards still lack reviewed mapping; avoid selling those until exact original department/exemption resolves. Never infer mapping only from VAT percentage, change old24%to13%, verify0%exemption blindly, or reset stock. Exact residuals and timestamps in2026-10-22-kat-missing-fiscal-mappings.md/evidence final-summary.json. If native response is uncertain, inspect saved state before any retry.

## 22/10/2026 — Missing VAT department: LIMITED LAB SAVE PASS

Authorized SuperAdmin/Owner opens explicitly selected company/store → Εμπορική λειτουργία → Λοιπές εμπορικές λειτουργίες → Αποθήκη. Search reviewed exact identities, verify selected-row count, choose Ομαδική διόρθωση and one existing active company Τμήμα ΦΠΑ with the SAME current rate. Keep category/subcategory/retail/activation unchanged and SET unchecked. Review register/code/semantic source mapping, save once, then verify saved department and unchanged prices/stocks. Do not map only by percentage or automatically verify0% exemption.

Observed22Oct20:30Athens in synthetic LAB: one existing LAB-CAFE-20260927 null→01.ΚΑΦΕΣ/register1/code1/13%; vatVerified true, rate13/retail1/stock-2/all other product/store fields unchanged. KAT1900 rows and LAB/N40/KAT finance, shifts, movement and layout controls unchanged. No sale or fiscal transaction. This PASS does not cover price/merge/0% exemption/physical receipt or real KAT configuration. On timeout inspect persisted state before retry. Checkpoint2026-10-22-kat-missing-fiscal-mappings.md and measured lab.json authoritative.

## 21/10/2026 — Real KAT coffee fee configuration / LIMITED LIVE PASS

Authorized owner/SuperAdmin uses the explicitly selected Κυλικείο ΚΑΤ Inventory bulk SET workflow documented below. It is already applied:57 prepared-coffee identities now associate existing KAT-32944 qty1/0.05;36 identical embedded preparation fees cleared. Preserve7inactive, two excluded raw capsules, base prices/VAT/departments and all stocks. Do not run the configuration/import again. Cashier refreshes POS catalog before use; coffee adds its separate0.05 line automatically and parent qty/removal controls its quantity, as measured in the prior LAB acceptance (1.65+0.05=1.70).

Native real configuration and complete independent readback21Oct15:17–15:20UTC PASS with0protected-field mismatches; no KAT sale/payment/order/stock movement or shift opened. Reopened FREDDO ESPRESSO SET card independently displays saved1/0.05. Physical fiscal checkout/mobile/wider readiness remain NOT TESTED. If missing, refresh catalog and inspect selected store/product/link; preserve saved configuration and inspect state before any retry. Never change base prices or VAT to compensate. Checkpoint2026-10-20-kat-coffee-environmental-fee.md, evidence09–13 and kat-freddo-saved-fee.jpg authoritative; LIVEa436c9981e1ffa72f9006b5964ab6a7dd2b8536e.

## 21/10/2026 — SET environmental fee / LIMITED LAB PASS

Authorized owner/SuperAdmin opens the explicitly selected store's Εμπορική λειτουργία → Λοιπές εμπορικές λειτουργίες → Αποθήκη. Select exact reviewed parent products; Ομαδική διόρθωση → enable SET → choose existing same-store fee, quantity1 and current0.05 price. Keep other fields Χωρίς αλλαγή. If replacing the same embedded preparation fee, select its explicit removal option, review identities and confirm once. Verify saved links and unchanged price/VAT/activation/stock before continuing. Never apply by a coffee-name substring or transfer LAB fixtures to a real store.

Actual LAB21Oct: two synthetic coffees linked to one0.05 fee; matching embedded fee cleared atomically, preparation station/autoPrint retained. Cashier LAB POS2 added A1.65: separate fee0.05,total1.70; qty2→3.40; second coffee2.00→sharedfee3,total5.45; remove first→2.05; remove last→empty0.00. Child quantity controls are disabled; adjust/remove parent. No checkout/payment/preparation submission. Existing catalog, financial, shift and stock controls unchanged across the sequence; first add/qty change have no intervening DB sample, so individual financial attribution is NOT TESTED.

Scope is Cloud Chrome LAB cart and bulk configuration on LIVE a436c9981e1ffa72f9006b5964ab6a7dd2b8536e. Real KAT configuration, mobile/hardware/fiscal payment are not included. If stale-price/store/confirmation validation fails, refresh selected store and inspect saved state before retry; do not create duplicate fee products or repeat a completed transaction. Checkpoint2026-10-20-kat-coffee-environmental-fee.md and evidence kat-coffee-fee-20261021 authoritative.

## 20/10/2026 - KAT zero restored after a later historical recipe movement

After the earlier zero, startup recorded a missing-18recipe consumption for an August20order against KAT-44334. Preserve the original movement/order; the owner-authorized zero was restored through one separate single-line FREE stocktake, producing one+18audited adjustment. Stocktake1d984157-4249-42e0-81be-048dd61274c4 is FINALIZED;1900/1900stocks are0. KAT product/financial/prior-movement controls match; another store had three independent sales during the control window, so global isolation is not claimed. Historical backfill cutoff/rebinding remainsOPEN. Do not repeat this finalized action. Checkpoint2026-10-20-kat-stock-historical-repair.md and stock-repair-verification.json record exact limits.

## 20/10/2026 - Real KAT stock zero operation

After explicit owner instruction all1900KAT store-product stocks are0, confirmed by independent DB readback. Native Inventory2.0 FREE stocktake066a1fa2-ac14-47c6-9b10-f7ab2421e323 finalized once: only23previously nonzero active items counted0, generating23audited adjustments with exact inverse quantities. Allother stocks already0, includinginactive products. Product prices/VAT/metadata, other stores and prior financial/movement history unchanged. The prior full1866-row bulk count returned internal error and persistednothing; large-list reliability remainsOPEN, do not claim it passed. Use measured before/after, preserve audit and inspect persisted state before retries. See2026-10-20-kat-stock-zero.md and zero-verification.json.

## 20/10/2026 - Real KAT catalogue import accepted

The approved1766-row KAT catalogue was imported once through the selected real store normal Excel UI. Preview1766/1753CREATE/13UPDATE/0INVALID; independent complete source readback PASS:1981aliases,28categories,113subcategory pairs,1765PIECE/1KG, exact original prices/VAT/fiscal identities and source relationships. All13existing IDs and stock retained; all new initial stock0. Four previously inactive legacy coffees stay inactive. Preserve canonical recipes and pre-existing store items. Store total1900 includes preserved pre-existing items. Financial/stock movements and10fiscal departments unchanged. Do not repeat the consumed import or blindly refresh its identity manifest. Later0.50EUR mobile-card service SET remains pending. See2026-10-20-kat-real-import-pass.md and real-verification.json.

## 20/10/2026 - Explicit KAT source profile: bounded virtual LAB PASS

Super Admin, Owner or company Admin may open the selected store's Εμπορική λειτουργία → Λοιπές εμπορικές λειτουργίες → Αποθήκη → Εισαγωγή από Excel. Verify the displayed company/store, choose the approved workbook with first sheet ΚΑΤ_IMPORT and company/store-bound KAT_META, and keep Ενημέρωση stock και στα υπάρχοντα είδη unchecked. Run Προεπισκόπηση χωρίς καταχώρηση; all rows must be OK before one Τελική εισαγωγή. Do not click import again to obtain evidence; inspect the existing result and persisted products.

Verified only in virtual MYWORKSTATION LAB/ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ on exact healthy d8142d55c376574f6a0b6ab35b611a2dc3bdcc97: actual3-row preview2CREATE/1UPDATE/0INVALID and one final import; KG and PIECE preserved, six-decimal cost exact, existing product ID/stock retained, four text scan aliases including leading zeros preserved, two distinct register6 identities resolved, 0%card remains vatVerifiedfalse. Full before/after hashes prove original99product/stock rows, all financial/movement records and17departments unchanged. No financial or fiscal transaction. Preparation added only seven missing KAT tuples, retained all10previous departments and all controls.

KAT requires nine exact register+legacycode+rate+commerce identities; preserve existing native display aliases. Do not map by rate/register alone or copy DAILY exemption27. Prepared existing updates require exact ID, old SKU and current full product/barcode fingerprint, same company/store and matching unit. Stale, foreign, busy or ambiguous rows refuse atomically; obtain a fresh preview and investigate business changes before refreshing a fingerprint. Preserve deliberately inactive legacy products and all existing recipes/modifiers. New initial stock0, existing stock preserved. A failed/uncertain UI response requires independent readback before another final action.

Limits: real1766catalogue import and physical fiscal readiness are NOT TESTED by this entry. No old accepted DAILY/Diadochou test is repeated. Real-import owner retained in tracker/pending roadmap. Checkpoint2026-10-20-kat-profile-lab-pass.md and its measured evidence are authoritative.

## 18/10/2026 12:38 Europe/Athens — Ίδιος προμηθευτής στη συγχώνευση: περιορισμένο USER PASS

Ο ιδιοκτήτης επιβεβαίωσε «ΕΙΝΑΙ ΟΚ» μετά την παράδοση της διόρθωσης και την οδηγία νέας προεπισκόπησης. Το PASS αφορά την άρση του λανθασμένου αποκλεισμού για ίδιο προμηθευτή με ίδιο κωδικό. Η έκδοση9c515f0d είχε επαληθευτεί κεντρικά17Oct23:00/23:06· ο browser, ρόλος και client revision της δήλωσης δεν μετρήθηκαν ανεξάρτητα.

1. Εξουσιοδοτημένος OWNER/SUPER_ADMIN με τα υφιστάμενα δικαιώματα INVENTORY ανοίγει το σωστό εταιρικό κατάστημα → Αποθήκη → επιλέγει2–4 καρτέλες του ίδιου προϊόντος και συσκευασίας → Συγχώνευση ειδών.
2. Επιλέγει την καρτέλα και την τιμή που θέλει να κρατήσει και πατά «Προεπισκόπηση συγχώνευσης». Η κοινή σύνδεση με ίδιο προμηθευτή/ίδιο κωδικό δεν αποκλείει πλέον μόνη της την προεπισκόπηση.
3. Ελέγχει την επιλεγμένη καρτέλα, τιμή, barcode και τρέχον τελικό απόθεμα πριν από οποιαδήποτε τελική επιβεβαίωση. Η προεπισκόπηση δεν εκτελεί συγχώνευση.

Τα όρια εταιρείας/καταστήματος/ρόλου και οι πραγματικές εκκρεμότητες παραμένουν. Αν εμφανιστεί διαφορετικός μη κενός κωδικός ή σύνδεση εκμάθησης τρίτου προϊόντος, χρειάζεται έλεγχος των καρτελών· δεν παρακάμπτεται η προστασία και δεν ξαναπερνιέται τιμολόγιο. Η διατήρηση ιστορικού/αντιστοιχίσεων και οι τελικές atomic πράξεις ελέγχθηκαν στο απομονωμένο CI, χωρίς να εξισώνονται με αυτή τη δήλωση χρήστη. Εκτελεσμένη τελική συγχώνευση, μετρημένες αλλαγές stock/πληρωμών και φυσική αποδοχή παραμένουν NOT TESTED από αυτό το PASS. Checkpoint CHECKPOINTS/CHANGES/2026-10-17-inventory-supplier-link-merge.md.

## 17/10/2026 21:54 Europe/Athens — Ιστορικό παραστατικό POS στη συγχώνευση: περιορισμένο USER PASS

Ο ιδιοκτήτης δήλωσε «ΝΑΙ ΕΙΝΑΙ ΟΚ» μετά την οδηγία ανανέωσης και νέας προεπισκόπησης της αρχικής επιλογής. Επιβεβαιώνεται μόνο η άρση του λανθασμένου αποκλεισμού από το ήδη καταχωρημένο αρχικό POS παραστατικό. Η διορθωμένη4490e075 είχε επιβεβαιωθεί κεντρικά στις21:46· ο browser/revision του χρήστη δεν μετρήθηκε ανεξάρτητα τη στιγμή της δήλωσης. Δεν τεκμηριώνεται εκτελεσμένη συγχώνευση ή αποτέλεσμα σε αποθήκη/πληρωμές.

1. Εξουσιοδοτημένος OWNER/SUPER_ADMIN ανοίγει το σωστό κατάστημα → Αποθήκη → επιλέγει2–4 ίδια είδη → Συγχώνευση ειδών.
2. Επιλέγει την καρτέλα που θα κρατηθεί και πατά Προεπισκόπηση συγχώνευσης. Ένα ιστορικό POS source με πλήρη σύνδεση προς ήδη εγκεκριμένη καταχώριση ίδιας εταιρείας/καταστήματος δεν αντιμετωπίζεται πλέον ως εκκρεμές πρόχειρο.
3. Ελέγχει τιμή, barcode και τρέχον τελικό απόθεμα πριν από οποιαδήποτε τελική επιβεβαίωση. Η προεπισκόπηση δεν συγχωνεύει καρτέλες.

Τα πραγματικά πρόχειρα, εκκρεμείς κινήσεις και οι λοιποί κανόνες εταιρείας/καταστήματος/ρόλου παραμένουν. Αν υπάρχει διαφορετικό μήνυμα, χρειάζεται ο αντίστοιχος έλεγχος· δεν διαγράφεται ούτε ξανακαταχωρίζεται το ιστορικό τιμολόγιο για να παρακαμφθεί. Η μεταγενέστερη περίπτωση ίδιου προμηθευτή έχει χωριστό περιορισμένο USER PASS18Oct12:38 στην παραπάνω καταγραφή. Πραγματική τελική συγχώνευση, μετρημένο πριν/μετά/άλλο ταμείο και φυσικές συσκευές παραμένουν NOT TESTED από αυτή την επιβεβαίωση. Checkpoint CHECKPOINTS/CHANGES/2026-10-17-inventory-posted-source-blocker.md.

## 15/10/2026 23:26–23:27 — Συγχώνευση με ανοιχτή βάρδια: περιορισμένο LIVE PASS προεπισκόπησης

Επαληθεύτηκε στην ακριβή έκδοση779e397e, SuperAdmin/Chrome6, MYWORKSTATION LAB → ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ. Η ανοιχτή MAIN βάρδια παρέμεινε ανοιχτή και η προεπισκόπηση επέστρεψε χωρίς blockers για την εξετασμένη επιλογή, παρότι υπάρχουν άλλες ανοικτές παραγγελίες. Ο αρχικός γενικός κανόνας κλειστών βαρδιών δεν ισχύει. Τα δικαιώματα OWNER/SUPER_ADMIN, INVENTORY και η επιλογή του σωστού εταιρικού καταστήματος διατηρούνται· άλλοι ρόλοι δεν έχουν νέα LIVE αποδοχή.

1. Άνοιξε το σωστό κατάστημα → Εμπορική λειτουργία → Λοιπές εμπορικές λειτουργίες → Αποθήκη. Διάλεξε2–4 καρτέλες και Συγχώνευση ειδών.
2. Διάλεξε την καρτέλα που θα κρατήσεις → Προεπισκόπηση συγχώνευσης. Η οθόνη αναφέρει «Η ανοιχτή βάρδια επιτρέπεται». Ελέγχθηκαν καρτέλες, τιμές, barcode και τελικό απόθεμα χωρίς γενικό αίτημα κλεισίματος.
3. Έλεγξε ότι οι καρτέλες είναι πραγματικά το ίδιο προϊόν και ίδια συσκευασία. Οι διαφορετικές συσκευασίες7UP που χρησιμοποιήθηκαν ως μη επιβεβαιωμένο δείγμα οθόνης ΔΕΝ συγχωνεύτηκαν και δεν προτείνονται για συγχώνευση.
4. Επιστροφή απορρίπτει την προεπισκόπηση. Αιτιολογία/checkbox/τελική Επιβεβαίωση δεν υποβλήθηκαν σε αυτό το LIVE PASS. Σχετικές εκκρεμότητες των επιλεγμένων ειδών ή ασύμβατες συνδέσεις παραμένουν λόγοι ελέγχου. Εκκρεμή πληρωμή/απόδειξη ολοκλήρωσέ την στην κανονική ροή· δεν χρειάζεται να κλείσεις όλη τη βάρδια. Οι ειδικοί αυτοί αποκλεισμοί δοκιμάστηκαν στην απομονωμένη βάση τουCI.

Μετά από πραγματική συγχώνευση, η νέα οδηγία ζητά ανανέωση καταλόγου σταPOS και νέα προσθήκη είδους αν παλιό καλάθι παραπέμπει στην αρχειοθετημένη καρτέλα. Η προστασία παλιού καλαθιού/ταυτόχρονης συναλλαγής δοκιμάστηκε σε απομονωμένη βάση και στον κεντρικό έλεγχο· δεν αποτελεί φυσικό/πραγματικό POS PASS.

Όρια:98πλήρεις γραμμές ίδιες πριν/μετά, φρέσκια βάρδια9.40μετρητά/0κάρτες/0IRIS/2.20σύνολο/3κινήσεις και αρχική τελευταία κίνηση ίδια. Δεν εκτελέστηκε τελική συγχώνευση, τιμή, είδος, stock, πληρωμή, κλείσιμο ή ακύρωση. Πραγματική μετρημένη τελική πράξη/έλεγχος άλλου τερματικού, φυσικές συσκευές/mobile/offline/άλλοι ρόλοι παραμένουν χωριστή αποδοχή στον ίδιο owner. Checkpoint2026-10-15-inventory-merge-24h.md και screenshot CHECKPOINTS/EVIDENCE/inventory-merge-24h-20261015/preview.jpg.

## 15/10/2026 — Αρχείο ειδών: περιορισμένο LIVE PASS κύλισης, επιλογών και προεπισκόπησης συγχώνευσης

Επαληθεύτηκε στην έκδοσηea91dd58, από SuperAdmin στο MYWORKSTATION LAB → ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ, Chrome1363x936. Αφορά οθόνη/επιλογές και ανάγνωση προεπισκόπησης. Η καταχώρηση διατηρεί τα υπάρχοντα OWNER/SUPER_ADMIN και INVENTORY δικαιώματα· δεν δόθηκε νέα πρόσβαση. Άλλοι ρόλοι/φυσικές συσκευές δεν έχουν νέα LIVE επαλήθευση.

1. Ανανέωσε και επίλεξε ρητά το σωστό κατάστημα → Εμπορική λειτουργία → Λοιπές εμπορικές λειτουργίες → Αποθήκη. Η στήλη Τμήμα ΦΠΑ εμφανίζεται δίπλα στην Περιγραφή. Αν λείπει mapping, αναφέρεται Δεν έχει οριστεί, χωρίς αυτόματη αντιστοίχιση μόνο από το ποσοστό.
2. Η Οριζόντια κύλιση πάνω από τα κουμπιά μετακινεί τον ίδιο πίνακα. Δοκιμάστηκαν δεξί άκρο3690 και επιστροφή0. Κάθετο scrolling και μικρότερες οθόνες δεν αποτελούν νέο γενικό layout PASS.
3. Τσέκαρε τις επιθυμητές γραμμές → Ομαδική διόρθωση. Κατηγορία/Υποκατηγορία είναι λίστες ενεργής εταιρικής ταξινομίας του καταστήματος· η υποκατηγορία ακολουθεί την κατηγορία. Τμήμα ΦΠΑ επιλέγεται από πραγματικές ενεργές εγγραφές με ποσοστό και στοιχεία ταμειακής. Ελέγχθηκε ΑΝΑΨΥΚΤΙΚΑ→Αναψυκτικά και04.ΕΙΔΗ13/ταμειακή4. Αν τα στοιχεία ταμειακής λείπουν, χρειάζεται έλεγχος του εταιρικού καταλόγου. Η λιανική προσφέρει νέα τιμή/αύξηση/μείωση σε ευρώ ή ποσοστό. Χωρίς αλλαγή διατηρεί τα δεδομένα. Λιανική και ενεργότητα αφορούν το επιλεγμένο κατάστημα· ταξινομία/ΦΠΑ είναι κοινή εταιρική καρτέλα. Οι παραπάνω επιλογές εξετάστηκαν χωρίς Καταχώρηση· Επιστροφή τις απορρίπτει.
4. Για ανάγνωση συγχώνευσης, επίλεξε2–4 γραμμές → Συγχώνευση ειδών → διάλεξε ποια καρτέλα κρατάς → Προεπισκόπηση. Επαληθεύτηκαν δύο εμφανιζόμενες καρτέλες/τιμές, barcode και τελικό απόθεμα. Οι διαφορετικές συσκευασίες7UP ήταν μόνο μη επιβεβαιωμένο UI δείγμα και δεν συγχωνεύτηκαν. Πρέπει ο χειριστής να ελέγξει ότι πρόκειται πραγματικά για το ίδιο είδος.
5. Ιστορική παρατήρησηea91dd58: τότε υπήρχαν γενικοί αποκλεισμοί βάρδιας/παραγγελιών. Η απαίτηση κλειστής βάρδιας έχει καταργηθεί με τη νεότερη24h διόρθωση παραπάνω. Μην κλείσεις ή ακυρώσεις ξένη εκκρεμότητα για δοκιμή. Επιστροφή κλείνει την προεπισκόπηση χωρίς πράξη.

Όρια: οι98γραμμές SKU/όνομα/λιανική/stock/ΦΠΑ και η εμφανιζόμενη βάρδια παρέμειναν ίδιες. Δεν έγινε αποθήκευση τιμής/καρτέλας ή τελική συγχώνευση LIVE. Η atomic μεταφορά, τα αρνητικά υπόλοιπα, η διατήρηση ιστορικών IDs, η αποφυγή δεύτερης εφαρμογής και η πλήρης αναστροφή σε σφάλμα δοκιμάστηκαν στην απομονωμένη PostgreSQL τουCI· δεν αποτελούν πραγματικό stock/financial ή φυσικό POS PASS. Η υλοποίηση διατηρεί τα παλιά ιστορικά παραστατικά στις αρχικές καρτέλες, χωρίς αναδρομική επανεγγραφή αναφορών. Πραγματική μετρημένη εφαρμογή/συσκευές παραμένουν χωριστή αποδοχή στον ίδιο owner. Checkpoints2026-10-15-inventory-bulk-vat.md και2026-10-15-inventory-product-merge.md.

## 14/10/2026 — Φωτογραφία barcode στη νέα πλήρη καρτέλα: περιορισμένο LIVE PASS
Owner confirmation14Oct2026 12:13:27Athens: «einai ok» after live photo→lookup demonstration. Scoped USER acceptance of the delivered feature; no specific physical photo/mobile/creation/stock result inferred.



Ελέγχθηκε στην έκδοσηfca770d25b2586a914581f59dbebd5d0a5fdf6f9 από εξουσιοδοτημένο SuperAdmin με ασφαλή είσοδο/2FA στο MYWORKSTATION LAB → ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ. Αφορά επιλογή εικόνας, τοπική ανάγνωση barcode και υπάρχουσα αναζήτηση, χωρίς καταχώρηση προϊόντος. Τα υπάρχοντα δικαιώματα αποθήκης και η επιλογή εταιρείας/καταστήματος παραμένουν απαραίτητα· άλλοι ρόλοι/συσκευές δεν έχουν νέα φυσική επαλήθευση.

1. Ανανέωσε το πρόγραμμα και άνοιξε το σωστό κατάστημα → Εμπορική λειτουργία → Αποθήκη → Νέο είδος → Βασικά στοιχεία.
2. Πάτησε «Φωτογραφία barcode» δίπλα στην Αναζήτηση online και επίλεξε καθαρή JPG, PNG ή WebP όπου φαίνονται οι μπάρες του κωδικού. Υποστηρίζεται αρχείο έως20MB. Στην επαληθευμένη δοκιμή επιλέχθηκε PNG τυπικού EAN13 μέσω του κανονικού επιλογέα αρχείου.
3. Περίμενε «Διαβάστηκε barcode». Ο κωδικός συμπληρώνεται στο υπάρχον πεδίο και ξεκινά αυτόματα η αναζήτηση για το ίδιο επιλεγμένο κατάστημα. Παρατηρήθηκε5201399030219 και πραγματικό αποτέλεσμα Sticks Με Γεύση Τρούφα Και Τυρί/3αλφα/Open Food Facts.
4. Έλεγξε τον κωδικό και την ταύτιση της πρότασης. Η περιγραφή/τιμές/ΦΠΑ/απόθεμα δεν αλλάζουν από την ανάγνωση φωτογραφίας. Η «Χρήση διαθέσιμων στοιχείων» και η τελική Καταχώρηση παραμένουν ξεχωριστές υπάρχουσες ενέργειες του χειριστή, σύμφωνα με τις προηγούμενες οδηγίες της πλήρους καρτέλας.

Όρια: το παρατηρημένο LIVE δείγμα ήταν παραγόμενη εικόνα barcode, όχι φωτογραφία φυσικής συσκευασίας ή κάμερα κινητού. Κανένα νέο προϊόν/απόθεμα/πληρωμή δεν αποθηκεύτηκε· ανεξάρτητα hashes99προϊόντων/99αποθεμάτων/133συναλλαγών παρέμειναν ίδια. Δεν εγγυάται ότι κάθε προϊόν υπάρχει online. Αν δεν διαβάζεται ή δεν βρεθεί αποτέλεσμα, διάλεξε κοντινή καθαρή λήψη του ενός barcode ή γράψε τον κωδικό και συνέχισε χειροκίνητα. Μην αποθηκεύεις δεύτερο προϊόν αν η υπάρχουσα αναζήτηση αναφέρει ήδη καταχωρισμένο είδος. Η φυσική κάμερα/κινητό/άλλα είδη και η αποθήκευση νέου προϊόντος παραμένουν χωριστή αποδοχή, χωρίς επανάληψη πραγματικών συναλλαγών για τεκμηρίωση. Checkpoint2026-10-14-inventory-barcode-photo.md.

## 13/10/2026 23:57 — Πλήρης νέα καρτέλα και διάταξη: περιορισμένο LIVE UI PASS

Η νέα καρτέλα στο ίδιο LAB/Chrome ελέγχθηκε ξανά μετά ακριβές healthy dcb82ef και πράσιναPR2464/main/guardedRender. Η περιγραφή έχει κανονικό ύψος48px, η περιοχή barcode/προεπισκόπησης πιάνει ολόκληρη τη γραμμή και οι κάτω ενέργειες μένουν ορατές. Τα Βασικά στοιχεία έχουν κατηγορία/υποκατηγορία, εταιρεία, μονάδα/περιεκτικότητα, αγορά/λιανική/Margin/Markup, προσωπικού/delivery, ΦΠΑ, αρχικό απόθεμα, ελάχιστη παραγγελία, εκπτώσεις και επιλογές είδους. Barcodes/Κωδικοί προμηθευτών/Στατιστικά/Αγορές ανοίγουν στην ίδια νέα καρτέλα. Η πραγματική online πρόταση του5201399030219 επανελέγχθηκε στην τελική διάταξη.

Χρήση: ανανέωσε το πρόγραμμα, επίλεξε ρητά το σωστό κατάστημα → Αποθήκη → Νέο είδος. Γράψε barcode → Αναζήτηση online → έλεγξε ταύτιση → Χρήση διαθέσιμων στοιχείων. Συμπλήρωσε/έλεγξε τιμές, ΦΠΑ και stock εσύ. Αν δεν υπάρχουν ασφαλή γνωστά στοιχεία, κράτησε χειροκίνητη επιλογή. Για σύνθεση SET/Συνταγή χρειάζεται πρώτα η κανονική καταχώρηση του γονικού είδους και μετά άνοιγμα της αποθηκευμένης καρτέλας· νέες σχέσεις δεν δοκιμάστηκαν σε αυτό το PASS.

Αφορά διαθέσιμη/ευανάγνωστη οθόνη και ανάγνωση/μη αποθηκευμένη πρόταση. Δεν εκτελέστηκε Καταχώρηση ή stock/οικονομική πράξη στο πραγματικό LAB, ούτε φυσικός scanner/mobile/ανεξάρτητος OWNER. Η αποθήκευση/επανάληψη/rollback ελέγχθηκαν χωριστά σε απομονωμένη PostgreSQL του CI. Συνολικό creation/device scope παραμένει AWAITING USER· δεν αναφέρεται γενικό business PASS. Checkpoint2026-10-13-inventory-new-card-online.md.

## 13/10/2026 — Νέα πλήρης καρτέλα: περιορισμένο LIVE PASS αναζήτησης barcode

Παρατηρήθηκε σε Chrome, SuperAdmin → MYWORKSTATION LAB → ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ, έκδοση305e5bb, μετά greenPR2463/main/guardedrelease. Αφορά αποκλειστικά ανάγνωση/πρόταση και συμπλήρωση μη αποθηκευμένου ονόματος. Η εμφάνιση της περιοχής barcode χρειάζεται τη νεότερη διόρθωση πλέγματος· δημιουργία νέου είδους/κινήσεων και φυσικός scanner/mobile δεν αποτελούν LIVE PASS.

1. Άνοιξε το επιλεγμένο κατάστημα → Εμπορική λειτουργία → Λοιπές εμπορικές λειτουργίες → επίλεξε ρητά το σωστό κατάστημα → Αποθήκη → Νέο είδος.
2. Στα Βασικά στοιχεία γράψε barcode 6–18 ψηφίων και πάτησε Αναζήτηση online. Απαιτούνται τα υπάρχοντα δικαιώματα OWNER/SUPER_ADMIN και module INVENTORY. Η εταιρεία/το κατάστημα ελέγχονται από τον server.
3. Αν υπάρχει ήδη στην εταιρεία, εμφανίζεται το υπάρχον όνομα χωρίς αντιγραφή: ελέγχθηκε2900000000018/LAB EXCEL TEST2. Άνοιξε το υπάρχον είδος αντί δεύτερης εγγραφής.
4. Διαφορετικά μπορεί να εμφανιστεί πρόταση Master Catalog ή Open Food Facts. Ελέγχθηκε η πραγματική online πρόταση5201399030219/Sticks Με Γεύση Τρούφα Και Τυρί. Πάτησε Χρήση διαθέσιμων στοιχείων μόνο αφού ελέγξεις ταύτιση. Παρατηρήθηκε το όνομα στο μη αποθηκευμένο πεδίο· ο ΦΠΑ24 παρέμεινε ίδιος. Τιμές/ΦΠΑ/απόθεμα δεν τεκμαίρονται από online στοιχεία.
5. Αν δεν βρεθεί αποτέλεσμα, συμπλήρωσε χειροκίνητα. Δεν υπάρχει εγγύηση κάλυψης όλων των barcode. Κενές ή μη ταυτισμένες κατηγορίες/εταιρείες χρειάζονται δική σου επιλογή. Η Καταχώρηση είναι ξεχωριστή πράξη, δεν εκτελέστηκε σε αυτό το LIVE τεκμήριο.

Checkpoint CHECKPOINTS/CHANGES/2026-10-13-inventory-new-card-online.md. Συνολικό scope παραμένει OPEN μέχρι οπτική και πραγματική δημιουργία με ελεγχόμενα αποτελέσματα.

## 13/10/2026 — SET αναζήτηση και μεγαλύτερο παράθυρο: περιορισμένο USER PASS

Ο ιδιοκτήτης επιβεβαίωσε «EINAI OK» στις22:01 για εμφάνιση και αναζήτηση, μετά το verified LIVE5279a923. Επιτρέπεται στον ήδη εξουσιοδοτημένο Owner/Admin/Manager/SuperAdmin του επιλεγμένου καταστήματος, με τα υπάρχοντα δικαιώματα αποθήκης.

1. Ανανέωσε BackOffice → Αποθήκη και άνοιξε την επιθυμητή καρτέλα προϊόντος → SET.
2. Στο μεγαλύτερο παράθυρο γράψε τουλάχιστον2χαρακτήρες ονόματος, SKU ή barcode και επίλεξε ρητά το σωστό προϊόν από τα αποτελέσματα. Χρησιμοποίησε επόμενη σελίδα ή καθαρισμό επιλογής όπου χρειάζεται.
3. Έλεγξε το επιλεγμένο προϊόν. Σε μικρή οθόνη η σύνθεση/αποτελέσματα κυλούν εσωτερικά, ενώ οι κάτω ενέργειες παραμένουν ορατές.

Η αναζήτηση περιορίζεται στα ενεργά προϊόντα του επιλεγμένου καταστήματος και αποκλείει το ίδιο το γονικό προϊόν. Αν δεν υπάρχει αποτέλεσμα έλεγξε χαρακτήρες, ενεργό είδος και σωστό κατάστημα· μην δημιουργείς διπλό προϊόν. Η επιβεβαίωση αφορά εμφάνιση/αναζήτηση, όχι νέα αποθήκευση/διαγραφή συσχέτισης, ποσότητες, τιμές, απόθεμα, συνταγές ή χρήση SET στοPOS. Οι υπάρχοντες κανόνες αποθήκευσης παραμένουν. Φυσικό clientSHA/συγκεκριμένο query/device/όλοι ρόλοι δεν μετρήθηκαν. Checkpoint `2026-10-13-inventory-set-search.md`.

## 10/10/2026 — Νέα εγγραφή και σύνδεση barcode στην ίδια απογραφή: περιορισμένο LAB PASS

Ελέγχθηκε ζωντανά για εξουσιοδοτημένο Owner/SuperAdmin στο MYWORKSTATION LAB, έκδοση `689fe33b197c33009b3f4a1155e78cffd573973e`, στην κοινή προβολή κινητού/tablet της ενεργής απογραφής. Το κουμπί **+ Νέο είδος** ανοίγει πλήρη φόρμα. Μετά από μία αποθήκευση επιστρέφετε στην ίδια απογραφή με το νέο είδος επιλεγμένο για καταμέτρηση και τις προηγούμενες ποσότητες διατηρημένες.

1. Από https://myworkstation-app.onrender.com/platform-admin επιλέξτε το σωστό κατάστημα → Κεντρική Διαχείριση → Προϊόντα, Τιμές, Προσφορές & Απογραφή → Απογραφή. Ανοίξτε την υπάρχουσα **DRAFT** και, για την ίδια κινητή φόρμα, **Προβολή κινητού / tablet**.
2. Σαρώστε ή πληκτρολογήστε barcode. Αν δεν βρεθεί, εμφανίζονται οι επιλογές σύνδεσης υπάρχοντος και δημιουργίας νέου. Για υπάρχον προϊόν αναζητήστε όνομα/SKU/άλλο barcode και επιλέξτε το σωστό είδος· το νέο barcode συνδέεται στην ίδια εγγραφή. Στο δείγμα990101049001 βρέθηκε ξανά το υπάρχον TEST2 μετά από ανεξάρτητη επαναφόρτωση, χωρίς δεύτερο είδος ή γραμμή.
3. Για νέο προϊόν πατήστε **+ Νέο είδος** ή **+ Δημιουργία νέου είδους** από το άγνωστο barcode. Συμπληρώστε barcode, περιγραφή, ενεργή κατηγορία, ενεργό τμήμα ΦΠΑ, μονάδα, τιμή αγοράς και λιανικής. Στη δεύτερη διαδρομή το barcode είναι ήδη συμπληρωμένο. Η Ακύρωση επιστρέφει χωρίς αποθήκευση.
4. Πατήστε μία φορά **Αποθήκευση & επιστροφή στην απογραφή**. Ελέγξτε το μήνυμα επιτυχίας, το ίδιο όνομα απογραφής και το νέο επιλεγμένο είδος. Η ποσότητα της απογραφής συμπληρώνεται στη συνέχεια· η δημιουργία είδους έχει αρχικό απόθεμα0 και δεν γράφει κίνηση αποθήκης.
5. Με **Εμφάνιση όλων** ελέγξτε ότι διατηρήθηκαν οι προηγούμενες μετρήσεις. Στο δείγμα η μέτρηση TEST2=1 διατηρήθηκε, η πρόοδος έγινε1/2 και το νέο SKU100028977 έμεινε ακαταμέτρητο. Ανεξάρτητη επανάνοιξη, Archive barcode lookup και Full Audit επιβεβαίωσαν μία νέα εγγραφή και ένα PRODUCT_CREATE, με αμετάβλητα ταμεία και υπάρχον stock/ledger.

Η δημιουργία αφορά μόνο το κατάστημα της ανοικτής απογραφής και χρησιμοποιεί τα ενεργά τμήματα ΦΠΑ/κατηγορίες της εταιρείας. Αν barcode υπάρχει ήδη, επιλέξτε σύνδεση υπάρχοντος· μην δημιουργείτε δεύτερο είδος. Αν λείπουν ενεργές κατηγορίες ή τμήματα ΦΠΑ, διορθώστε πρώτα τον εταιρικό κατάλογο μέσω εξουσιοδοτημένου διαχειριστή. Σε σφάλμα ανανέωσης μετά από επιτυχημένη αποθήκευση, πατήστε **Επιστροφή στην απογραφή** για έλεγχο της ίδιας εγγραφής. Σε αβέβαιη απόκριση, αναζητήστε το barcode και ανανεώστε πριν από νέα υποβολή.

Αυτό το PASS αφορά το παραπάνω virtual Owner web δείγμα. Φυσικό κινητό/scanner/κάμερα/πραγματικό QR-PIN δίκτυο και άλλοι LIVE ρόλοι/tenant/races δεν ελέγχθηκαν. Δεν εκδόθηκε νέα πρόσβαση. Η δοκιμαστική N49 απογραφή παραμένει DRAFT, χωρίς οριστικοποίηση ή stock posting· μη διαγράφετε/οριστικοποιείτε το δείγμα για καθαρισμό. Προηγούμενα N39/Gate2/scroll PASS διατηρούνται. Τεκμήριο `CHECKPOINTS/CHANGES/2026-10-10-n49-unknown-barcode-acceptance.md`, εικόνα `CHECKPOINTS/EVIDENCE/n49-mobile-20261010/returned.jpg` και ανεξάρτητα CSV Audit στον ίδιο φάκελο.

## 10Oct2026 14:52 Athens — Αιτιολογημένη οριστικοποίηση και παλιά καρτέλα: LIVE PASS

Για εξουσιοδοτημένο Ιδιοκτήτη/Super Admin στο εικονικό LAB, έκδοση5dc10820082a570705616f163e8118c7ae4ba2a9. Συμφωνημένο υπόλοιπο39 ολοκληρώθηκε: υπάρχουσα RECOUNT-REASON-01 με θεωρητικό5/μέτρηση4 οριστικοποιήθηκε μία φορά14:49:05, stock4 και μία νέα κίνηση-1. Παλιό μολύβι4→3 απορρίφθηκε: «Η απογραφή δεν είναι ανοικτή.». Επανάνοιγμα FINALIZED/μόνο ανάγνωση/μέτρηση4, αιτιολογία διατηρημένη. Ledger4/4/διαφορά0/16κινήσεις/διπλές0 και δύο ταμεία αμετάβλητα.

1. Από https://myworkstation-app.onrender.com/platform-admin επιλέξτε το σωστό κατάστημα και Κεντρική Διαχείριση → Προϊόντα, Τιμές, Προσφορές & Απογραφή → Απογραφή.
2. Ανοίξτε την υπάρχουσα DRAFT, ελέγξτε θεωρητικό/μέτρηση/διαφορά και την απαιτούμενη επαναμέτρηση. Το μολύβι αντικαθιστά τη συνολική ποσότητα.
3. Συμπληρώστε Αιτιολογία οριστικοποίησης. Κενή αιτιολογία κρατά το κουμπί ανενεργό. Στο δείγμα αποθηκεύτηκε «N39-LAB-20261010-RECOUNT-REASON-01 · Επιβεβαιωμένη επαναμέτρηση 4 αντί 5.».
4. Πατήστε μία φορά Οριστικοποίηση & αποτέλεσμα απογραφής και επιβεβαιώστε. Ελέγξτε το αποτέλεσμα και Αποθήκη → Κινήσεις είδους: ίδια διαφορά, μοναδική κίνηση, σωστό υπόλοιπο.
5. Ανοίξτε ξανά την ίδια εγγραφή: FINALIZED, αιτιολογία ορατή, χωρίς καταμέτρηση/εισαγωγή/διόρθωση/διαγραφή/δεύτερη οριστικοποίηση. Αν παλιά καρτέλα απορριφθεί, ανανεώστε την ίδια εγγραφή· μη δοκιμάσετε ξανά την αλλαγή.

Τα company/store/role όρια παραμένουν υποχρεωτικά. Η δοκιμή πιστοποιεί αυτό το virtual Owner δείγμα και ολοκληρώνει το συμφωνημένο υπόλοιπο39 μαζί με προηγούμενα PASS. Άλλοι ρόλοι/tenant, early unresolved-close, Full Audit export, όλες οι race παραλλαγές και φυσικές/mobile/νέο πραγματικό κατάστημα παραμένουν NOT TESTED LIVE· οι native PG CI δοκιμές είναι χωριστές. TODAY-07 άλλου owner αμετάβλητο. Σε διαφορά κρατήστε ώρα/αναφορά/ledger και σταματήστε· μην επαναλάβετε επιτυχημένη κίνηση. Τα παλιά OPEN/native blocker παρακάτω είναι ιστορικά και αντικαθίστανται μόνο για το ολοκληρωμένο scope. Τεκμήριο CHECKPOINTS/CHANGES/2026-10-10-n39-recount-reason-live.md.

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

## 15/10/2026 — Τμήμα ΦΠΑ στην καρτέλα είδους: περιορισμένο LIVE PASS

Επιβεβαιώθηκε ως Super Admin στη Διαδόχου Παύλου, έκδοση7c4d3256. Στην Αποθήκη → Νέο είδος ή Διόρθωση είδους → Βασικά στοιχεία υπάρχει «Τμήμα ΦΠΑ». Επιλέγετε το πραγματικό ενεργό τμήμα της εταιρείας, με ονομασία/ποσοστό/αριθμό ταμειακής. Το «% ΦΠΑ» συμπληρώνεται από αυτό και δεν αλλάζει χωριστά. Ίδιο ποσοστό δεν σημαίνει ίδιο φορολογικό τμήμα. Χωρίς ενεργή επιλογή η καρτέλα ζητά επιλογή πριν καταχωρηθεί. Μετά την Καταχώρηση ανοίξτε ξανά την ίδια καρτέλα για επιβεβαίωση της επιλογής.

Ελέγχθηκε η νέα φόρμα χωρίς δημιουργία προϊόντος και μία πραγματική, ζητημένη διόρθωση υπάρχοντος Lay’s: κενό τμήμα→5.ΕΙΔΗ13/13%/ταμειακή5, αποθηκευμένο και επαναφορτωμένο· τιμή2€ και stock0 διατηρήθηκαν στις οθόνες, αλλαγή τιμήςPOS ενεργή. Δεν έγινε δοκιμαστική πώληση/απόδειξη ή κίνηση stock. Το PASS καλύπτει desktop επιλογή/μπλοκάρισμα ελλείποντος τμήματος/αυτόματο ποσοστό και υπάρχουσα αποθηκευμένη αντιστοίχιση· η πραγματική δημιουργία νέου είδους, φυσικόPOS, κινητό και άλλοι ρόλοι δεν πιστοποιούνται από αυτό το δείγμα. Η ατομική νέα δημιουργία/απομόνωση/rollback/replay ελέγχθηκαν χωριστά στο native CI. Τα υφιστάμενα δικαιώματα Inventory και όρια εταιρείας/καταστήματος παραμένουν.

Αν λείπει ο επιλογέας, κρατήστε πρώτα τυχόν μη αποθηκευμένη εργασία και ανανεώστε την εφαρμογή. Αν δεν εμφανίζεται σωστό ενεργό τμήμα, ελέγχεται η ρύθμιση της ίδιας εταιρείας στη Διαχείριση → Τμήματα ΦΠΑ· δεν επιλέγουμε τυχαίο τμήμα μόνο επειδή έχει ίδιο ποσοστό. Αλλαγμένο ποσοστό/ξένο/ανενεργό τμήμα απορρίπτεται στην αποθήκευση. Φορολογική εκτέλεση και πραγματική επιτυχία πώλησης είναι χωριστός έλεγχος. Checkpoint2026-10-15-product-card-vat-department.md.

## 20/10/2026 - ΚΑΤ: έξι πηγαία τμήματα ΦΠΑ, περιορισμένο LIVE configuration PASS

Επαληθεύτηκε μόνο η προσθήκη έξι ελλειπόντων ορισμών ως Super Admin από το επιλεγμένο Κυλικείο ΚΑΤ, μέσω Εμπορική λειτουργία → Λοιπές εμπορικές λειτουργίες → Διαχείριση → Τμήματα ΦΠΑ → Νέα εγγραφή. Διατηρούνται οι υπάρχοντες έλεγχοι εταιρείας/καταστήματος και δικαιωμάτων. Άλλοι ρόλοι και φυσική ταμειακή δεν δοκιμάστηκαν.

1. Επιβεβαιώστε το επιλεγμένο Κυλικείο ΚΑΤ και ελέγξτε πρώτα αριθμό ταμειακής, παλιό κωδικό, ποσοστό και Εμπορία. Το ίδιο ποσοστό ή ο ίδιος αριθμός ταμειακής δεν επαρκούν για ταύτιση. Ο αριθμός6 χρησιμοποιείται από δύο διαφορετικούς ορισμούς.
2. Οι έξι ήδη αποθηκευμένοι ορισμοί είναι: ΤΡΟΦΙΜΑ αριθμός4/κωδικός7/13%/Εμπορία ΝΑΙ, ΠΑΡΟΧΗ ΥΠΗΡΕΣΙΩΝ6/227/24%/ΟΧΙ, ΚΑΡΤΕΣ7/45/0%/ΝΑΙ, ΕΙΔΗ6 αριθμός8/104/6%/ΝΑΙ, ΠΕΡΙΒ. ΤΕΛΟΣ13/17/24%/ΟΧΙ και ΕΙΣΦ.ΠΡΟΣΤ.ΠΕΡΙΒΑΛΛ14/228/24%/ΟΧΙ. Δεν τους δημιουργούμε ξανά.
3. Μετά την Καταχώρηση εμφανίζεται επιτυχία· Ανανέωση και ανεξάρτητο readback επαληθεύουν10 συνολικά τμήματα:9 χρησιμοποιούμενες ταυτότητες πηγής και το προϋπάρχον Camel21. Τα τέσσερα παλιά τμήματα διατηρήθηκαν ολόκληρα, μαζί με τις ονομασίες τους.

Κριτήριο αυτού του περιορισμένου PASS: ακριβείς έξι νέες εγγραφές, τα τέσσερα παλιά τμήματα αμετάβλητα, ολόκληρα155Product/143StoreProduct ίδια πριν/μετά και165πωλήσεις/180πληρωμές/174κινήσεις/44βάρδιες/0ανοιχτές/213συναλλαγές αμετάβλητα. Δεν έγινε καταχώρηση προϊόντων, stock ή οικονομική/φορολογική πράξη. Render/public-health ανεξάρτητη παρατήρηση δείχνει healthy f2a3b79a145f7f80331280384066ec78c29ec230· η νέα εισαγωγή ΚΑΤ δεν είχε ακόμη διατεθεί/ελεγχθεί LIVE. Τεκμήρια CHECKPOINTS/CHANGES/2026-10-20-kat-import-auth-handoff.md και αντίστοιχα before/after JSON/εικόνα.

Όρια: αυτό δεν είναι PASS της οριστικής εισαγωγής, αντιστοίχισης φυσικής ταμειακής ή πώλησης0%· δεν επιλέχθηκε υποθετική εξαίρεση για τις κάρτες. Αν λείπει ή διπλασιάζεται ακριβής ταυτότητα, σταματάμε την εισαγωγή και ελέγχουμε το ίδιο κατάστημα, χωρίς να επιλέγουμε αυθαίρετο τμήμα ή να ξαναδημιουργούμε τους παραπάνω ορισμούς. Η διατήρηση κιλών/τεμαχίων, η τελική καταχώρηση και ο πλήρης έλεγχος καταλόγου απαιτούν την ξεχωριστή αποδοχή που παραμένει OPEN.
