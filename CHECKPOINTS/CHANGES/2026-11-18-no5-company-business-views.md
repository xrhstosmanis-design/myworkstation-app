# Νο5 — Εταιρικά προϊόντα, αγορές, συνταγές και καρτέλα προμηθευτή

18/11/2026 · CENTRAL-BACKOFFICE-ACCESS-01 · ίδιο Draft PR #4007 από remotec28c053b / localf7ec4f0 (ίδιο tree27a59b26). Source53STORE+15COMPANY capabilities, όχι αριθμός ολοκληρωμένων Owner οθονών. Πλήρης κάλυψη OPEN.

Προστέθηκαν4χωριστές εταιρικές προβολές: company-products.read με ρητές τιμές κόστους/πώλησης και singleq<=120/native500 παράθυρο· purchases.read με native300πρόσφατα metadata· recipes.read με own συνταγές/γραμμές και null aggregate όταν λείπουν επιτρεπόμενα στοιχεία αντί ψευδούς μερικού κόστους· supplier-details.read με own supplier404 και native200παράθυρα αγορών/πληρωμών/own-product costs/εκτιμώμενο υπόλοιπο παραθύρου. Μη διαθέσιμα/ξένα recipe identifiers/names/costs αποκρύπτονται, ενώ πραγματικό μηδενικό πλήρες κόστος παραμένει0.

Αυστηρά companyjoins/DTOs, άδεια/module/account/session/revision πριν/μετά, bound συλλογών/finite numbers και ίδια αιτηθείσα οντότητα. Δεν προστέθηκαν writers, attachments, OCR/provider/payment/import ούτε globalMasterProduct. Παραλείπονται native bootstrap/DDL. Τα παράθυρα δεν παρουσιάζονται ως πλήρες ιστορικό.

Η καρτέλα προμηθευτή απαιτεί ρητή, αποθηκευμένη και ορατή parent suppliers.read παραχώρηση: η επιλογή την προσθέτει, η αφαίρεση parent αφαιρεί το child και orphan policy απορρίπτεται από schema/runtime. Η επιλογή γίνεται με όνομα/ΑΦΜ από επιτρεπόμενο κατάλογο, όχι με UUID. Όλα τα προηγούμενα3/7/11policies διατηρούνται χωρίς αυτόματο νέο grant. Search/selection/company/revision/API αλλαγές κρύβουν παλιά δεδομένα και late/ξένα/malformed payloads απορρίπτονται. Το finite105-family coverage ενημερώθηκε μόνο για τα αντίστοιχα bounded subsets· υπόλοιπα παραμένουνOPEN.

## Πραγματικά CI στοιχεία

Το κύριο CI44281732440 στοc28c053b ολοκληρώθηκε SUCCESS με fail0, μαζί με Chat44281732421. Επιβεβαιώθηκαν και τα2nativeBASE/CAPTURE πλήρη backup/privateRestore/consume/install, epoch/παλιά grants/account retention, auditreplay και πραγματικό Owner company-only11runtime: tenant/count/query/module/revision/session-revoke/μεταβολές δικαιωμάτων. Πέρασε το actual20-sourceDocker και το wholesale browser/offline. Αυτό είναι απομονωμένο CI acceptance, όχι εγκατάσταση ή ανθρώπινοLAB.

Το ανεξάρτητο wallet44281732577 εξακολουθεί να αποτυγχάνει σε hostprivatepg_restore πρινDocker με safeUNKNOWN· όλες οι toolversions αποδείχθηκαν16.15, άρα δεν παρουσιάζεται ως λυμένο ή ως απλό major mismatch. Η ασφαλής ταξινόμηση επεκτάθηκε σε20σταθερές κατηγορίες (schema/function/extension/relation/column/operator/constraint/syntax), με αμετάβλητα restore/acceptance checks. Τα canary tests επιβεβαιώνουν ότι δεν καταγράφεται rawstderr/SQL/PII/paths/secrets. Ανανεώθηκαν τα20 hashes. ΝέοwalletCI απαιτείται για ακριβή διάγνωση.

## Έλεγχοι/επόμενο

Τελική συνδυασμένη εκτέλεση25σχετικών αρχείων, canonicalservercwd Node24:195PASS/6SKIP/0FAIL (201σύνολο:5nativePG+1actualDockerSKIPτοπικά). ClientbuildPASS, diffcheckκαθαρό. Τα overlap counts δεν αθροίζονται. Το γνωστό τοπικό Chromium limitation διατηρείται ιστορικά, όχι σανPASS. Η nativefixture επεκτάθηκε στις15παραχωρήσεις με πραγματικά own/foreign προϊόντα/barcodes/συνταγές/παραστατικά/πληρωμές/κόστη, dependency/audit και no-write controls· actual15acceptance εκκρεμεί στο νέοCI.

Παραμένει η ξεχωριστή wallet αποτυχία, οι υπόλοιπες Owner οικογένειες του census και ελεγχόμενη paired εγκατάσταση/hosted acceptance. Καμία productionmigration/deployment ή νέα ανθρώπινη δοκιμή. Όλες οι POS/SuperAdmin/Owner δοκιμές στο τέλος, στο υπάρχονLAB, χωρίς επανάληψη προηγούμενων τελικών οικονομικών πράξεων.
