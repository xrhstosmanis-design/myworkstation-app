# MyWorkStation — Permanent Project Handoff

Αυτό είναι το πρώτο αρχείο συνέχειας του έργου. Κάθε νέα συνεδρία το διαβάζει πριν αλλάξει κώδικα. Δεν ξαναφτιάχνουμε λειτουργίες που υπάρχουν ήδη.

## Ασφαλές checkpoint

Πλήρες immutable snapshot πριν από το color audit:
`docs/checkpoints/PROJECT_CHECKPOINT_2026-08-10_2045.md`

Το snapshot περιλαμβάνει αναλυτικά την κατάσταση μέχρι PR #119, τις λειτουργίες Προμηθευτών/Πελατών/Τιμοκαταλόγου/Αναφορών, touch keyboard, anti-freeze και real-data rules.

## Απαράβατοι κανόνες

- Μόνιμη βάση ανάπτυξης: TEST.
- Πραγματικά δεδομένα μόνο. Χωρίς fabricated ποσά, MARK, Z ή provider status.
- SUPER_ADMIN = platform owner/admin, OWNER/ADMIN = store owner/admin, POS/Store Operator = καθημερινός χειριστής.
- Kiosk Manager/RBS/CapDriver παραμένουν ξεχωριστά συστήματα.
- Kiosk screenshots = functional reference για πεδία/tabs/context menus/κάτω actions, **όχι color reference**.
- MyWorkStation palette: light blue/gray background, white rounded panels, **navy `#123b5d` active tabs/headers**, **teal `#0f766e` primary actions**.
- Global touch keyboard εφαρμόζεται σε όλα τα text/number inputs. Δεν δημιουργούμε δεύτερο keyboard.
- Δεν επαναφέρουμε MutationObserver/render loops. Διατηρείται ο guarded `purchaseOrdersHostObserver` και lazy drill-down/server pagination patterns.
- Κάθε ουσιαστική αλλαγή: branch → PR → CI → merge → Render SUCCESS.

## Τρέχουσα LIVE βάση

Τελευταίο live πακέτο: **PR #122 — Αρχείο ειδών (Αποθήκη)**.
Merge commit: `af062882cffb143b70403e73ff259301de400c8b`.
CI #170: **SUCCESS** (tests/security + production build).
Render production: `https://myworkstation-app.onrender.com` — **SUCCESS** μετά το PR #122.

### Ολοκληρωμένα πακέτα

- #95 freeze fix Sales Analytics.
- #97 Από/Έως Sales Analysis.
- #98/#99 Owner Expenses & Payments + SUPER_ADMIN.
- #100/#101 Excel/CSV import + preview-first.
- #102 Βάρδιες & Διαφορές.
- #103 Παραγγελίες & Αγορές, MarkUp ↔ Νέα Λιανική, barcode, stock proposal/alarm.
- #104–#110 Προμηθευτές, global touch keyboard, runtime fixes, transfer, reports, product catalog, DOU/MYF.
- #111 Πελάτες: 3-tab pencil, addresses, context menu/right-click/long-press, receipts edit, turnover, ledger, NOT_CONNECTED fiscal tabs.
- #112–#114 Τιμοκατάλογος: 4 functional tabs, price audit, promotions/gifts/wholesale, lower actions, leaflet modal.
- #115 Καταστροφές με Τιμή αγοράς + Σύνολο αγοράς και Reports base.
- #116 sale-list deletion/product deactivation audit.
- #117 Stock analysis + lazy movements.
- #118 Sales statistics + historical cost-at-sale + lazy detail.
- #119 Delivery report + lazy DispatchNoteLine detail.
- #120 Global color normalization στην εγκεκριμένη MyWorkStation navy/teal παλέτα.
- #121 Modern αρχική Εμπορικής λειτουργίας + πλήρες πρώτο module Χειριστών.
- #122 Πλήρες `Αρχείο ειδών (Αποθήκη)` με server pagination, πραγματικά κόστη/stock/πωλήσεις, edit, toolbar και preview-first Excel/CSV.

