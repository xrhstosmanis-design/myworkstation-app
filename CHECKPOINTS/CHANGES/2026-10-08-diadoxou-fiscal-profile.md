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

## Δημοσίευση πηγαίας αλλαγής

PR1881/head390ad75ab690ceb3795407ac3d4937e3254d130f, fullCI37778813878 SUCCESS (server/build/invariants/isolated PostgreSQL HTTP E2E/Windows scripts). Merged509cc1b70f237576e49e769817756083c02c9221. Main fullCI37779205150 SUCCESS. Guarded Render run37779487306 SUCCESS. Public /api/health independently observed ok=true/revision509cc1b70f237576e49e769817756083c02c9221 on08Oct15:50Athens. Scope remains AWAITING DEVICE, not fiscal/financial acceptance.

## Handoff — εγκατάσταση OPEN

Ο ίδιος independent profile owner παραμένει έως φυσική αποδοχή ή ονομασμένη μεταβίβαση. Δημοσίευση source επιβεβαιωμένη, όχι USER fiscal PASS. Single next action: στο υπάρχον POS Διαδόχου εφαρμοστικό Ανανέωση (όχι browser restart ή νέο Pair), έπειτα Χειριστής→Συναλλαγές βάρδιας→Ανανέωση και φρέσκια read-only καταγραφή πριν πληρωμή. Χρειάζονται refreshed cash/card/IRIS/total/transaction count και KM490 stock/latest movement/Audit baseline στο ίδιο κατάστημα/βάρδια. Αν δεν είναι διαθέσιμη ανεξάρτητη μέτρηση, παραμένει NOT TESTED χωρίς επινοημένο delta. BackOffice πρέπει να επιβεβαιώσει Writer ONLINE, ταμειακή ελεύθερη από Kiosk, κανένα unresolved request πριν μία νέα, ξεχωριστά ταυτοποιημένη cash δοκιμή· οι παλιές αποτυχημένες προσπάθειες δεν επαναλαμβάνονται μόνο για τεκμηρίωση. Καμία ανακοίνωση full go-live από source CI ή ONLINE. Management navigation USER FAIL διατηρείται με TODAY-04 και δεν τροποποιήθηκε.


## 08/10/2026 16:07:02 Europe/Athens — reported CASH receipt LIMITED USER PASS

08Oct16:07:02Athens owner «ΒΓΗΚΕ» after one requested CASH sale1×KM490/ΝΕΡΟ500ML/0.50€: LIMITED USER PASS of reported physical receipt printing only. UI16:00 showed no transactions in active Αντώνης/Βάρδια opened14:11:14; stock was not available to owner16:02, so financial/stock/Audit deltas, receipt identifiers/content/VAT and independently observed single issuance remain NOT TESTED. Post-sale transaction readback is next; do not repeat the paid sale. Card/EFTPOS, autostart and full go-live remain OPEN. Existing owners retained.

Test identity DIAD-CASH-KM490-20261008-1605: existing company cmulmjjoa000oqlbfyi0h53ju/store cmulmjjoc000qqlbf2bn2ifj0/terminal DIADOXOU-POS-01, operator Αντώνης, active Βάρδια opened08Oct14:11:14, quantity1, requested methodCASH/0.50€. Owner declared «ΚΑΝΩ ΠΩΛΗΣΗ»16:05:30 and reported «ΒΓΗΚΕ»16:07:02; exact click/printing time and Sale/request/payment IDs are unknown. Source revision509cc1b was publicly verified healthy15:50 after green fullCI37778813878/main37779205150/guardedRender37779487306. Exact physical client/server revision at submission not independently read.

Before evidence, recorded here after action without retroactive claim: photo01-image-1791464416727.jpg at16:00 (file_000000001178824689c233ececd19024) displays no transactions in that active shift and own supplier/expense summary0; these are not separate measured cash/card/IRIS/sales-total or Audit balances. At16:02:42 owner «DEN EXEI STOK» means current stock was not obtained; do not convert this to stock0 or compare old MWS0/Kiosk-38 snapshots. No fresh stock/latest movement/Audit/other-terminal control baseline was recorded before the action. Fresh Writer ONLINE/no concurrent Kiosk/no unresolved request were conditions in the instructions, not independently observed at this action.

After evidence: direct owner report of receipt printing only. Receipt photograph/content/VAT/fiscal number, issued status, one sale/payment, transaction count/0.50€ readback, cash/card/IRIS/totals, stock/latest movement/Audit and unaffected Kiosk control remain NOT TESTED. No full measured financial/stock PASS and no full installation closure. Single next action is read-only Χειριστής→Συναλλαγές βάρδιας→Ανανέωση, photograph the existing sale; do not resubmit CASH or generate another receipt to fill evidence gaps. Card acceptance requires a separately identified fresh baseline later.


## 08/10/2026 16:10 — cash transaction owner readback / separate card delivery

08Oct16:10:10Athens owner «ΤΟ ΕΛΕΝΞΑ ΠΕΡΑΣΕ ΣΤΗΝ ΣΥΝΑΛΛΑΓΗ» confirms the same cash sale appears in transactions (limited USER readback PASS, no independently captured amount/ID/count/delta).16:10:30 owner «ΔΟΚΙΜΑΣΑ ΚΑΡΤΑ ΠΗΓΕ ΕΝΤΟΛΗ ΣΤΟ POS» confirms delivery of a separate card request to EFTPOS only; approved charge, fiscal receipt, card amount/request identities and financial/stock/Audit reconciliation remain NOT TESTED. Do not resubmit either payment. Card test before baseline was not captured; no inferred delta.

