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
