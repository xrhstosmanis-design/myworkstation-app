# PRE-KAT STEP 2C — POS Promotions / Offers

Ημερομηνία: 11/08/2026

Κατάσταση: **ΟΛΟΚΛΗΡΩΜΕΝΟ / LIVE**

- PR #137: `PRE-KAT store-scoped POS promotions and authoritative quote`
- Merge commit: `99566071bb199a45c807b4d635ecb45fb84913cc`
- CI #194: SUCCESS — security/regression tests + production build
- Render deployment `5848006727`: SUCCESS

## Τι κλειδώθηκε

- `PriceCatalogPromotionStore`: ρητή many-to-many στόχευση προσφοράς σε συγκεκριμένα ενεργά καταστήματα της ίδιας εταιρείας.
- Προσφορά χωρίς κανένα store assignment παραμένει BackOffice-only και δεν επηρεάζει καμία τιμή POS.
- Price Catalog: νέο action `🏬 POS` ανά Φυλλάδιο/Δώρο με επιλογή καταστημάτων και tenant validation.
- Χωρίς νέο MutationObserver: reuse του υπάρχοντος guarded `purchaseOrdersHostObserver`.
- Fresh startup bootstrap για `PriceCatalogPromotion`, `PriceCatalogPromotionStore`, `CustomerWholesalePrice` και `Customer.memberCard` compatibility.
- Κοινό server-side quote engine για `/quote`, HOLD και checkout.
- Server remains source of truth για τιμή/έκπτωση — ο client δεν στέλνει unit price.
- Deterministic precedence:
  1. ενεργή customer wholesale τιμή → κερδίζει και δεν stackάρει με retail promotion,
  2. αλλιώς αξιολογούνται ενεργές store-scoped LEAFLET/GIFT,
  3. εφαρμόζεται μία μόνο προσφορά, αυτή με το χαμηλότερο τελικό line total,
  4. ποτέ stacking δύο retail promotions.
- LEAFLET obeys `ManagementParameters.settings.backoffice.leafletOnlyWithCustomerCard` και απαιτεί πραγματική `Customer.memberCard` όταν η ρύθμιση είναι ενεργή.
- GIFT υπολογίζεται από πραγματική quantity και `saleQuantity + bonusQuantity`.
- POS ζητά authoritative quote σε αλλαγή καλαθιού/πελάτη, εμφανίζει `Χονδρική / Φυλλάδιο / Δώρο`, έκπτωση και τελικό σύνολο πριν την πληρωμή.
- Μικτή πληρωμή χρησιμοποιεί το ίδιο quoted total και πληρωμή μπλοκάρεται όσο το quote είναι pending.
- `Sale.subtotal`, `Sale.discount`, `Sale.total` και `SaleLine.discount/lineTotal` γράφονται από το server quote.
- Greek `datetime-local` promotion dates μετατρέπονται από `Europe/Athens` σε πραγματικό UTC instant, διορθώνοντας summer/winter Render timezone shift.

## Επόμενο

PRE-KAT STEP 2D — ασφαλείς ροές ακύρωσης, επιστροφής, ετεροχρονισμένης συναλλαγής και duplicate-similar-sale protection/audit, πριν το τελικό payments/cash acceptance.
