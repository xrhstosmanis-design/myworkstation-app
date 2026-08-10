# MyWorkStation checkpoint — Διαχείριση / Κατηγορίες ειδών

Ημερομηνία: 2026-08-10

## LIVE βάση

- PR #123: `Kiosk-style management categories and subcategories`
- Merge commit: `38bca367a1f408373b710067f1076bc4169119f8`
- CI #171: SUCCESS (tests + production build)
- Render production: SUCCESS
- Προηγούμενο checkpoint: PR #122 Αρχείο ειδών / Αποθήκη

## Νέο module Διαχείριση

Νέο κουμπί `⚙️ Διαχείριση` στις Λοιπές εμπορικές λειτουργίες.

Πρώτο ενεργό tab: `Κατηγορίες ειδών`.
Τα επόμενα tabs εμφανίζονται disabled μέχρι να δοθούν οι επόμενες Kiosk φωτογραφίες:
- Τμήματα ΦΠΑ
- Κατηγορίες εξόδων
- Εταιρείες
- Modifiers
- Κατηγορίες πελατών
- Επαγγέλματα
- Τράπεζες
- Τρόποι αποστολής
- PoS τερματικά

## Κατηγορίες

Split view όπως στο functional reference:
- αριστερά κατηγορίες,
- δεξιά υποκατηγορίες της επιλεγμένης κατηγορίας.

Κατηγορία:
- μολύβι → `Διόρθωση Κατηγορίας`,
- barcode/count → λίστα ειδών κατηγορίας,
- κάδος → safe soft deactivate,
- counts υποκατηγοριών / ειδών / % ειδών,
- κάτω actions: Κλείσιμο, Ανανέωση, Νέα εγγραφή, Excel/CSV.

## Υποκατηγορίες

Additive πραγματικό μοντέλο `ProductSubcategory` και `Product.subcategoryId`.
Δεν τροποποιείται το κεντρικό Master Catalog.

Ροές:
- Μεταφορά → επιλογή νέας κατηγορίας και πραγματική μεταφορά και των Product rows,
- Περιγραφή → `Διόρθωση υποκατηγορίας ειδών`,
- Barcode/count → λίστα ειδών υποκατηγορίας,
- property, points, PLU group, classification, e-shop code, active,
- safe soft deactivate.

## Προβολή ειδών

Server pagination έως 200 rows.
Πεδία από πραγματικές πηγές:
- περιγραφή,
- λιανική (store-specific όταν υπάρχει επιλεγμένο κατάστημα),
- κατηγορία,
- υποκατηγορία,
- τελευταίος εγκεκριμένος προμηθευτής,
- πραγματικό VAT rate,
- SKU.

Κάτω actions:
- Επιστροφή,
- Ανανέωση,
- Excel/CSV,
- Ομαδική διόρθωση / μεταφορά κατηγορίας-υποκατηγορίας.

## Ασφάλεια / anti-freeze

- SUPER_ADMIN / OWNER / ADMIN / MANAGER μόνο.
- Inventory module guard.
- company scoping.
- Δεν προστέθηκε νέος MutationObserver.
- Το suite εγκαθίσταται από το υπάρχον guarded commerce observer μέσω `installOperatorManagementSuite`.
- MyWorkStation navy `#123b5d` + teal `#0f766e`, όχι Kiosk colors.

## Επόμενο

Ο χρήστης στέλνει τις επόμενες φωτογραφίες της `Διαχείρισης` μία-μία. Να υλοποιείται κάθε επόμενο tab/flow πάνω σε αυτό το module χωρίς να ξαναγράφονται Κατηγορίες/Υποκατηγορίες.
