# 7–9 · Κεντρική προετοιμασία αναφορών από Super Admin

Owner /root, συνέχεια #4000. Branch fix/report-event-installation-ui-20261118. Ο ιδιοκτήτης ανέθεσε εγκατάσταση από τον βοηθό και έναρξη αυτόνομων δοκιμών στο υπάρχον LAB.

## Πριν από την αλλαγή

Το #4000 είναι συγχωνευμένο ως 0d06d578. Πλήρες CI44164150016 5/5 PASS. Στις 18/11 η εφαρμογή είναι live366ac156 και backup a7bb1c4c, αμφότερα περιλαμβάνουν το4000. Ο EventConsent ακόμη απουσιάζει. Υπάρχει μία εγγραφή LAB cmtpopbgo000trhb5ng9ytiru, generation0, CAPTURE hash59ca657191a03dfeb751e907d95abe4291a3fc61da30c9d0602a116ed78757c2, maintenancefalse/retiredfalse. Κανένα SQL/config/παραλήπτης δεν άλλαξε στην παρούσα ανάγνωση.

Η κεντρική συνεδρία Super Admin υπάρχει, αλλά το εγκατεστημένο API /report-event-installation δεν έχει χειριστήριο UI. Δεν χρησιμοποιούνται tokens/session extraction ή αυθαίρετες κλήσεις μέσα από τον browser.

## Περιορισμένη αλλαγή

Προστίθεται οθόνη κεντρικής προετοιμασίας στο υπάρχον report manager: ρητή επιλογή προφίλ, επιθεώρηση, έλεγχος ακριβούς εταιρείας/καταστήματος/revision/hash και τελική επιβεβαίωση εγκατάστασης. Χρησιμοποιείται το υπάρχον API και ο ίδιος έλεγχος ενεργής κεντρικής συνεδρίας. Καμία αυτόματη εγκατάσταση ή ενεργοποίηση παραλήπτη. Αλλαγή scope ακυρώνει τα παλιά αποτελέσματα· κάθε προσπάθεια εγκατάστασης καταναλώνει το πακέτο και απαιτεί νέα επιθεώρηση για επανάληψη.

## Κατάσταση

Η υλοποίηση ολοκληρώθηκε. Πέντε mounted UI tests PASS/0FAIL/0SKIP, με έλεγχο scope/revision/hash, αποφυγή διπλής υποβολής και ακύρωση παλιού async αποτελέσματος. Full CI, ακριβής διάθεση, ενεργοποίηση installerflag, hosted προετοιμασία, συμφωνία generation/hash και προφίλ εφαρμογής/backup: NOT TESTED σε αυτή τη συνέχεια. Η επιχειρησιακή αποδοχή αναφορών παραμένει OPEN. Προστατεύονται τα προηγούμενα email PASS και δεν επαναλαμβάνονται οικονομικές/stock συναλλαγές.

## Πραγματικό hosted εμπόδιο και περιορισμένη συμβατότητα

Η strict επιθεώρηση της ζωντανής βάσης εντόπισε εννέα νεότερους πίνακες και τον package guard στο StoreProduct που λείπουν από το παλιό CAPTURE. Οι πίνακες περιλαμβάνουν κοινό ιστορικό μεταξύ καταστημάτων και ουρά SMTP, οπότε δεν προστέθηκε αυθαίρετη ιδιοκτησία ή νέοι guards στους λειτουργικούς writers.

Νέα ρητή επιλογή CAPTURE_REPORTS_ONLY / MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V1: οι εννέα πίνακες δηλώνονται ως αυστηρά ελεγμένα διατηρούμενα δεδομένα, με πλήρη pin σχήματος/defaults/constraints/indexes/FK/owner/ACL και υπάρχοντος package trigger/function. Η JavaScript και ο Python worker συνθέτουν ίδιο hashed manifest. Τα παλιά BASE/CAPTURE/event προφίλ και hashes διατηρούνται. Η περιορισμένη εξαίρεση παλιού καταλόγου εφαρμόζεται μόνο μετά από ανεξάρτητο strict έλεγχο και δεν κρύβει άγνωστα αντικείμενα.

Το νέο προφίλ απαγορεύει ρητά scoped εκκαθάριση/reset/delete/export/restore πριν από DB/recovery εργασία. Το πλήρες backup δεν αλλάζει. Ο worker επιστρέφει DISABLED χωρίς εξαίρεση ώστε να συνεχίζεται και το ανεξάρτητο cleanup. Αυτό είναι προφίλ αναφορών, όχι PASS της πλήρους διαχείρισης lifecycle των νέων λειτουργιών.

Στις 18/11/2026 18:19:30 UTC ο read-only έλεγχος πραγματικής public βάσης συμφώνησε χωρίς διαφορές και για τους εννέα πίνακες, 26 constraints, 13 indexes και το package trigger/function. Πέντε κατάλογοι συγκρίθηκαν με canonical DDL. Τοπικά strict catalogue/WASM 4PASS, με απόρριψη 17 διαφορετικών DDL μεταβολών. Ο συνδυασμένος Node έλεγχος 17PASS/1ρητήπαράλειψη/0FAIL και Python13PASS. Native PostgreSQL16.15 νέα εγκατάσταση/rollback σε εξέλιξη.

## Επαληθευμένη απομονωμένη εγκατάσταση

Native PostgreSQL16.15/UTF8 σε απομονωμένο προσωρινό cluster, NODE_ENV=test/DATABASE_URL localhost/reports_install_test: το νέο σενάριο εγκατάστασης πέρασε3/3 χωρίς FAIL/SKIP. Καλύπτει μετάβαση CAPTURE→reports-only, ακριβές canonical schema, διατήρηση εννέα λειτουργικών πινάκων και generation, διατήρηση package stock guard και λειτουργικών εγγραφών, άρνηση schema drift και πλήρες late rollback EventConsent/guards/enrollment. Η πρώτη native απόπειρα εντόπισε αδήλωτο InventoryWarehouseEditAudit.productId και απέτυχε πριν το commit. Προστέθηκαν25 ρητές δηλώσεις εφαρμοστικών ID/JSON στο κοινό Node/Python σχέδιο, χωρίς γενική χαλάρωση ελέγχων, και επαναλήφθηκε επιτυχώς μόνο το νέο σενάριο.

Τελική ενοποιημένη τοπική δέσμη:10 Node tests PASS/0FAIL/0SKIP (περιλαμβάνει17 πραγματικές WASM DDL μεταβολές που απορρίφθηκαν),13 Python worker tests PASS, συμπεριλαμβανομένης συνέχισης ανεξάρτητου cleanup μετά από DISABLED. Νέο targethashbeaa37279a59ffe0c1e8d1e81026321e4c457c3b9e4a8a162ef9e52fcae78f26, παλιό CAPTURE hash59ca657191a03dfeb751e907d95abe4291a3fc61da30c9d0602a116ed78757c2 αμετάβλητο.

Το UI-only head06e4141c πέρασε πλήρες CI44366546816/5SUCCESS. Η παρούσα επιπλέον συμβατότητα χρειάζεται νέο ακριβές πλήρες CI πριν συγχώνευση και διάθεση. Hosted προετοιμασία/επιλογή προφίλ/παραλήπτης και επιχειρησιακή αποδοχή δεν έχουν γίνει.
