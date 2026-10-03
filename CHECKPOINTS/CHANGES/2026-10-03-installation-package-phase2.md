# Εγκατάσταση Διαδόχου — CAP settings και έτοιμο Windows πακέτο

## 03/10/2026 — ASSIGNED εγκατάσταση Διαδόχου / agent/installation-package-20261003

Ίδια υπεύθυνη συνομιλία με agent/installation-guide-20261003, συνεχίζει το ήδη ανατεθειμένο scope. PR #1676 / 45d6f92983163a57484b87ec7565fb5e4fcefb69: CI #4210 και main #4211 PASS, Render dep-db0ia36gekts739r3ju0 LIVE 15:56:44Z. Οδηγός 7 βημάτων / ένα STORE EFTPOS δημοσιευμένα, UI/φυσική εγκατάσταση NOT TESTED.

Νεότερη φάση: αποθήκευση επιβεβαιωμένων CAPDriver κωδικών/φακέλου ανά company/store/POS, σωστή σύνδεση με ενεργό RBS/STORE EFTPOS, καμία μαντεμένη προεπιλογή νέου καταστήματος, stale equipment → STOP, KAT6/2/3 συμβατότητα προστατευμένη. Έτοιμο token-free Windows πακέτο με PREPARE χωρίς δίκτυο και μενού Pair/Test/Start, έλεγχος αναμενόμενου store πριν από τοπικό credential overwrite/Writer. Πακέτο μπλοκάρει multi-POS γιατί queue writer παραμένει store-wide. CONNECTOR_RBS/άδεια απαιτούνται runtime· το πακέτο δεν τα ενεργοποιεί. Local build + 1806 server tests/1 skip PASS, HTTP isolated E2E/Windows smoke σε CI απαιτούνται. Καμία production ρύθμιση/module/πληρωμή/εντολή δεν εκτελέστηκε. Εκκρεμούν πραγματικοί κωδικοί/φάκελος/ΦΠΑ Διαδόχου, ενεργοποίηση CONNECTOR_RBS όπου απαιτείται, φυσική αποδοχή, έλεγχος UI, τελικό PDF μετά τη δημοσίευση ροής. Μικτή OPEN, αυτόματη υπηρεσία Windows OPEN, πλήρης wizard όλων modules OPEN. Ανεξάρτητο Gate6/νεότερο Gate3PASS αμετάβλητα.

## Ακριβές scope και έλεγχοι

Νέος πίνακας StoreRbsInstallationSettings δημιουργείται από εξουσιοδοτημένο PUT, όχι από απλό read ή χειροκίνητο production migration. Αποθήκευση/audit στην ίδια συναλλαγή· επιβεβαίωση κωδικών είναι ρύθμιση, ποτέ δήλωση πραγματικής έκδοσης. Απουσία ρυθμίσεων νέου store ή αλλαγή συσκευής δεν παράγει fiscal request. ΚΑΤ fallback6/2/3 παραμένει μόνο για kat-store χωρίς νέα ρύθμιση. Snapshot/claim-once/outcome/sale-finalize/exclusions/mixed guard διατηρούνται.

CI E2E σε νέα isolated company/store: authentication/role/tenant denial, STORE-only roundtrip, διαφορετικοί κωδικοί, module μη ενεργοποιημένο, sibling isolation, audit, stale mapping και multi-POS package rejection. Windows smoke: parse template, encrypted credential roundtrip, wrong-store rejection χωρίς overwrite, PREPARE χωρίς network, σωστό connection χωρίς claim και one-shot bytes/hash. Αυτά δεν πιστοποιούν RBS/EFTPOS ή νέα εγκατάσταση.

Το manual διορθώνει το λάθος παλιό ομώνυμο store και δίνει βήματα νέας φόρμας/πακέτου. Το ήδη παραδομένο PDF είναι παλιότερη έκδοση· τελικό self-install PDF μετά το exact deploy, χωρίς ισχυρισμό φυσικού PASS. Υπεύθυνη σελίδα παραμένει η ίδια μέχρι ρητή δημοσιευμένη μεταβίβαση· επόμενη ενέργεια μετά CI/deploy: πραγματικά στοιχεία/φυσική αποδοχή Διαδόχου και PDF.
