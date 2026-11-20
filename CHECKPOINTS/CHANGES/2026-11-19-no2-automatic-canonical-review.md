# Νο2 — αυτόματη μηνιαία συμφωνία υπαρχόντων παραστατικών

19/11/2026 Europe/Athens. Sameowner `/root` Νο2. Νεότερη ρητή διευκρίνιση ιδιοκτήτη: myDATA/POS/υπάρχουσα πληρωμή πρέπει να συσχετίζονται αυτόματα όταν τα στοιχεία συμφωνούν· ο χρήστης δεν πρέπει να ελέγχει γενικά όλες τις εγγραφές. Η#4045 παραμένει περιορισμένη τεχνική παράδοση πλοήγησης/διαχωρισμού, όχι ολοκλήρωση όλου του automaticmatching.

## Νεότερη πραγματική απόδειξη

Read-only παραγωγικό metadata δείγμα έδειξε ήδη completed commonDraft, canonical source/order/alias και μία αρχική πληρωμή. Υπάρχουν μοναδικό PurchaseOrderPosting και ακριβές InvoiceStockPosting. Το order έχει παλιά FINAL, source πραγματικό παλιότερο issue month, target APPROVED/PURCHASE_ORDER ημερομηνία posting. Ο ordinary normalizer αποκλείει FINAL παρότι η υπόλοιπη απόδειξη είναι πλήρης. Η προϋπάρχουσα πληρωμή έχει πραγματική διαφορά από το παραστατικό· δεν δικαιολογείται να χαρακτηριστεί ολόκληρο το δείγμα νέα αντιστοίχιση/οφειλή. Ιδιωτικά στοιχεία και ποσά παραμένουν εκτός repository. Η υλοποίηση δεν έχει ακόμη αρχίσει και το νέο σκέλος είναι NOT TESTED / OPEN.

## Bounded πριν-source scope

1. Ordinary read-only canonical recovery για ήδη αποδεδειγμένες FINAL/INVOICED οικογένειες. Απαιτούνται όλοι οι υφιστάμενοι scoped/unique source/order/posting/stock/supplier/fullnumber/type/amount έλεγχοι. Μόνο FINAL δεν αποδεικνύει posting. Η ίδια μία οικογένεια πρέπει να ανήκει στον πραγματικό μήνα έκδοσης και η καταγεγραμμένη projection ταυτότητα να μένει ορατή ως provenance.
2. Διερεύνηση/περιορισμένη ordinary αυτόματη συσχέτιση σαφών μοναδικών υπάρχοντων canonical πηγών myDATA/POS χωρίς manual ανά γραμμή. Απαιτούνται πλήρης ίδια identity, κατάστημα/εταιρεία, canonical family uniqueness και απουσία dangling/deleted/conflicting links. Απλό header candidate δεν συγχωνεύει οικονομικά, πολλαπλά/διαφορετικά MARK ή αντιφάσεις μένουν ονομασμένες εξαιρέσεις. Αν δεν προκύπτει αρκετή απόδειξη, διατηρείται OPEN· δεν χαλαρώνει ο raw classifier.
3. Η οικονομική παρατήρηση χρησιμοποιεί μόνο υφιστάμενες επαληθευμένες πηγές/IDs και ακριβείς υπάρχουσες κατανομές. Μερική/υπερπληρωμή/αντιλογισμός παραμένουν πραγματικές οικονομικές διαφορές. Δεν πιστοποιείται εξόφληση από κοινό ποσό ή προβολή εγκεκριμένου παραστατικού.
4. Εμφανείς συγκεκριμένες εξαιρέσεις και διατήρηση του ανοίγματος υπάρχουσας αγοράς/πηγής. Οι γενικές οδηγίες χειροκίνητου ελέγχου δεν υποκαθιστούν την αυτόματη εφαρμοστική συμφωνία.

## Προστατευόμενα / έλεγχοι / επόμενη πράξη

Raw C implementation, immutable D1/snapshot contracts, write paths, original acquisition/OCR, payments/allocations/approval/stock/fiscal/lifecycle και οι άλλοι owners δεν αλλάζουν από αυτό το claim. Καμία νέα πληρωμή, μεταβολή παραγωγικών IDs, backfill ή σχήμα. GET παραμένει READ ONLY/RepeatableRead. Οι πρωτότυπες οικονομικές/stock εγγραφές και η deliberatelydeleted μη αναβίωση διατηρούνται. Αν απαιτηθεί πραγματική νέα write-side αυτοματοποίηση, χρειάζεται χωριστό ονομασμένο scope πριν κώδικα· δεν βαφτίζεται η ordinary προβολή persistent merge.