## Αρχείο ειδών (Αποθήκη) — LIVE από PR #122

Άνοιγμα:
`Λοιπές εμπορικές λειτουργίες → Αποθήκη`.

Η παλιά απλή σελίδα Αποθήκης παρακάμπτεται και ανοίγει το νέο πλήρες workspace `InventoryArchivePanel`.

Κριτήρια:
- Κατηγορία,
- Υποκατηγορία,
- Περιγραφή / SKU / Barcode,
- ενεργά / όλα / ανενεργά,
- 50 / 100 / 200 γραμμές ανά σελίδα.

Anti-freeze:
- server pagination από την αρχή,
- ποτέ μαζικό render δεκάδων χιλιάδων προϊόντων,
- βαριά δεδομένα αγοράς/πωλήσεων υπολογίζονται μόνο για την τρέχουσα σελίδα,
- κανένας νέος MutationObserver μέσα στο `InventoryArchivePanel`.

Πραγματικές πηγές:
`StoreProduct`, `Product`, `ProductBarcode`, `ProductCategory`, `MasterProduct`, `PurchaseDocumentLine`, `PurchaseDocument`, `Supplier`, `SaleLine`, `Sale`.

Grid πεδία:
- Εσωτερικός κωδικός / SKU,
- Barcode,
- Περιγραφή,
- Margin,
- Markup,
- Λιανική,
- efood / Wolt τιμές,
- Stock,
- συνολική αξία λιανικής stock,
- συνολικό κόστος stock,
- τελευταία αγορά,
- μέση αγορά 6μήνου,
- ημερομηνία τελευταίας αγοράς,
- βασικός προμηθευτής,
- ΦΠΑ,
- κατηγορία / υποκατηγορία,
- brand/company field όπου υπάρχει πραγματική πηγή,
- Alarm stock,
- πωλήσεις τελευταίων 15 ημερών,
- τελευταία πώληση,
- e‑Delivery / publish stock / publish prices flags,
- ενημέρωση,
- μονάδα,
- ID.

Cost priority στο archive:
**τελευταία εγκεκριμένη αγορά → μέση εγκεκριμένη αγορά 6μήνου → αποθηκευμένο `Product.costPrice`**.
Package purchase cost κανονικοποιείται σε κόστος ανά τεμάχιο όπου υπάρχει `unitsPerPackage`.

Κάτω βασικά κουμπιά:
- Κλείσιμο,
- Νέο είδος,
- Ομαδική διόρθωση,
- Παραγγελία,
- Εισαγωγή από Excel,
- Εκτύπωση,
- e‑Delivery.

Λειτουργίες:
- Μολύβι → πραγματική διόρθωση καρτέλας, store-specific λιανική και πραγματικό stock adjustment.
- Νέο είδος → `Product` + `StoreProduct`, προαιρετικό αρχικό stock.
- Ομαδική διόρθωση → κατηγορία / ΦΠΑ / λιανική / ενεργό.
- Παραγγελία → ανοίγει το ήδη υπάρχον πραγματικό module `Παραγγελίες & Αγορές`.
- Εκτύπωση → browser print view.
- e‑Delivery → υπάρχον πραγματικό Product delivery settings UI.

### Excel / CSV — preview-first

Routes:
- `POST /api/inventory-archive/import-preview` — **χωρίς write**,
- `POST /api/inventory-archive/import` — τελική εισαγωγή μετά από ρητή επιβεβαίωση.

Preview ταξινομεί κάθε γραμμή ως:
`CREATE`, `UPDATE`, `INVALID`.

Matching υπάρχοντος είδους:
SKU πρώτα, μετά Barcode.
Δεν δημιουργούνται phantom matches.

