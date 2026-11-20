# Νο 5 — Native Owner bootstrap fixture στο CI

18/11/2026 · CENTRAL-BACKOFFICE-ACCESS-01 · συνέχεια PR #4007. Το CI `44247752200` στο `34bec22f` απέτυχε σε έναν έλεγχο από το suite: `table-service-restructure-native.test.js`, επειδή το native fixture καλούσε middleware με `null` αντί αιτήματος. Το νέο staff-aware middleware διαβάζει την ταυτότητα χρήστη, όπως σε πραγματικό Express αίτημα.

Ενσωματώθηκε το τρέχον main `31c8c46` διατηρώντας τις αλλαγές άλλων σελίδων. Η μία διόρθωση fixture αντικαθιστά την κλήση με πραγματική δομή authenticated Owner GET για το επιλεγμένο κατάστημα. Δεν αλλάζει runtime συμπεριφορά ή τους ελέγχους conservation/idempotency/split/merge/payment ownership.

Τοπικά πέρασαν 3 σχετικοί έλεγχοι και ο ένας native PostgreSQL παραλείφθηκε λόγω απουσίας απομονωμένης PostgreSQL. Node syntax και diff PASS. Η ακριβής native PostgreSQL δοκιμή απαιτεί νέο CI· δεν χαρακτηρίζεται τοπικά PASS. Δεν έγιναν δοκιμές λογαριασμών. Η πλήρης κάλυψη δικαιωμάτων παραμένει OPEN.
