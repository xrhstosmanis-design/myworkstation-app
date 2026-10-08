# Διαδόχου: αντιστοίχιση ΦΠΑ ανά ταμειακή

## Ανάληψη 08/10/2026 15:38 Europe/Athens

ASSIGNED codex/diadoxou-fiscal-profile-20261008, ανεξάρτητο εγκαταστασιακό σκέλος REMOTE-INSTALL-01. Οι υπάρχοντες remote wizard, TODAY-02/TODAY-04, Gate 3/4/6/8 και λοιποί owners διατηρούνται. Ακριβές scope: επιλογή επιβεβαιωμένου fiscal VAT profile με την authenticated company/store ταυτότητα στο CAPDriver checkout, αντί της αποκλειστικής χρήσης του ιστορικού ΚΑΤ profile στο Διαδόχου. Καμία αλλαγή Kiosk Manager, προϊόντος, ΦΠΑ, stock, άδειας, credentials, schema, πληρωμών, writer ή fiscal state machine.

## Νεότερα πραγματικά τεκμήρια

- Πραγματικό company cmulmjjoa000oqlbfyi0h53ju/store cmulmjjoc000qqlbf2bn2ifj0/terminal DIADOXOU-POS-01, Windows Kiosk-User. Το κατάστημα χρησιμοποιεί παράλληλα Kiosk Manager για πελάτες· οι πωλήσεις του δεν επανακαταχωρίζονται.
- Μετά από reboot για Windows updates: 15:01 existing connection/folder check USER PASS, 15:04 WRITER OFFLINE, 15:06 WRITER ONLINE/fresh heartbeat15:06:48 μετά manual Start. Αυτόματη εκκίνηση Windows NOT TESTED.
- 15:09 καλάθι Αντώνης/Βάρδια, 1×ΝΕΡΟ 500ML/KM490/0.50€, κανονική τιμή. 15:12 συναλλαγές ενεργής βάρδιας: κανένα αποτέλεσμα, ώρα έναρξης08/10 14:11:14. Δεν υπήρξε πλήρης ανεξάρτητη πριν/μετά οικονομική/stock/Audit μέτρηση.
- 15:21 CASH προσπάθεια USER FAIL: "Kiosk VAT code, register department and VAT rate do not match the confirmed register profile". Καλάθι παραμένει, κανένα fiscal-pending modal. Ο κώδικας απορρίπτει τον συνδυασμό κατά το command build πριν INSERT RbsCapDriverV1Request/Sale· ανεξάρτητη production DB επαλήθευση απουσίας request/οικονομικών deltas NOT TESTED. Δεν ζητείται replay για κάλυψη κενού τεκμηρίωσης.
- 15:22 MyWorkStation καρτέλα KM490: ΦΠΑ13%, stock0. 15:28 Kiosk Manager καρτέλα ίδιο SKU: τιμή0.50€, «5.ΕΙΔΗ 13», stock-38. Αυτά είναι δύο διαφορετικά συστήματα/στιγμές, όχι stock delta ή κοινό αρχικό απόθεμα.
- 15:33 screenshot image(20261008-123336).png/file_00000000737082108273d7fa3d1861bd επιβεβαιώνει επιλεγμένη γραμμή «5.ΕΙΔΗ 13», Τμήμα5, ΦΠΑ13. Η παλιά καταγραφή 29/09 και guarded mapping script τεκμηριώνουν legacy code42/department5/13%, ενώ ο κοινός resolver χρησιμοποιεί ΚΑΤ42/2/13%. Η τρέχουσα authenticated Product.vatDepartmentId/live DB triplet δεν διαβάστηκε ανεξάρτητα.
- 15:24 αναφορά ότι η MyWorkStation «Διαχείριση» δεν ανοίγει παραμένει USER FAIL/OPEN με υπάρχον TODAY-04 owner. Δεν περιλαμβάνεται σε αυτή τη διόρθωση. Διαθέσιμος browser Platform Admin βρίσκεται σε sign-in wall, χωρίς authenticated readback.

## Προστατευμένα / αποδοχή

Προστατεύονται όλα τα υπάρχοντα ΚΑΤ10 profiles, cash/card payment mappings, tenant/license/shift gates, Windows-1253, no-dispatch-before-validation, one-shot/idempotency και card outcome handling. Το επιβεβαιωμένο προφίλ Διαδόχου προέρχεται από τα checkpoints/scripts29Sep, όχι από αντιγραφή ΚΑΤ ή σκέτο ποσοστό. Άγνωστη/ασύμφωνη τιμή παραμένει μπλοκαρισμένη. Η νέα company/store επιλογή δίνεται από τον server και όχι από το checkout body.

Πριν source edit: δημοσίευση claim στο main/greenCI. Έπειτα Node20 contract tests για όλα τα ιστορικά ΚΑΤ profiles, επιβεβαιωμένα Διαδόχου profiles, λάθος company/store/code/department/rate και generated water command department5/payment1. Πλήρες CI/build/invariants/E2E πριν merge και exact deployed revision πριν νέα φυσική δοκιμή. Source/CI PASS μόνο AWAITING DEVICE.

Φυσική cash/card/απόδειξη, ISSUED sale, μία payment/stock/Audit, current DB mapping και συνολικό go-live OPEN/NOT TESTED. Επόμενη φυσική δοκιμή μόνο με φρέσκο πριν/μετά, WRITER ONLINE, ταμειακή ελεύθερη από Kiosk και κανένα αβέβαιο αίτημα. Ο χρόνος εγκατάστασης5λεπτών δεν έχει πιστοποιηθεί.

## Source implementation — AWAITING DEVICE

Claim PR1880/headffcf6250, docs CI37778337537 SUCCESS, merged61a97f410c10c8a6bf4815333c7510885bc9dae7 before source edits. Current implementation branch codex/diadoxou-fiscal-profile-20261008 based on that main. Open PR collection inspected: no overlapping CAPDriver profile change; all prior owners remain.

Resolver now selects the seven already documented Diadoxou code/department/rate triplets only for exact authenticated company/store identity; otherwise the historical KAT10 map is unchanged. Services without a confirmed code stays rejected. Checkout passes req.user.companyId and the server-selected store.id; body identity cannot select the profile. Mismatching product versus department VAT, payment settings, one-shot queue, licensing/shift/tenant and monetary posting gates remain unchanged. No production mapping/stock/rate/payment/credential modification and no new fiscal command.

Node20 focused tests16/16 PASS: all seven Diadoxou triplets, protected KAT10, different/incomplete tenant identity, unknown/services/incorrect VAT/department, actual checkout command-builder statement produces HL/SL department5/13% and single CR1/0.50. This is isolated software evidence, not receipt/financial LAB PASS. Full local server/build, CI/E2E/Windows, publication and exact deployed revision pending at this entry. Management click failure remains with TODAY-04. Physical acceptance and independent current data readback OPEN.

Full local Node20 server suite1904PASS/0FAIL/4SKIP and build:production PASS. Generated unrelated kiosk-reports-audit.js build diff restored; source change remains only profile resolution and authenticated context at checkout plus meaningful regression tests. CI/PostgreSQL HTTP E2E/Windows and exact deployment still pending; no device acceptance claimed.
