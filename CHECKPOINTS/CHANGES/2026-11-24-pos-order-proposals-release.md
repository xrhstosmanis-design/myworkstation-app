# Πρόταση παραγγελίας στο μπροστινό POS — ανεξάρτητο πακέτο

24/11/2026 · /root · feat/pos-order-proposals-20261124 · base61c2a64. Ίδιος προϋπάρχων owner/claim4193, εγκεκριμένος και merged20ecc946 πριν από κώδικα. Οι νεότερες αλλαγές No5 από4195 διατηρούνται ακέραιες.

## Αποτέλεσμα και όρια

Νέα επιλογή στο POS, εμφανής με ενεργό orderSuggestionsPos στο υπάρχον checkbox editor Ιδιοκτήτη/εξουσιοδοτημένου διαχειριστή. Χωριστή από το δικαίωμα τιμολογίων/παραλαβών. Νέος read-only router και React modal με δικό του scoped CSS, κλειδωμένα στο κατάστημα του POS. Εμφάνιση αποθέματος/ελάχιστου, πρότασης ποσότητας, αιτιών/προειδοποιήσεων και ανεπιβεβαίωτων πρόχειρων αγορών. Τα ελλιπή στοιχεία αναμενόμενων παραλαβών επισημαίνονται ρητά.

Χρησιμοποιεί τον υπάρχοντα readOrderSuggestions:28ημέρες ιστορικού,7κάλυψης,3παράδοσης, καθαρές πωλήσεις/επιστροφές και διαθέσιμες επιβεβαιωμένες αναμενόμενες ποσότητες. Δεν αναθέτει προμηθευτή, δεν αλλάζει stock/όρια, δεν δημιουργεί/στέλνει αγορά και δεν εκτελεί εβδομαδιαίο υπολογισμό.

Η πρόσβαση επανελέγχει ενεργό credential/employee/posAccess/permission πριν και μετά τα δεδομένα, ακριβές company/store, ενεργό κατάστημα και πραγματικό module/license. Επανέλεγχος δικαιώματος ανά15s/εστίαση, καθαρισμός δεδομένων σε αλλαγή context/ανάκληση και αποκλεισμός scanner όταν ανοίγει η πρόταση. Καμία αλλαγή φορολογικών ή χρηματικών writers.

## Απομόνωση από weekly schema

Δεν περιλαμβάνει τις κεντρικές weekly ρυθμίσεις, τις τρεις προτεινόμενες tables, schema readiness ή worker. Το4194 διατηρεί το αυτόματο alarm και τα No7/No14 installation dependencies. Ο παρών router χρησιμοποιεί μόνο υφιστάμενες αναγνωστικές υπηρεσίες/πίνακες. Δεν απαιτεί νέα πινάκων εγκατάσταση ή αλλαγή παλιού lifecycle profile/hash.

## Προστατευόμενη συμβατότητα και έλεγχοι

Το προηγούμενο πραγματικό POS hang στο4194 διορθώθηκε με μοναδικό React key του νέου component, ανεξάρτητο από το radio. Η ενσωμάτωση εξετάστηκε με την υπάρχουσα coffee/SET mounted suite, όχι μόνο με mock του νέου modal. Το checkbox fixture αναμένει ρητά το πρόσθετο defaultOFF δικαίωμα και ελέγχει OFF/ON/persist, διατηρώντας όλους τους παλιούς ελέγχους. Το header fixture καταγράφει δύο ακριβήGETpermission, και διατηρεί ολόκληρη τη μηδενική επιχειρησιακή ενέργεια στο checkout/stock/attendance.

Πραγματικό Node20.20.2/PostgreSQL18.7 σε καινούρια loopback βάση, με τυχαίο απομονωμένο schema και καθαρό τερματισμό: nativeHTTP/SQL+React8PASS/0FAIL/0SKIP,746.6ms. Η πραγματική πρόταση δίνει8τεμάχια (28πωλήσεις/28ημέρες, κάλυψη7+παράδοση3, stock2/min5). Ανάκληση κατά τη διάρκεια της ανάγνωσης δίνει403 χωρίς rows. Άλλο κατάστημα, εταιρεία, ανενεργός credential/employee/posAccess/module απορρίπτονται. StoreProduct/Sale/PurchaseOrder controls συμφωνούν και δεν υπάρχουν WeeklyStockAlarm tables. Η αυθεντικοποίηση HTTP χρησιμοποιεί ελεγχόμενους fixture actors· δεν αποτελεί πραγματικό JWT/login/LAB PASS.

Πρόσθετες παραγωγικές React δοκιμές editor/header/coffee+POS UI:11PASS/0FAIL/0SKIP,2.78s. Τελικό build, νέο πλήρες CI, έγκριση για συγχώνευση/εγκατάσταση και κοινή τελική συνεδρία LAB εκκρεμούν. NOT INSTALLED / NOT LAB PASS.

Τελικό Work-safe frontend/TABLE_SERVICE build:PASS,12.33s. Με ξεχωριστό CSS/URLητελική πραγματικήReactεπαλήθευσημένει11PASS/0FAIL/0SKIP. diff-checkPASS.

Πρόσθετος έλεγχος ακριβούς target: body/query storeId που διαφέρει από το URL απορρίπτεται400 πριν από module lookup, ώστε η γενική προτεραιότητα body του module guard να μη μεταφέρει ανάγνωση Owner σε άλλο κατάστημα. Native GET με πραγματικό JSON body και query mismatch ελέγχονται, μαζί με ρητό κενό target.

## 24/11/2026 19:12 Europe/Athens — SOURCE LIVE / LAB acceptance pending

POS4197 plus bounded startup correction4204 installed at678e4645c566be048f205e4a3b642a1a740b7d25. Claim4203 was merged before source. FullPRCI45441724091:all5jobsSUCCESS atd0339e1d8cb906dac55348e006eab6431cbafb09. Renderdep-dc2sa7lg1s2s739ou4ngLIVE17:12:38Z; independentapi/healthok=true/exact678e4645. Prior faileddep-dc2rqbcs728c73bf2cug is retained as failure evidence.

Readonly production recheck after deployment:570 associated tobacco-department products,568 classified tobacco plus2NULLcategory/VAT0;0rate mismatches, same aggregates as before. This does not prove all startup scripts were globally write-free. No product/category/VAT correction submitted by this page.

The new read-only POS proposal and per-operator permission are SOURCE LIVE. HostedOwner/operator/physicalPOS/scanner/revocation arithmetic acceptance remainsNOT TESTED, grouped in existingLAB perdocs/testing/pos-order-proposals-lab-acceptance.md. No request to switch logins for partial acceptance. Default absent permission staysOFF; no mass grants performed. Weeklyalarm4194stillBLOCKED on independent schema/runtime admission No7/No14; no weekly tables/worker deployed.
