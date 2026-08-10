# MyWorkStation — Immutable Project Checkpoint

**Ημερομηνία checkpoint:** 10/08/2026 20:45 Europe/Athens

Αυτό το αρχείο είναι σταθερό snapshot συνέχειας. Δεν πρέπει να διαγραφεί ή να αντικατασταθεί. Αν χαθεί/κολλήσει η συνομιλία, η νέα συνεδρία διαβάζει πρώτα αυτό το checkpoint και μετά το `docs/PROJECT_HANDOFF.md`.

## Απαράβατοι κανόνες έργου

- Μόνιμη βάση ανάπτυξης: TEST.
- Δεν ξαναφτιάχνουμε λειτουργίες που έχουν ήδη υλοποιηθεί/merged.
- Πραγματικά δεδομένα μόνο. Αν δεν υπάρχει πραγματική πηγή, εμφανίζεται `—`, `NOT_CONNECTED` ή σαφής ένδειξη αναμονής· δεν εφευρίσκονται ποσά, φορολογικά στοιχεία, MARK, Z ή provider status.
- SUPER_ADMIN = ιδιοκτήτης/διαχειριστής πλατφόρμας. ADMIN/OWNER = ιδιοκτήτης καταστήματος. POS/Store Operator = καθημερινός χειριστής.
- Kiosk Manager / RBS / CapDriver παραμένουν ξεχωριστά συστήματα/φορολογικοί μηχανισμοί. Το MyWorkStation δεν προσποιείται φορολογική λειτουργία χωρίς πραγματικό connector/provider.
- BackOffice visual baseline: light blue/gray background, λευκά rounded panels, navy ενεργά tabs, teal primary actions, ελληνικές ετικέτες. Δεν αντιγράφουμε την παλέτα του Kiosk Manager.
- Τα screenshots Kiosk Manager χρησιμοποιούνται για λειτουργία, σειρά πεδίων, tabs, context menus και κάτω κουμπιά. Τα χρώματα παραμένουν MyWorkStation.
- Τα κάτω κουμπιά που φαίνονται σε screenshot θεωρούνται βασικό μέρος της λειτουργίας και πρέπει να υλοποιούνται πραγματικά.
- Σε όλα τα text/number inputs ισχύει το global touch keyboard. Date/select/file/checkbox/radio παραμένουν native.
- Αποφεύγονται νέοι MutationObserver loops. Διατηρείται ο guarded `purchaseOrdersHostObserver` και τα report extensions χρησιμοποιούν event capture χωρίς νέο observer όπου έχει συμφωνηθεί.

## Live βάση πριν από αυτό το checkpoint

Τελευταίο live merge: **PR #119**, commit `4dcfa34f0f9b498b777c0528e196e56378b737f0`.
Render production: `https://myworkstation-app.onrender.com` — deployment του PR #119 ολοκληρώθηκε SUCCESS.

### Πρόσφατα ολοκληρωμένα PRs

- #95 — Fix browser freeze στα tabs Ανάλυσης Πωλήσεων.
- #97 — Από/Έως στην Ανάλυση Πωλήσεων, Kiosk-like criteria layout αλλά MyWorkStation colors.
- #98/#99 — Owner Έξοδα & Πληρωμές + SUPER_ADMIN access.
- #100/#101 — Kiosk Excel/CSV payments/expenses import + υποχρεωτικό read-only preview πριν import.
- #102 — Βάρδιες & Διαφορές με A/A, drill-down και πλήρη εξήγηση διαφοράς.
- #103 — Παραγγελίες & Αγορές, MarkUp ↔ Νέα Λιανική, barcodes, πρόταση/alarm stock.
- #104–#110 — Πλήρης Προμηθευτές, touch keyboard, runtime fixes, μεταφορά ειδών/κωδικών, global supplier reports, προβολή ειδών, ΔΟΥ/MYF.
- #111 — Πλήρης Πελάτες: κατάλογος, 3-tab pencil, addresses/other, right click + touch long press, receipts pencil, turnover, ledger, myDATA/provider NOT_CONNECTED.
- #112–#114 — Τιμοκατάλογος: τιμές, προσφορές φυλλαδίου, προσφορές/δώρα, χονδρική, λειτουργικά visible tabs, Kiosk-style κάτω actions και leaflet modal.
- #115 — Αναφορές base suite και Καταστροφές με Τιμή αγοράς + Σύνολο αγοράς.
- #116 — Audit Διαγραφών λίστας πώλησης + Απενεργοποιήσεων ειδών.
- #117 — Στατιστικά/Ανάλυση αποθήκης + lazy item movements.
- #118 — Στατιστικά πωλήσεων + ιστορικό κόστος στη στιγμή της πώλησης + lazy drill-down.
- #119 — Delivery report από πραγματικά `DispatchNote / DispatchNoteLine` + lazy line drill-down.

