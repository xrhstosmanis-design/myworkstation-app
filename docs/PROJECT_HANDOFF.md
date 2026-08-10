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

Τελευταίο live πακέτο: **PR #121 — Modern BackOffice Home + Χειριστές**.
Merge commit: `107a533c5b2d88489ceffdab9fdc65709f9c77e8`.
CI #169: **SUCCESS** (306 tests + production build).
Render production: `https://myworkstation-app.onrender.com` — **SUCCESS** μετά το PR #121.

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
- **δεν προστέθηκε νέος MutationObserver**.
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

1. Ο χρήστης κάνει `Ctrl+F5` και δοκιμάζει τη νέα αρχική Εμπορικής λειτουργίας και το `👥 Χειριστές`.
2. Αν υπάρχει UI/runtime πρόβλημα, διορθώνεται ως μικρό hotfix χωρίς να ξαναγραφτεί το module.
3. Αν είναι σωστό, συνεχίζουμε με τις επόμενες Kiosk Manager φωτογραφίες.
4. Μελλοντικό operator hardening: granular permission enforcement στο Store Mode token/UI/API, μόνο όταν ζητηθεί/χαρτογραφηθεί πλήρως.