Για υπάρχοντα είδη το stock **δεν αλλάζει από προεπιλογή**. Αλλάζει μόνο αν ο χρήστης ενεργοποιήσει ρητά «Ενημέρωση stock και στα υπάρχοντα είδη».

Όριο εισαγωγής: έως 2.000 γραμμές ανά αρχείο.

Σημαντικό όριο της τρέχουσας έκδοσης:
- Το preview δεν κάνει ακόμη ξεχωριστή προειδοποίηση για διπλό SKU/barcode **μέσα στο ίδιο αρχείο**. Τα database unique constraints αποτρέπουν λανθασμένη εγγραφή, αλλά μελλοντικό hardening μπορεί να προσθέσει duplicate-row warning στο preview.

Κύρια αρχεία:
- `server/src/routes/inventory-archive.js`
- `server/src/routes/inventory-archive-import.js`
- `client/src/components/commerce/InventoryArchivePanel.jsx`
- `client/src/components/commerce/inventory-archive.css`
- `client/src/components/commerce/inventory-archive-delivery.css`
- `server/test/inventory-archive-kiosk-v1.test.js`

## Χειριστές — LIVE από PR #121

Νέο κουμπί `👥 Χειριστές` μέσα στις Λοιπές εμπορικές λειτουργίες. Χρησιμοποιεί πραγματικά `Employee` + `StoreOperatorCredential` δεδομένα ανά κατάστημα.

Κύρια οθόνη:
- username,
- όνομα,
- δικαιώματα/ρόλος,
- τηλ. σταθμού,
- κινητό,
- τελευταία είσοδος,
- ημερομηνία εγγραφής,
- αναζήτηση,
- toggle «Μόνο οι ενεργοί χειριστές».

Ενέργειες ανά γραμμή:
- μολύβι → καρτέλα χειριστή,
- κάδος → **soft deactivate** credential, ποτέ hard delete Employee,
- λουκέτο → αλλαγή PIN.

Κάτω βασικά κουμπιά:
- Κλείσιμο,
- Νέα εγγραφή,
- Ανανέωση,
- Εκτύπωση PIN.

### Μολύβι — 4 tabs

1. **Στοιχεία χειριστή**
   - όνομα, τηλέφωνα, μισθός/ωριαία τιμή,
   - πρόσβαση PoS / BackOffice,
   - ενεργός / Power User,
   - Διαχειριστής / Πωλητής,
   - Kiosk-style matrix λειτουργικών permissions,
   - τρόποι πληρωμής.
2. **Δικαιώματα πρόσβασης**
   - `backoffice μενού`,
   - `backoffice καρτέλες`,
   - αποθήκευση granular selections σε πραγματικό `StoreOperatorProfile`.
3. **Λοιπά**
   - customer display / VFD,
   - terminal PoS override,
   - cash limit,
   - σημειώσεις.
4. **Παραστατικά**
   - σειρά λιανικής πώλησης,
   - σειρά επιστροφής,
   - διεύθυνση/τηλέφωνο εγκατάστασης.

### PIN / ασφάλεια

- PIN αποθηκεύεται μόνο ως bcrypt hash (`pinHash`).
- Λουκέτο: νέο PIN + επαλήθευση, 4–8 ψηφία.
- Αλλαγή PIN προσπαθεί να ανακαλέσει υπάρχον ενεργό operator session.
- «Εκτύπωση PIN» **δεν μπορεί να διαβάσει παλιό PIN** επειδή είναι hashed. Δημιουργεί νέο ασφαλές 6ψήφιο random PIN, το αποθηκεύει hashed και εμφανίζει plaintext μόνο στο one-time print window.
- create/update/PIN/deactivate γράφουν `StoreOperatorAudit`.

Additive profile table:
`StoreOperatorProfile` με username/phones/hourlyRate, PoS/BackOffice/Power User, permissions JSON, backoffice menu/tabs, customer display, terminal override, cash limit, notes, document-series fields.