## Τρέχουσες λειτουργίες BackOffice που θεωρούνται υλοποιημένες

### Βάρδιες & Διαφορές
- φίλτρα Από/Έως, κατάστημα, κατάσταση, χειριστής.
- A/A, κατάστημα, χειριστής, έναρξη/λήξη, ταμείο, cash/card/EFTPOS, έξοδα, αναμενόμενο, παρέδωσα, διαφορά.
- drill-down tabs: ημερολόγιο κινήσεων, κατηγορία, τμήμα ΦΠΑ, συγκεντρωτικά, ανάλυση χρηματικού, διαφορά.
- χωρίς fabricated fiscal values.

### Παραγγελίες & Αγορές
- Παραγγελίες / Πρόταση / alarm Stock.
- Supplier/store/date/status/search filters.
- μολύβι order/line, supplier code, barcodes.
- quantity, unit price, gifts, discounts 1/2/3, EFK, VAT, totals, MarkUp, Νέα Λιανική.
- MarkUp ↔ Νέα Λιανική αμφίδρομα.
- finalize, email supplier, invoiced status, Excel/CSV.

### Προμηθευτές
- tabs Κατάλογος / Τιμολόγια / Πληρωμές / Αγορές / Πωλήσεις.
- edit modal, addresses, business units, other, DOU, MYF.
- right click / long press context menu.
- πληρωμή, balance adjustment, ledger, invoices month/year, receiving, value-only invoice, product catalog, deactivate.
- μεταφορά ειδών/κωδικών μέσω additive current mapping χωρίς rewrite ιστορικών αγορών.
- global supplier reports και item drill-down.

### Πελάτες
- tabs Πελατολόγιο / Εισπράξεις / Τζίρος / myDATA / Πάροχος.
- pencil → Βασικά στοιχεία / Διευθύνσεις / Λοιπά.
- right click ή 650ms long press context menu.
- είσπραξη, διόρθωση υπολοίπου, τζίρος μήνα/έτους, λογιστική καρτέλα, safe deactivate.
- receipt row pencil → πραγματική διόρθωση είσπραξης και atomic balance update.
- myDATA/provider: explicit NOT_CONNECTED έως πραγματική σύνδεση.

### Τιμοκατάλογος
- 4 λειτουργικά tabs: Έλεγχος τιμών πώλησης / Προσφορές φυλλαδίου / Προσφορές και δώρα / Τιμές χονδρικής.
- price checking: Margin, MarkUp, τελευταία αγορά, net/gross retail, VAT, category/subcategory, supplier, SKU.
- server pagination για μεγάλους καταλόγους.
- πραγματικό price audit.
- leaflet new-entry modal: είδος, barcode, subcategory, current/new price, discount, dates, bonus points.
- New Price ↔ Discount αμφίδρομα.
- κάτω actions θεωρούνται βασικά: Close / New entry / Edit / Import file όπου ισχύει / Excel / Refresh.

### Αναφορές
Υλοποιημένες πραγματικές αναφορές:
- Διαγραφές λίστας πώλησης (audit από ενεργοποίηση και μετά).
- Αλλαγές τιμών.
- Απενεργοποιήσεις ειδών (audit από ενεργοποίηση και μετά).
- Χρονολόγιο κινήσεων ειδών.
- Αναφορά τμημάτων.
- Παραστατικά.
- Απογραφές.
- Καταστροφές.
- Στιγμιότυπα αποθήκης.
- Στιγμιότυπα ανά είδος.
- Στατιστικά / Ανάλυση αποθήκης με lazy movement drill-down.
- Στατιστικά πωλήσεων με historical cost-at-sale και lazy sale-line drill-down.
- Delivery / Δελτία διακίνησης από DispatchNote / DispatchNoteLine.
- LogIn.

### Καταστροφές — σταθερή απαίτηση
Υποχρεωτικές στήλες:
- ημερομηνία,
- SKU,
- είδος,
- ποσότητα,
- **τιμή αγοράς**,
- **σύνολο αγοράς = ποσότητα × πραγματικό κόστος**,
- λιανική,
- χειριστής,
- κατηγορία/subcategory,
- προμηθευτής,
- κατάστημα,
- συνολικό άθροισμα αγοράς κάτω.

