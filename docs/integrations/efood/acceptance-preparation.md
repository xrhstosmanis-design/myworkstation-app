# efood - Προετοιμασία αντιστοίχισης και δοκιμών
Ημερομηνία: 13/10/2026, Europe/Athens.
Owner: codex/efood-bearer-20261012 (διατηρείται).
Κατάσταση: PREPARATION ONLY. Δεν αποτελεί νέο LAB PASS, έτοιμη παραγωγή ή υλοποιημένη νέα οθόνη/API.

## Επιβεβαιωμένη βάση
Περιορισμένο πραγματικό callback PASS12Oct22:56, webhook6acd3b53b8395c593d96e2ba, event8aecdfb3-c3c2-4531-9ce1-391bc3baee7c, orderc79b178a-34e6-4d11-9eb5-2a7246209c60. Identity και quantity/barcode parser released93ba32ce, fullCI2513/0/0; νέα actual acceptance AWAITING LAB. Δεν επαναλαμβάνεται η δοκιμή μόνο για συμπλήρωση εγγράφων.
Αναλυτικά checkpoints: 2026-10-12-efood-store-identity.md και 2026-10-12-efood-product-references.md. Manual μόνο docs/manual/efood/PASS.md για ήδη επαληθευμένο callback.

## Πίνακας αντιστοίχισης προς συμπλήρωση
Η επιλογή productId γίνεται μόνο από τον κατάλογο του επιλεγμένου LAB και ελέγχεται στον server μέσω Product.companyId και StoreProduct.storeId. Ομοιότητα ονομασίας δεν εγκρίνει αντιστοίχιση. Δεν αντιστοιχίζουμε τη μουστάρδα σε TEST1/TEST2 επειδή αυτά υπάρχουν ως controls.

| Πάροχος / στοιχείο | Γνωστή τιμή | MyWorkStation / κατάσταση | Αποδοχή |
| --- | --- | --- | --- |
| Vendor |9344842|MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ, store cmtpopbgo000trhb5ng9ytiru|Ταύτιση με client.store_id, καμία αντικρουόμενη alias |
| Chain |3d848f43-4022-4b13-93aa-d1d9629352b3|Πληροφοριακό στοιχείο στην προετοιμασία|Δεν αποτελεί νέο αποδεδειγμένο chain validation |
| Partner config |Κενό στο εικονικό callback|Χωρίς configured partner ID|Provider24Sep δεν απαιτεί πρόσθετο ID· αν ρυθμιστεί, πρέπει να αποστέλλεται ίδιο |
| SKU |SLL45E|productId: ΔΕΝ ΕΠΙΛΕΧΘΗΚΕ / UNMATCHED|Ρητή ταύτιση με πραγματικό αντίστοιχο LAB προϊόν, όχι auto/name-only |
| Barcode |05201050130791|Έλεγχος μέσα στον επιλεγμένο κατάλογο εκκρεμεί|String με αρχικό0, μοναδική και συμβατή επιλογή SKU |
| Όνομα |17 Delicatessen Μουστάρδα Πικαντική250g|Περιγραφή προς έλεγχο|Δεν χρησιμοποιείται ως μοναδικό αναγνωριστικό |
| Ποσότητα / τύπος |pricing.quantity1 / UNIT|Parser διαθέσιμος· stock conversion όχι ενεργό|Δεν υποθέτουμε ότι βάρος/συσκευασία ισούται με τεμάχια |
| Τιμές / σύνολα |Virtual unit_price1.5, total_price0, order_total1.5|PENDING_PROVIDER_CONTRACT|Δεν διορθώνουμε ή εισάγουμε εμπορικές αξίες από το fixture |
| Πληρωμή |PAID στο virtual fixture|PENDING_PROVIDER_CONTRACT|Δεν δημιουργείται Payment και δεν ζητείται δεύτερη χρέωση |

## Προτεινόμενη επόμενη υλοποίηση: read-only event preview
Ανεξάρτητο bounded scope πριν από commercial mapping. Απαιτεί δημοσιευμένο claim, source tests/fullCI και exact release πριν UI acceptance.
- Platform Super Admin, επιλεγμένη εταιρεία/κατάστημα, ακριβές LAB/SANDBOX. Event lookup υποχρεωτικά companyId/storeId/integrationId/eventId.
- Ανάγνωση ήδη αποθηκευμένου κρυπτογραφημένου event, χωρίς επαναποστολή callback ή άνοιγμα παραθύρου.
- Επιστρέφει μόνο event/order IDs, provider store/config identity, status και product references (SKU, barcode strings, quantity).
- Οι manual mappings ελέγχονται με join στον επιλεγμένο StoreProduct και ίδιο Product.companyId. Missing, ambiguous, foreign-store, inactive/unavailable ή conflicting references παραμένουν εμφανώς UNMATCHED/BLOCKED.
- Καμία επιστροφή raw payload, Authorization, credentials, callback key, customer contact/address ή hashes μυστικών.
- Δεν γράφει mapping/event/Audit business record, δεν αλλάζει καταλόγους/τιμές/stock/πληρωμές, δεν εκτελεί recovery/status/outbound calls. Existing schema/bootstrap behavior πρέπει να τεκμηριωθεί χωριστά.
- Απόκριση εμφανίζει preparationOnly=true και commercialExecutionReady=false όσο provider contract/Pelican certification εκκρεμούν.
- UI πρέπει να απορρίπτει καθυστερημένη απόκριση προηγούμενου καταστήματος. Καθαρίζει προηγούμενη preview/error επιλογή στην αλλαγή scope.
Τα παραπάνω είναι acceptance requirements, όχι ήδη υλοποιημένο endpoint ή νέο PASS.

