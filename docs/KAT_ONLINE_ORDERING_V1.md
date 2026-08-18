# KAT Online Ordering — V1 Checkpoint

Ημερομηνία: 2026-08-18

## Στόχος
Mobile-first online ordering για το Κυλικείο ΚΑΤ, συνδεδεμένο με το υπάρχον MyWorkStation.

## Κλειδωμένοι κανόνες V1
- Δημόσιο storefront: `kat.myworkstation.gr` (στόχος DNS/deployment).
- Πηγή προϊόντων, βασικών τιμών και stock: MyWorkStation / κατάστημα Κυλικείο ΚΑΤ.
- Τιμή Online = Τιμή Κυλικείου + 0,10 € ανά πωλούμενο προϊόν.
- Η προσαύξηση +0,10 € είναι κανόνας καναλιού ONLINE και δεν αλλάζει τη βασική τιμή του προϊόντος στο POS.
- Delivery λειτουργεί από την πρώτη έκδοση.
- Τρόποι πληρωμής Delivery: Μετρητά ή Κάρτα σε ασύρματο POS κατά την παράδοση.
- Παραλαβή από το Κυλικείο υποστηρίζεται επίσης.
- Οι online παραγγελίες καταχωρούνται ως ξεχωριστό κανάλι `ONLINE` / `ONLINE_DELIVERY`.
- Καμία διπλή καταχώριση προϊόντων: storefront και POS χρησιμοποιούν τον ίδιο εμπορικό κατάλογο.

## Customer flow
1. Αρχική / κατηγορίες.
2. Επιλογή προϊόντων.
3. Modifiers (καφές, ζάχαρη, γάλα, extras).
4. Καλάθι.
5. Παραλαβή από Κυλικείο ή Delivery μέσα στο ΚΑΤ.
6. Για Delivery: όνομα, τηλέφωνο, κτίριο/πτέρυγα, όροφος, κλινική/τμήμα, δωμάτιο/γραφείο, παρατηρήσεις.
7. Πληρωμή: Μετρητά ή Κάρτα στο ασύρματο POS.
8. Αριθμός παραγγελίας και κατάσταση.

## MyWorkStation flow
Καταστάσεις παραγγελίας:
`NEW -> ACCEPTED -> PREPARING -> READY -> OUT_FOR_DELIVERY -> DELIVERED`

Για παραλαβή από το κυλικείο το `OUT_FOR_DELIVERY` παραλείπεται.

Η οθόνη Online Παραγγελιών θα εμφανίζει:
- αριθμό και ώρα,
- πελάτη / τηλέφωνο,
- προϊόντα και modifiers,
- σημείο παράδοσης,
- τρόπο πληρωμής,
- σύνολο,
- χειριστή/διανομέα,
- ιστορικό αλλαγών κατάστασης.

## Stock
- Το storefront εμφανίζει διαθεσιμότητα του ΚΑΤ.
- Μη διαθέσιμο προϊόν δεν μπορεί να προστεθεί σε νέα παραγγελία.
- Στο submit γίνεται server-side επανέλεγχος τιμής και διαθεσιμότητας.
- Η οριστικοποίηση της εμπορικής συναλλαγής ενημερώνει stock από την ίδια κεντρική ροή του MyWorkStation.

## Ασφάλεια / ακεραιότητα
- Η τιμή που στέλνει ο browser δεν είναι authoritative.
- Ο server υπολογίζει ξανά: `onlineUnitPrice = currentStorePrice + 0.10`.
- Το storeId του public endpoint είναι δεμένο με το KAT storefront και δεν επιλέγεται ελεύθερα από τον πελάτη.
- Idempotency key στο submit ώστε διπλό tap/refresh να μη δημιουργεί διπλή παραγγελία.
- Audit trail για αλλαγές κατάστασης και πληρωμής.

## Επόμενα implementation slices
1. Online-order database bootstrap.
2. Public catalog + availability API για KAT.
3. Server-side online pricing (+0,10 €).
4. Order submit + idempotency.
5. Mobile storefront.
6. MyWorkStation Online Orders inbox.
7. Stock transaction integration.
8. Delivery assignment + cash/wireless-POS settlement.
9. Reports / ONLINE channel analytics.
10. DNS `kat.myworkstation.gr` και production test.
