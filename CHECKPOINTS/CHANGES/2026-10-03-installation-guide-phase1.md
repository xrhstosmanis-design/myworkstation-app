# Ενιαίος οδηγός εγκατάστασης - πρώτη φάση

## 03/10/2026 - ASSIGNED ενιαίος οδηγός εγκατάστασης / agent/installation-guide-20261003

Νεότερη σύνθεση Διαδόχου: ΜΟΝΟ1 POS εφαρμογής,1 RBS,1 EFTPOS καταστήματος· καμία Delivery απαίτηση. Readback σωστού store cmulmjjoc000qqlbf2bn2ifj0/company cmulmjjoa000oqlbfyi0h53ju: DIADOXOU-POS-01 ενεργό,6623 ενεργά store products,layoutv1 δημοσιευμένο01/10,6employees,5activeoperators/PIN. PILOT/TRIAL έως12/10, αρκετά modules inactive (CONNECTOR_RBS μεταξύ αυτών). Δεν ενεργοποιήθηκε full πακέτο. Υπάρχει παλιά ομώνυμη εγγραφή υπόpilot-company· μην εγκαταστήσετε εκεί. Προηγούμενη αναφορά μη εύρεσης ονόματος ήταν λανθασμένη, νεότερη ακριβής ταυτότητα υπερισχύει.

Owner επέκτεινε scope σε εύκολη εγκατάσταση όλων των modules τοπικά/remote, πρώτα υλοποίηση μετά νέο PDF. Πρώτη bounded αλλαγή: InstallationCenter οδηγός7βημάτων με ανάγνωση readiness/terminals/routing και σαφή διάκριση ρύθμισης/φυσικής δοκιμής· existing server state διατηρείται. Φόρμα POS-RBS-EFTPOS επιτρέπει ένα STORE χωρίς πλασματικό DELIVERY, αλλά ελλιπές ζεύγος Deliverycode/name απορρίπτεται. Άλλα terminal mappings προστατεύονται. Κανένα hardware command, νέα sale, παραγωγικό mapping ή license mutation. UI/installation NOT TESTED. Επόμενο scope: ασφαλής αποθήκευση CAP codes ανάκατάστημα και έτοιμο πακέτο, μετά exactdeploy/φυσική αποδοχή/τελικόPDF. ΜικτήCAP OPEN. Gate3PASS/ανεξάρτητοGate6 αμετάβλητα.


Προστατεύονται auth/SuperAdmin tenant isolation, licensing, fiscal outcomes/claim-once, KATCOUNTER2/Delivery3/CASH6, online/table exclusions. CI/clientbuild/fullserver/invariants/E2E απαιτούνται. Δεν δηλώνεται πλήρης wizardPASS. Acceptance: Διαδόχου σωστήεταιρεία,readback1POS,φόρμα ενόςEFTPOS,άλλοterminalαμετάβλητο. Physical tests δεν επαναλαμβάνονται για docs.