Κόστος: `StockMovement.unitCost` → τελευταία εγκεκριμένη αγορά πριν την καταστροφή → `Product.costPrice` fallback.

### Ζ / Ζ Ταμειακής
- Δεν έχει πραγματικά δεδομένα μέχρι πραγματική φορολογική πηγή/connector.
- Δεν δημιουργούνται fabricated Z values.

## Touch keyboard
Global touch keyboard ήδη ενεργό για όλα τα υπάρχοντα και μελλοντικά text/number inputs. Numeric layout για αριθμούς/tel, Greek/English για text. Native keyboard αποφεύγεται σε touch με inputmode policy. Δεν χρειάζεται να ξαναυλοποιηθεί σε κάθε module.

## Anti-freeze / performance
- Μην επαναφέρεις το MutationObserver loop που είχε προκαλέσει browser freeze.
- Το Sales Analytics freeze διορθώθηκε στο PR #95.
- Price Catalog χρησιμοποιεί server pagination.
- Reports stock/sales/delivery drill-downs φορτώνουν lazy.
- Supplier sales item detail φορτώνει lazy.
- Νέα extensions κατά προτίμηση event-capture / existing guarded observer, όχι νέος DOM observer.

## ΑΚΡΙΒΩΣ ΣΕ ΠΟΙΟ ΣΗΜΕΙΟ ΒΡΙΣΚΟΜΑΣΤΕ ΤΩΡΑ

Ο χρήστης ζήτησε, **πριν στείλει νέες φωτογραφίες**, να γίνει συνολικός έλεγχος χρωμάτων σε όλο το πρόγραμμα επειδή ορισμένες νεότερες σελίδες κράτησαν χρώματα του Kiosk Manager.

### Ενεργή εργασία: GLOBAL COLOR AUDIT

Στόχος:
- ελέγχουμε όλες τις BackOffice/Commerce σελίδες και modal CSS,
- αφαιρούμε Kiosk-like orange active tabs / έντονα Kiosk blues όπου δεν ανήκουν στο MyWorkStation theme,
- κρατάμε τη λειτουργική διάταξη των screenshots αλλά **όχι την παλέτα Kiosk Manager**,
- εφαρμόζουμε το `docs/BACKOFFICE_VISUAL_BASELINE.md`: light blue/gray background, λευκά panels, navy active tabs, teal primary actions,
- δεν αλλάζουμε business logic, δεδομένα, routes, calculations ή layout χωρίς ανάγκη.

### Ήδη εντοπισμένα color leaks πριν το checkpoint

Από τον κώδικα έχουν ήδη εντοπιστεί τουλάχιστον:
- `customer-control-suite.css`: `.cc-tabs button.active` και `.cc-detail-tabs button.active` χρησιμοποιούν orange `#ffc76d/#ffc86f`.
- `kiosk-reports-suite.css`: `.kr-tabs button.active` χρησιμοποιεί orange `#ffc978`, filters/panels χρησιμοποιούν έντονο Kiosk blue `#1475bd` και orange border `#ef9b20`.
- `supplier-global-reports.css`: selected row `#ffd18c`, totals border `#efb04f` — πιθανό Kiosk palette leak.
- νεότερα supplier tables χρησιμοποιούν `#2378c7` headers, που πρέπει να ελεγχθούν έναντι του MyWorkStation navy baseline.
- `price-catalog-controller-v2.css` έχει Kiosk-like strong blues και πρέπει να ελεγχθεί, παρότι το `price-catalog-suite.css` είναι πιο κοντά στο MyWorkStation baseline.

Δεν έχει ακόμη γίνει το final color-fix PR. **Αυτό είναι το αμέσως επόμενο task.**

## Μετά το color audit

Μόλις ολοκληρωθεί ο global color audit, περάσει CI, γίνει merge και Render SUCCESS, ο βοηθός πρέπει να πει ρητά στον χρήστη:

**«Ο ΕΛΕΓΧΟΣ ΧΡΩΜΑΤΩΝ ΟΛΟΚΛΗΡΩΘΗΚΕ — ΣΤΕΙΛΕ ΜΟΥ ΤΙΣ ΝΕΕΣ ΦΩΤΟΓΡΑΦΙΕΣ.»**

Τότε συνεχίζουμε screenshot-by-screenshot με τις νέες λειτουργίες.
