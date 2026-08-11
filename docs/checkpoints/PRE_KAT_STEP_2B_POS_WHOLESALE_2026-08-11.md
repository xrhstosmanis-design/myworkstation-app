# PRE-KAT STEP 2B — POS Customer Wholesale Pricing

Ημερομηνία: 11/08/2026

Κατάσταση: **ΟΛΟΚΛΗΡΩΜΕΝΟ / LIVE**

- PR #136: `PRE-KAT customer wholesale pricing in POS`
- Merge commit: `4ba6dcc75da1c50cadcba0178f7cab00ecce390f`
- CI #193: SUCCESS — security/regression tests + production build
- Render deployment `5847646540`: SUCCESS

## Τι κλειδώθηκε

- Ενεργή `CustomerWholesalePrice` εφαρμόζεται μόνο σε επιλεγμένο ενεργό πελάτη της ίδιας εταιρείας, ενεργό προϊόν και ενεργό StoreProduct του τρέχοντος καταστήματος.
- Server-side pricing source of truth: `WHOLESALE` όταν υπάρχει ειδική τιμή, αλλιώς store/product `RETAIL`.
- Checkout και HOLD χρησιμοποιούν την ίδια customer-aware resolver.
- `SaleLine.unitPrice` γράφεται από τον server. Ο client δεν μπορεί να επιβάλει unit price.
- Το POS φορτώνει και εμφανίζει τις ειδικές τιμές του επιλεγμένου πελάτη, με badge `Χονδρική`.
- Αλλαγή πελάτη ή `Χωρίς πελάτη` ξανατιμολογεί το καλάθι από base retail και δεν κουβαλά stale wholesale price.
- HOLD/restore επαναφέρει τον πελάτη και κάνει reprice με την τρέχουσα ενεργή χονδρική πριν την πώληση.
- Fresh installation hardening: νέο `server/src/pos-pricing-bootstrap.js` δημιουργεί `CustomerWholesalePrice` στο server startup, άρα το POS δεν εξαρτάται από το αν έχει ανοίξει πρώτα ο Τιμοκατάλογος.
- Promotions δεν αναμιγνύονται σε αυτό το βήμα.

## Επόμενο

PRE-KAT STEP 2C — POS Promotions / Offers. Πριν εφαρμοστούν σε checkout πρέπει να οριστεί deterministic και ασφαλής precedence μεταξύ retail, customer wholesale, leaflet και gift offers, χωρίς να δημιουργηθεί οικονομικά λανθασμένη προτεραιότητα.