Requested card context is same terminal/operator/shift and1×KM490/0.50€, but the direct report does not independently expose the EFTPOS amount or actual item/quantity. The user initiated the card action before a separate measured baseline or instruction to submit; retain that fact, do not retroactively construct a before record. Next action is completion/readback of this already initiated card request, never a new request: correct displayed amount, one card presentation, wait for approved/declined/uncertain result and fiscal receipt. If uncertain, inspect existing request and EFTPOS outcome without automatic retry or duplicate charge. Public health observed during documentation session ok=true/revisioncbdec1c37950718c00bef2dfd3589bc1c146f316, which contains profile source509cc1b; exact physical submission revision remains unknown.


## 08/10/2026 16:11 — card canceled / no card available

08Oct16:11:03Athens owner canceled the separate card attempt on EFTPOS and in MyWorkStation, then reported it did not appear in transactions: LIMITED USER confirmation of canceled-card absence from displayed transactions only.16:11:40 owner confirms no payment card is available on site, so completed/approved card payment and fiscal receipt stay NOT TESTED, with no further card sale requested. Independent request final state, absence of charge, sale/payment/stock/Audit counts and deltas remain NOT TESTED. Cash receipt and reported cash transaction display remain separate accepted observations. Next installation action: save automatic Windows-user startup preference in the existing guide, without starting a second Writer or rebooting; saving/running that preference and restart behavior not yet confirmed.

No new financial action is authorized merely to document cancellation. Existing cash receipt is not replayed. Read-only future reconciliation can inspect the already canceled request. Successful physical card acceptance requires an actual card at a later separately identified attempt, fresh baseline and one-shot guarded submission. Full go-live remains OPEN; installation duration5minutes is still unverified.


## 08/10/2026 16:11:57 — owner accepts EFTPOS communication

08Oct16:11:57Athens owner «ΑΠΟ ΤΗΝ ΣΤΙΓΜΗ ΠΟΥ ΠΗΓΕ ΕΙΝΑΙ ΟΚ» explicitly accepts EFTPOS command delivery as sufficient for this connection check: LIMITED USER PASS of communication, not approved monetary card payment. No further card test is requested now; bank approval/charge/fiscal receipt and independent financial/stock/Audit effects remain NOT TESTED. Existing cash print/transaction-display confirmation preserved.

The assistant proceeds with the existing installer startup-preference step only. This is the same independent installation owner; no source/data/permission change and no new card command.


## 08/10/2026 17:37 — νέα CARD πώληση: περιορισμένο USER PASS

08/10/2026 17:35:41 Europe/Athens ο ιδιοκτήτης αναφέρει νέα πώληση με κάρτα. Στις17:37:18 απαντά «ναι» στην ενιαία ερώτηση αν εγκρίθηκε η πληρωμή, τυπώθηκε απόδειξη και εμφανίζεται στις Συναλλαγές: περιορισμένο USER PASS αυτών των τριών φυσικών/εφαρμοστικών αποτελεσμάτων στο υφιστάμενο Διαδόχου/DIADOXOU-POS-01. Πρόκειται για μεταγενέστερη ξεχωριστή πώληση, όχι επανάληψη ή ολοκλήρωση της ακυρωμένης κάρτας16:11. Ποσό, SKU/ποσότητα, Sale/request/payment/απόδειξη IDs, τρέχων χειριστής/shift ID και ακριβής revision της υποβολής δεν καταγράφηκαν ανεξάρτητα. Η πώληση έγινε ήδη από τον χρήστη πριν νέα baseline· δεν κατασκευάζουμε πριν/μετά. Ανεξάρτητη μοναδικότητα χρέωσης/receipt-content/VAT, οικονομικά/stock/Audit/control deltas παραμένουν NOT TESTED.17:35 αναφέρει επίσης «φύρα χ.απόδειξη»: καταγράφεται μόνο η αναφορά ενέργειας· σημασία/καταχώριση/stock effect NOT TESTED μέχρι διευκρίνιση. Καμία επανάληψη κάρτας ή φύρας, reboot ή νέα οικονομική δοκιμή για τεκμηρίωση. Προστατεύονται προηγούμενη CASH/ακυρωμένη κάρτα/επικοινωνία,17:16 save-message και17:20 WRITER ONLINE. Source profilePR1881/healthy509cc1b και installerPR1885/healthyb8632db είναι δημοσιευμένα τεκμήρια, όχι ανεξάρτητη ταυτοποίηση της φυσικής υποβολής17:35. Windows-login startup/recovery, πλήρης εγκατάσταση και χρόνος5λεπτών παραμένουν OPEN. Ίδιοι owners codex/diadoxou-fiscal-profile-20261008 και codex/remote-install-wizard-20261005, λοιπές αναθέσεις/TODAY/POS-AUDIENCE-CREDIT-01 αμετάβλητες. Checkpoint CHECKPOINTS/CHANGES/2026-10-08-diadoxou-fiscal-profile.md.

Next action: preserve the existing paid sale and its receipt; no retry. Only clarify the already reported waste action and inspect existing records if needed. Missing before/after evidence stays NOT TESTED; do not repeat either action to fill it.