Απαιτούνται synthetic/native regressions για πλήρες FINAL proof, missing/duplicate/foreign receipts, reopened/reversed/contradictory family, priorissueMonth/postingMonth, μία πληρωμή και μη απόκρυψη πραγματικών διαφορών, unchangedraw/D1, counters/cursors/provenance/navigation. Πλήρη source/main CI και κανονική guarded διάθεση πριν κοινή τελική αποδοχή. Δεν επαναλαμβάνονται επιχειρησιακές συναλλαγές για τεκμήριο. Επόμενο: merged claim, μία συγκεντρωτική στοχευμένη υλοποίηση/τεχνική δοκιμή και ακριβής καταγραφή υπολοίπων.


## Συγκεντρωτική υλοποίηση μετά merged claim #4058

- Ordinary FINAL recovery με όλη τη μοναδική source/order/posting/stock/header απόδειξη και διατηρημένο recorded provenance. Raw C/D1 και writers παραμένουν ανέπαφα.
- Μοναδική πλήρης ταυτότητα myDATA αντιστοιχίζεται στην ίδια υπάρχουσα ordinary οικογένεια πριν global counts/pagination. Foreign currency, παλιές dangling claims, πολλαπλά MARK/παραστατικά και αντιφάσεις απορρίπτονται. Νέες fixed metadata SELECTs/currency capability μόνο στην ordinary read-only συναλλαγή.
- Υπάρχουσα πληρωμή αναγνωρίζεται μόνο από completed canonical audit receipt και αμετάβλητα τρέχοντα ID/scope/supplier/amount/number/reversal/settlement. Νεότερο paymentBefore και αυστηρό legacy before-pair ελέγχονται χωριστά· invalid present modern receipt δεν πέφτει σε legacy fallback. Δεν αλλάζουν stored ledger ή allocations. Πραγματική μερική/υπερπληρωμή παραμένει ορατή.
- Κλειστές, συγκεκριμένες αποδείξεις αυτόματης συσχέτισης/πληρωμής και λόγοι μη αντιστοίχισης, χωρίς νέα requests ή οικονομική ενέργεια.
- Synthetic pure, actual reader65pairs/globalpagination/cursor and nativePG integration added. Ολόκληρος raw C και D1 contract παραμένουν byte-identical. Private store captures/replay/amounts εκτός Git. Τα private readonly πριν/μετά είναι diagnostic, όχι hosted/LAB PASS.

Node20 ordinary reader37PASS, snapshot projection8PASS και production build PASS. Πρώτη πλήρης targeted τοπική παρτίδα105PASS/1FAIL/1SKIP: μόνο Chromium process startup ECONNRESET, nativePG χωρίς test DATABASE_URL SKIP. Νεότερα legacy/UI additions ελέγχονται στην ίδια τελική παρτίδα. Απαραίτητα actual PostgreSQL+Chromium full CI source και exact main, κανονική guarded διάθεση και συγκεντρωτική αποδοχή παραμένουν PENDING. Δεν ζητείται νέα συναλλαγή/ανέβασμα ή χειροκίνητη αντιστοίχιση όλων των εγγραφών.


Τελική τοπική παρτίδα Node20:117PASS/1FAIL/1SKIP· το ίδιο περιβαλλοντικό Chromium ECONNRESET παραμένει FAIL (δεν αφαιρέθηκε/χαλάρωσε assertion), nativePG SKIP χωρίς testDB. Όλες οι εκτελεσμένες pure/reader/mounted/D1 assertions PASS. Ξεχωριστός επανέλεγχος reader+pure/D1 μετά SQL guards ακολουθεί πριν source publish. Ενιαίο private snapshot19/11,11:01:49Ελλάδας: old baseline αναπαράχθηκε, legacy FINAL οικογένεια πλέον στον αρχικό μήνα POSTED με μία υπάρχουσα πληρωμή και ακριβή πραγματική υπερπληρωμή. Δεν αποτελεί hosted αποδοχή ούτε SQL business write.

Νεότερος συγκεντρωτικός pure/ordinary reader/D1 έλεγχος:77PASS/0FAIL/0SKIP. Legacy metadata SQL επιπλέον ελέγχει raw τύπο/μήκος πριν nullable projection ώστε άγνωστες τιμές να μη βαφτίζονται απουσία πληρωμής. Native malformed raw JSON regressions περιλαμβάνονται στη source CI.

Source#4063: προστέθηκαν στο ίδιο υπάρχον πραγματικό Chromium flow native pointer checks των τριών νέων κλειστών λεπτομερειών, desktop/mobile, με αμετάβλητα παλιά rows/counters/status/assertions και χωρίς requests/writers. Syntax/fixture build PASS, πραγματική εκτέλεση αναμένεται στο exact νέο PR CI. Η πρώτη μη τελική PR CI44493558447 είναι superseded και δεν χρησιμοποιείται ως τελικό PASS. Private readonly επανάληψη καλύπτει35διαθέσιμους μήνες· αλλαγές μόνο2026-10/11, χωρίς business writes.