Access:
- SUPER_ADMIN / OWNER / ADMIN μόνο.
- store-scoped `STORE_MODE` module check.
- SUPER_ADMIN μπορεί να δουλεύει στο επιλεγμένο target store, χωρίς να παρακάμπτεται το store module entitlement.

Anti-freeze:
- **δεν προστέθηκε νέος MutationObserver** από το operator suite.
- `installOperatorManagementSafely()` τρέχει μέσα στον υπάρχοντα guarded `purchaseOrdersHostObserver`.

Σημαντικό όριο τρέχουσας έκδοσης:
- Τα granular checkbox permissions του νέου `StoreOperatorProfile` αποθηκεύονται πραγματικά και είναι έτοιμα για enforcement, αλλά **δεν πρέπει να ισχυριζόμαστε ότι κάθε μεμονωμένο checkbox ήδη κρύβει/μπλοκάρει όλες τις αντίστοιχες legacy routes/screens**. Το υπάρχον Store Mode token εξακολουθεί να έχει τον βασικό role-based permission μηχανισμό. Μελλοντικό βήμα: σύνδεση granular profile permissions στο token/UI/API enforcement.

## Modern αρχική Εμπορικής λειτουργίας — PR #121

Εφαρμόστηκε το σχέδιο που επέλεξε ο χρήστης:
- μεγάλο λευκό rounded commercial panel,
- καθαρό title/subtitle,
- μοντέρνα module tiles,
- navy active module,
- teal interaction accents,
- modern store selector,
- active / locked module cards με καθαρότερο spacing,
- χωρίς αλλαγή business logic στα υπάρχοντα modules.

CSS:
`client/src/components/commerce/commerce-home-modern.css`

## Σταθερή απαίτηση Καταστροφών

Πάντα: ποσότητα, **τιμή αγοράς**, **σύνολο αγοράς = ποσότητα × πραγματικό κόστος**, λιανική, χειριστής, category/subcategory, supplier, store και total purchase sum. Cost priority: `StockMovement.unitCost` → τελευταία εγκεκριμένη αγορά πριν την καταστροφή → `Product.costPrice`.

## Ζ / Ζ Ταμειακής

Δεν εμφανίζονται πραγματικά Z μέχρι πραγματική φορολογική πηγή connector/RBS/provider. Ποτέ fabricated Z.

## Global Color Audit — ΟΛΟΚΛΗΡΩΜΕΝΟ

Το PR #120 διορθώνει structural Kiosk-color leaks χωρίς αλλαγή λειτουργίας/layout. Canonical layer:
`client/src/components/commerce/myworkstation-global-theme-normalization.css`

Last-load bootstrap:
`client/src/theme-normalization-bootstrap.js`

Semantic warning/error/success colors **δεν** αφαιρέθηκαν. Κόκκινο/πράσινο/amber παραμένουν μόνο όταν έχουν πραγματική σημασία κατάστασης/προειδοποίησης.

## ΑΜΕΣΩΣ ΕΠΟΜΕΝΟ

1. Ο χρήστης κάνει `Ctrl+F5 → Λοιπές εμπορικές λειτουργίες → Αποθήκη` και ελέγχει το νέο `Αρχείο ειδών (Αποθήκη)`.
2. Αν υπάρχει UI/runtime πρόβλημα, διορθώνεται ως μικρό hotfix πάνω στο PR #122 baseline — δεν ξαναγράφουμε το module.
3. Αν είναι σωστό, συνεχίζουμε με τις επόμενες Kiosk Manager φωτογραφίες.
4. Μελλοντικό inventory hardening: duplicate SKU/barcode warning μέσα στο ίδιο Excel preview, μόνο αν χρειαστεί.
5. Μελλοντικό operator hardening: granular permission enforcement στο Store Mode token/UI/API, μόνο όταν ζητηθεί/χαρτογραφηθεί πλήρως.