## Έτοιμη μήτρα ελέγχων
Αρνητικά σενάρια εκτελούνται πρώτα σε isolated tests. Δεν ανοίγουμε πολλαπλά production windows για την απόδειξή τους.

| ID | Σενάριο | Αναμενόμενο / όριο | Τεκμήριο |
| --- | --- | --- | --- |
| ID01 |Σωστό client.store_id και υπάρχον Bearer|LAB dry-run accepted, μία encrypted εγγραφή, one-shot CONSUMED|Προηγούμενο callback PASS· νέα identity acceptance εκκρεμεί |
| ID02 |Missing store|400 MISSING_PROVIDER_STORE_ID, χωρίς event/consume|CI μόνο |
| ID03 |Foreign store|409 VENDOR_MISMATCH, χωρίς event/consume|CI μόνο |
| ID04 |Conflicting store aliases|409 CONFLICTING_PROVIDER_IDENTITY, χωρίς αλλαγή υπάρχοντος event|CI μόνο |
| ID05 |Configured partner missing/wrong|409 PARTNER_CONFIG_MISMATCH|CI μόνο |
| PR01 |pricing.quantity2 / barcode array|Ακριβής quantity2, διατήρηση SKU/leading0|Parser/HTTP isolated tests· live normalized readback δεν υπάρχει ακόμη |
| PR02 |Fractional quantity0.375|Διατήρηση αριθμού χωρίς conversion/rounding|CI μόνο· δεν αποδεικνύει βάρος/stock units |
| PR03 |Missing/invalid priced quantity|400 INVALID_PRODUCT_QUANTITY, χωρίς consume|CI μόνο |
| PR04 |Quantity aliases conflict|409 CONFLICTING_PRODUCT_QUANTITY|CI μόνο |
| PR05 |Malformed barcode|400 INVALID_PRODUCT_BARCODE|CI μόνο |
| MAP01 |Manual mapped item στο σωστό LAB|Ένα επιλεγμένο productId με scoped join|Προτεινόμενο preview / NOT IMPLEMENTED |
| MAP02 |Foreign/missing/ambiguous mapping|BLOCKED, όχι name-based fallback|Προτεινόμενο preview / NOT IMPLEMENTED |
| PRIV01 |Preview output|Απουσία credentials, raw/customer payload και access-key URL|Προτεινόμενο preview / NOT IMPLEMENTED |
| SCOPE01 |Αλλαγή καταστήματος με καθυστερημένη απόκριση|Καμία εμφάνιση δεδομένων προηγούμενου store|Προτεινόμενο UI / NOT IMPLEMENTED |
| RETRY01 |Exact ίδιο payload μετά consume|200, ίδιο eventId, μία εγγραφή|CI μόνο· δεν γίνεται ιστορικό replay για τεκμηρίωση |
| PAY01 |PAID/COD/fees/totals|Contract-confirmed preparation, καμία δεύτερη χρέωση|BLOCKED ON PROVIDER· όχι υλοποιημένη payment flow |
| LIFE01 |Ready/cancelled/delivered/recovery|Συμφωνημένος πλήρης Pelican lifecycle και reconciliation|BLOCKED ON PROVIDER ENVIRONMENT |

## Πριν από οποιαδήποτε νέα LAB ενέργεια
Καταγραφή νέου, μοναδικού test ID· company/store/operator/terminal/shift/revision/time Europe/Athens. Fresh affected shifts και control: transaction count, cash/card/IRIS/total, drawer/expenses και τελευταία transaction IDs/times. Για affected SKU: ακριβές productId/SKU, stock και movement ID/time από διαθέσιμη πηγή. Ό,τι δεν εκτίθεται μένει NOT TESTED.
Πριν τιμές δημοσιεύονται στο checkpoint. Μία ορισμένη ενέργεια, ίδια after/control sources και expected/observed differences. Δεν επαναλαμβάνεται παλιά πληρωμή/πώληση/mock για αναδρομική απόδειξη.
Η read-only preview acceptance δεν πρέπει να απαιτεί νέο callback. Νέο one-shot window μόνο για συγκεκριμένο χωριστό expanded test, με action-time authorization και χωρίς commercial posting.

## Απαιτήσεις από efood και κλείδωμα παραγωγής
Στάλθηκαν12Oct23:16:46Athens/message1a131c2b6ac76a6e στην υπάρχουσα τεχνική συνομιλία. Περιμένουμε schemas/units/substitutions/pricing/VAT/discount/fees/rounding/payment states, acknowledgement/timeouts/retries/recovery, πλήρες Pelican test environment/scopes/endpoints και certification/onboarding checklist.
Η απάντηση24Sep λέει ότι το υφιστάμενο μη δημοσιευμένο test shop επιτρέπει virtual Trigger Test Order, όχι πλήρες Pelican. Δεν επινοούμε endpoint/scopes ή ενεργοποιούμε πραγματικό κατάστημα από callback PASS.
Ολόκληρο tracker12 παραμένει OPEN. Owner παραμένει ο ίδιος· πρώτο επόμενο source scope είναι το scoped read-only preview, με ξεχωριστό claim πριν edits.
