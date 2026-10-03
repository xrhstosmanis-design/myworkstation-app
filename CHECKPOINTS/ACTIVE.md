## 03/10/2026 — TODAY-02 VAT Department product editing · AWAITING CI

- Από «Είδη τμήματος ΦΠΑ» το μολύβι ανοίγει επεξεργασία της πραγματικής καρτέλας προϊόντος και μετά την αποθήκευση επιστρέφει στην ίδια σελίδα/τμήμα. Δεν αλλάζει αυτόματα το VAT department από category.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-10-03-vat-department-product-edit.md`.

## 03/10/2026 — Larger card-terminal selector · AWAITING CI

- TODAY-01 claimed by current ChatGPT page. EFTPOS/card-terminal picker enlarged with large touch targets and responsive mobile layout. No RBS/CAPDriver/payment-routing behavior changed.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-10-03-card-terminal-picker-large-ui.md`.

## 03/10/2026 — RBS checkout itemSummary runtime fix · AWAITING CI

- With regclass errors cleared and Writer ONLINE, controlled 7UP €1.20 reached checkout but failed before Writer claim with ReferenceError: Cannot access 'itemSummary' before initialization at store-pos.js. RBS request snapshot now copies the already-resolved item summary and uses the final summary totals. No fiscal mapping/protocol change. No physical retry until green CI + exact deploy + clean logs.

## 03/10/2026 — Startup regclass cleanup · AWAITING CI

- After runtime reconciliation fix became LIVE, remaining regclass log errors were isolated to startup/repair helpers: online-transaction-actor-fix, repair-kat009-duplicate-sale and kat-online-ordering-bootstrap. All their to_regclass probes now cast to TEXT. These errors were startup maintenance paths, but production must be clean before next fiscal retest.

## 03/10/2026 — Runtime store-transactions regclass · AWAITING CI

- Root cause of the post-deploy recurrence found: the previous patch script was corrected, but the generated runtime file server/src/routes/store-transactions.js still contained the uncased OnlineOrder to_regclass query. Runtime route now casts to TEXT directly. No physical retest until CI + exact deploy + clean logs.

## 03/10/2026 — RBS follow-up: online reconciliation regclass · AWAITING CI

- After exact Render LIVE of 88def886, controlled 7UP €1.20 still failed before Writer claim; C:\\capture remained clean. Production logs identified the remaining Prisma regclass failure specifically in online shift reconciliation. Fixed the OnlineOrder existence probe to CAST(to_regclass(... ) AS TEXT). No fiscal mappings/Writer/CAPDriver settings changed. No more physical retries until green CI + exact deploy.

## 03/10/2026 — RBS CAP Driver v1 · production regclass fix · AWAITING CI

- KAT controlled cash test used 7UP 330ML, €1.20, confirmed VAT code 42 → register department 2 → 13%. POS returned internal error; cart remained open, no receipt printed.
- Writer stayed ONLINE. C:\\capture contained only CapDriverSVC_log; writer.log contained only WRITER_START, with no REQUEST_CLAIMED/REQUEST_WRITTEN/REQUEST_UNCERTAIN. Therefore no fiscal request reached the Writer/CAPDriver in this attempt.
- Render production logs around the attempt show Prisma failing to deserialize PostgreSQL regclass values. PR #1645 changes table-existence probes in store-pos.js to return TEXT to Prisma. No CAPDriver/AURORA/Writer/VAT/payment mapping changed.
- CI #37100955025 failed only checkpoint policy because the code commit did not include ACTIVE + a new CHANGES checkpoint. Windows CAPDriver parse/smoke job passed. Do not perform another physical sale until fresh CI passes, merge/deploy is exact, and production logs are checked.

## Workforce — POS camera QR scanner, AWAITING CI / DEPLOY / PHYSICAL TEST 02/10/2026\n\n- Mobile employee QR is visible; Store Mode «Κάρτα» previously supported only hardware scanner input. Added explicit camera QR scan using existing ZXing while preserving USB scanner and existing card-login backend. Checkpoint `CHECKPOINTS/CHANGES/2026-10-02-workforce-pos-camera-qr.md`.\n\n## Workforce — mobile PIN PASS / QR store-context fix AWAITING CI 01/10/2026\n\n- Production mobile login LAB POS 2 PASS; QR GET was rejected by STORE_MODE middleware because GET lacked explicit store context. Send session storeId as query and resolve it in requireStoreModule; entitlement remains enforced. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-card-store-context.md`.\n\n## Workforce — mobile PIN numeric validation root cause, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- Production message «Ελέγξτε τα στοιχεία εισόδου» traced to mobile-only Zod regex escaping; ordinary numeric PINs were rejected before bcrypt. Fixed to same 4–8 digit regex as normal POS. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-pin-regex.md`.\n\n## Workforce — mobile PIN 401 routing fix, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- `entry.jsx` reloaded `/store` on every 401, hiding the actual mobile-pin response. Employee-card mobile login now handles its own 401; normal Store/POS session reset unchanged. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-pin-401.md`.\n\n## Workforce — employee-card mobile login UI, AWAITING CI / DEPLOY / USER PHONE RETEST 01/10/2026\n\n- Mobile invitation showed full POS login. `employee-card=1` now gets compact «Η κάρτα μου» PIN-only UI; normal POS unchanged. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-card-login-ui.md`.\n\n## Workforce — stable invitation share modal, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- Desktop native share άνοιξε στιγμιαία και έκλεισε μετά το 500 fix. Προστίθεται σταθερό MyWorkStation modal με Αντιγραφή/WhatsApp/Viber/Κοινοποίηση. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-invite-share-modal.md`.\n\n## Workforce — mobile invitation 500 fix, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- Production USER test του #1598 απέτυχε στο «Αποστολή εφαρμογής». Διορθώθηκε block-scope `legacyEmployeeId` στο work-card response χωρίς αλλαγή QR/PIN/attendance/POS. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-invitation-500-fix.md`.\n\n## Workforce — mobile employee card, AWAITING CI / DEPLOY / LAB 01/10/2026\n\n- PR #1598 / `agent/workforce-mobile-card-20261001`: «Αποστολή εφαρμογής» + απομονωμένο mobile PIN login + «Η κάρτα μου» με υπάρχον Workforce QR. Δεν δημιουργεί POS session και δεν αλλάζει attendance IN/OUT. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-employee-card.md`.\n\n## Gate 5 — G5-P10 υπερπληρωμή POS2 +0,01 €, περιορισμένο UI LAB PASS 25/09/2026

## 02/10/2026 — Κεντρική επιλογή Τμήματος ΦΠΑ ανά προϊόν · MERGED / CI PASS / RENDER LIVE

- Ο κανόνας είναι επιλογή Τμήματος ΦΠΑ πάνω στο προϊόν, όπως στο Kiosk Manager. Η κατηγορία προϊόντος δεν επιλέγει ούτε αλλάζει τμήμα/συντελεστή. Η οθόνη εμφανίζει και το «Τμήμα ταμειακής» για να επιλέγεται το σωστό mapping.
- Η ομαδική αλλαγή τμήματος επαληθεύει ότι ο ήδη αποθηκευμένος συντελεστής προϊόντος ταιριάζει με το επιλεγμένο τμήμα· σε ασυμφωνία απορρίπτεται χωρίς αλλαγή. Η λειτουργία ενημερώνει μόνο `vatDepartmentId`, ποτέ `vatRate`.
- PR #1642 merged στο `main` ως `511c72c92da7ddddafbe9ce2032301ece730e9bc`; CI #4131 PASS. Το Render deploy `dep-db011du0tbcc73fo5pr0` επιβεβαιώθηκε `live`· νεότερο deploy του descendant `eb7e71d` περιλαμβάνει το fix και βρίσκεται σε εξέλιξη. Δεν άλλαξαν live προϊόντα ή ρυθμίσεις KAT/Kiosk Manager/RBS/CAP Driver/EFTPOS/Windows. Το προηγούμενο €1,20 παραμένει προς συμφωνία· μην επαναληφθεί συναλλαγή/εκτύπωση έως τότε. Αναλυτικό checkpoint: `CHECKPOINTS/CHANGES/2026-10-02-rbs-capdriver-v1-operator-confirm.md`.

## Workforce — mobile PIN PASS / QR store-context fix AWAITING CI 01/10/2026\n\n- Production mobile login LAB POS 2 PASS; QR GET was rejected by STORE_MODE middleware because GET lacked explicit store context. Send session storeId as query and resolve it in requireStoreModule; entitlement remains enforced. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-card-store-context.md`.\n\n## Workforce — mobile PIN numeric validation root cause, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- Production message «Ελέγξτε τα στοιχεία εισόδου» traced to mobile-only Zod regex escaping; ordinary numeric PINs were rejected before bcrypt. Fixed to same 4–8 digit regex as normal POS. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-pin-regex.md`.\n\n## Workforce — mobile PIN 401 routing fix, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- `entry.jsx` reloaded `/store` on every 401, hiding the actual mobile-pin response. Employee-card mobile login now handles its own 401; normal Store/POS session reset unchanged. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-pin-401.md`.\n\n## Workforce — employee-card mobile login UI, AWAITING CI / DEPLOY / USER PHONE RETEST 01/10/2026\n\n- Mobile invitation showed full POS login. `employee-card=1` now gets compact «Η κάρτα μου» PIN-only UI; normal POS unchanged. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-card-login-ui.md`.\n\n## Workforce — stable invitation share modal, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- Desktop native share άνοιξε στιγμιαία και έκλεισε μετά το 500 fix. Προστίθεται σταθερό MyWorkStation modal με Αντιγραφή/WhatsApp/Viber/Κοινοποίηση. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-invite-share-modal.md`.\n\n## Workforce — mobile invitation 500 fix, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- Production USER test του #1598 απέτυχε στο «Αποστολή εφαρμογής». Διορθώθηκε block-scope `legacyEmployeeId` στο work-card response χωρίς αλλαγή QR/PIN/attendance/POS. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-invitation-500-fix.md`.\n\n## Workforce — mobile employee card, AWAITING CI / DEPLOY / LAB 01/10/2026\n\n- PR #1598 / `agent/workforce-mobile-card-20261001`: «Αποστολή εφαρμογής» + απομονωμένο mobile PIN login + «Η κάρτα μου» με υπάρχον Workforce QR. Δεν δημιουργεί POS session και δεν αλλάζει attendance IN/OUT. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-employee-card.md`.\n\n## Gate 5 — G5-P10 υπερπληρωμή POS2 +0,01 €, περιορισμένο UI LAB PASS 25/09/2026

## RBS CAP Driver v1 — LIVE TEST FAILED / VAT FIX OPEN / WRITER SAFETY LOCAL PASS (02/10/2026)

- MyWorkStation POS showed Coca-Cola 500 ml, 13% VAT, €1.20. Owner pressed **Μετρητά** once; generic internal error; **no receipt printed**. Do not retry, resend, reprint, or duplicate; owner has left KAT.
- KAT Windows `CapDriverSVC` was Running, but `C:\\capture\\Xcommand.txt` was absent. Visible CAP log activity was from Kiosk Manager, not proof of this MyWorkStation dispatch. Root cause remains unknown; evidence does not establish whether dispatch reached the writer.
- Pairing was performed; do not copy/store the one-time secret. Saved Fiscal/EFTPOS mapping is separate from CAP Driver pairing/delivery and is not proof of a receipt.
- PR #1632 is merged at `874c6bd2e0c8efcf578e6ee2a98026d8057c5c6f`; CI #4097/#4099/#4107 passed and Render deployment `dep-davqli0u01pc73fpjphg` was verified. This is **not** physical acceptance.
- **VAT category correction:** PR #1635 adds company-scoped category → VAT-department mapping; POS will take fiscal register department from product category and reject mixed-rate category mappings without changing product VAT. CI #4117 failed the checkpoint policy gate before application tests; Windows PowerShell parse/writer smoke passed. Required docs are now in reopened PR #1635, but no fresh run is visible for head `63653f898d09f283e174e25107cabc5381a32b1e`. Do not merge/deploy until a full CI run passes. No live mappings changed.
- **Writer safety fix:** this branch requires a real authenticated writer poll within 15 seconds, blocks checkout while a paired writer is offline, quarantines unclaimed requests after 60 seconds, adds non-claiming `Test-Connection.ps1`, durable local diagnostics and visible ONLINE/OFFLINE status. Focused CAP tests 9/9, full server suite 1796 PASS / 1 SKIP and client build PASS locally. CI #4126 parsed all scripts and executed pairing, safe connection, one request write and dispatch acknowledgement, but its final assertion used a child-script-scoped counter and failed at 0; the isolated test counter is now global/namespaced with cleanup. Fresh CI, merge, deploy and physical acceptance remain pending.
- Next: merge/deploy only after full green CI. At KAT, reconcile the €1.20 attempt first and inspect dispatch/writer evidence read-only. Then verify the category-to-department mapping, run `Test-Connection.ps1`, start the writer, wait for `WRITER ONLINE`, and perform one separately identified controlled cash test. No retry while outcome is uncertain.
- Full evidence and exact steps: `CHECKPOINTS/CHANGES/2026-10-02-rbs-capdriver-v1-operator-confirm.md`.

---

## Workforce — mobile PIN numeric validation root cause, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- Production message «Ελέγξτε τα στοιχεία εισόδου» traced to mobile-only Zod regex escaping; ordinary numeric PINs were rejected before bcrypt. Fixed to same 4–8 digit regex as normal POS. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-pin-regex.md`.\n\n## Workforce — mobile PIN 401 routing fix, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- `entry.jsx` reloaded `/store` on every 401, hiding the actual mobile-pin response. Employee-card mobile login now handles its own 401; normal Store/POS session reset unchanged. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-pin-401.md`.\n\n## Workforce — employee-card mobile login UI, AWAITING CI / DEPLOY / USER PHONE RETEST 01/10/2026\n\n- Mobile invitation showed full POS login. `employee-card=1` now gets compact «Η κάρτα μου» PIN-only UI; normal POS unchanged. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-card-login-ui.md`.\n\n## Workforce — stable invitation share modal, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- Desktop native share άνοιξε στιγμιαία και έκλεισε μετά το 500 fix. Προστίθεται σταθερό MyWorkStation modal με Αντιγραφή/WhatsApp/Viber/Κοινοποίηση. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-invite-share-modal.md`.\n\n## Workforce — mobile invitation 500 fix, AWAITING CI / DEPLOY / USER RETEST 01/10/2026\n\n- Production USER test του #1598 απέτυχε στο «Αποστολή εφαρμογής». Διορθώθηκε block-scope `legacyEmployeeId` στο work-card response χωρίς αλλαγή QR/PIN/attendance/POS. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-invitation-500-fix.md`.\n\n## Workforce — mobile employee card, AWAITING CI / DEPLOY / LAB 01/10/2026\n\n- PR #1598 / `agent/workforce-mobile-card-20261001`: «Αποστολή εφαρμογής» + απομονωμένο mobile PIN login + «Η κάρτα μου» με υπάρχον Workforce QR. Δεν δημιουργεί POS session και δεν αλλάζει attendance IN/OUT. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-workforce-mobile-employee-card.md`.\n\n## Gate 5 — G5-P10 υπερπληρωμή POS2 +0,01 €, περιορισμένο UI LAB PASS 25/09/2026

- Φυσικό LAB POS2 απέρριψε COFFEE UNION/ΤΔΑ0012183 **344,54 €** έναντι διαθέσιμων **344,53 €** με σαφές μήνυμα. Μετά το τιμολόγιο 344,53 €, owner queue 0, LAB εικονική τράπεζα −43,62 €/αναμονή 0, POS1 1 κίνηση/0 έξοδα, POS2 16 κινήσεις/0,20 € έξοδα και ΚΑΤ 22,36 € ίδια. PASS μόνο client-side UI και απομόνωση· API/race, απόκλιση αποδεικτικού, τελική συμφωνία OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`.

## Gate 5 — G5-P09 UI ποσού και πληκτρολογίου, περιορισμένο LAB PASS 25/09/2026

- PR #1250 CI #3165 πράσινο, exact Render `a3a1a040`: στο BackOffice LAB viewport 1363×936 το παράθυρο x84–1264 περιέχει πλήρως το ποσό x985–1215 και το κουμπί πληκτρολογίου x1177–1211. Οπτικός έλεγχος σε δύο ανοικτά τιμολόγια COFFEE UNION, χωρίς νέα πληρωμή. Desktop UI PASS· μικρότερη οθόνη/φυσικό POS και χρήση πλήρους πληκτρολογίου NOT TESTED. G5-P09 οικονομικό περιορισμένο PASS, συνολικό Gate 5 OPEN.

## Gate 5 — G5-P09 ολική εικονική τραπεζική πληρωμή ιδιοκτήτη, περιορισμένο LAB PASS · UI AWAITING LAB 25/09/2026

- [x] Render `55dbbf3`, FRESH/ΒΒ 6529 46,92→0 €, LAB εικονική τράπεζα επιβεβαιωμένη 3,30→−43,62 €, αναμονή/ουρά 0, POS1 1 κίνηση/0 έξοδα, POS2 16 κινήσεις/0,20 € έξοδα και ΚΑΤ 22,36 € αμετάβλητα. Audit αυτόματη επιβεβαίωση 13:19 χωρίς δεύτερη έγκριση. Αρνητικό LAB bank balance ως περιορισμός· κανένα πραγματικό έμβασμα. Στενή φόρμα/πληκτρολόγιο εκτός παραθύρου: bounded UI fix, frontend build PASS, CI/deploy και οπτικό LAB **AWAITING LAB**. Διπλή/υπερπληρωμή, mismatch, τελική συμφωνία OPEN. `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`.

## Gate 5 — G5-P08 κεντρικό Audit ακύρωσης, περιορισμένο LAB PASS 25/09/2026

- PR #1243 CI #3147 πράσινο, Render `94ae647`: παλιά ακύρωση FRESH 46,92 € ορατή μία φορά στα Συμβάντα 12:36 Αθήνας, LAB. Εικονική τράπεζα LAB 3,30 € επιβεβαιωμένο/0 € αναμονή, ΚΑΤ 22,36 € ίδιο. Το όνομα χειριστή εμφανίζεται ως τεχνικό ID, όριο αναγνωσιμότητας. Καμία νέα οικονομική πράξη. Ολική εξόφληση και τελική συμφωνία OPEN.

## Gate 5 — G5-P08 ορατό Audit ακύρωσης, AWAITING LAB 25/09/2026

- Νέα ανάγνωση LAB τράπεζας 3,30 € λογιστικό/επιβεβαιωμένο, 0 € αναμονή· ΚΑΤ 22,36 € ίδιο. Το συμβάν `SUPPLIER_SETTLEMENT_CANCELLED` καταγράφεται από API αλλά το κεντρικό Audit δεν το εμφάνιζε επειδή έλειπε από το φίλτρο τύπων. Προστίθεται προβολή/ετικέτα· CI/deploy και LAB ανάγνωση του υπάρχοντος συμβάντος εκκρεμούν. Δεν γίνεται νέα πληρωμή. Το περιορισμένο PASS ακύρωσης παραμένει, συνολικό Gate 5 OPEN.

## Gate 5 — G5-P08 ακύρωση εκκρεμούς, περιορισμένο LAB PASS 25/09/2026

- Μετά PR #1237/#1241, πράσινα CI #3135/#3143 και ακριβές Render `90ec8b7`: μία ακύρωση της λανθασμένης CASH_SHIFT FRESH/ΒΒ 6529 46,92 € επανέφερε POS2 **17→16 ενεργές κινήσεις**, έξοδα **47,12→0,20 €**, ουρά **0 €**, κεντρικές δεσμεύσεις **0 €**, οφειλή ΒΒ 6529 **46,92 €**. Πωλήσεις POS2 7,00 € μετρητά/0,50 € κάρτες/0 IRIS αμετάβλητες. POS1 είχε κλείσει από Gate4· τράπεζα και ακριβές audit ακύρωσης **NOT TESTED**. Η αρχική λανθασμένη μέθοδος παραμένει ιστορικό FAIL. Ολική εξόφληση και τελική συμφωνία OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`, manual `docs/manual/payments/PASS.md`.

## Gate 5 — G5-P07 έξοδο χειριστή POS2, περιορισμένο LAB PASS 25/09/2026

- Μία εικονική δαπάνη 0,10 € από ενεργή βάρδια POS2 με αρχικό PDF στις 11:03: 15→16 κινήσεις, έξοδα 0,10→0,20 € ήδη σε αναμονή, μία ουρά 0,10 €. Μία έγκριση ιδιοκτήτη 11:11: ουρά 0, ενεργή `#pay_5327…`, δύο διακριτά audit γεγονότα υποβολής/έγκρισης. Πωλήσεις POS2 7,50 €, LAB τράπεζα 3,30 €, POS1 και ΚΑΤ 22,36 € αμετάβλητα. Συνολικό Gate 5 OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`, manual `docs/manual/payments/PASS.md`.

## Gate 5 — G5-P06 λοιπό έξοδο ιδιοκτήτη, περιορισμένο LAB PASS 25/09/2026

- PR #1222/CI #3095, deployed `352f636a`: μία BackOffice «Λοιπά Έξοδα» ιδιοκτήτη 0,10 € `G5-P06 VIRTUAL LAB` στις 10:37, αναφορά `#pay_3ffd…`, τράπεζα LAB λογιστικό/επιβεβαιωμένο 3,40→3,30 €, αναμονή και ουρά 0, POS2 14 κινήσεις/0,10 € έξοδα ίδια, POS1 1/0 ίδιο, ΚΑΤ 22,36 € ίδιο. Μόνο η πράξη ιδιοκτήτη χωρίς δεύτερη έγκριση PASS· POS δαπάνη/τελική συμφωνία OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`, manual `docs/manual/payments/PASS.md`.

## Gate 5 — G5-P05 κατάθεση με αρχικό PDF, περιορισμένο LAB PASS 25/09/2026

- Μία κατάθεση 0,10 € LAB POS 2 με αρχικό PDF: 13→14 κινήσεις, PENDING_REVIEW, LAB λογιστικό 3,30→3,40 €, αναμονή 0→0,10 €, μετά μία έγκριση ιδιοκτήτη στις 10:04, επιβεβαιωμένα 3,30→3,40 €, αναμονή 0, audit διαφορά 0. POS 1/ΚΑΤ ίδια. Γενικό «Ανανέωση» BackOffice δεν φόρτωνε ουρά ιδιοκτήτη· UI fix στο παρόν PR, επανέλεγχος μετά deploy. Gate 5 συνολικά OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`, manual `docs/manual/payments/PASS.md`.

## Gate 5 — G5-P04 εικονική κατάθεση, περιορισμένο LAB PASS 25/09/2026

- LAB POS 2: μία κατάθεση 0,10 € χωρίς αρχικό αποδεικτικό, μετά ίδιο PDF 0,10 € και αυτόματη αντιστοίχιση 09:25. Εικονική LAB τράπεζα επιβεβαιωμένα 3,20→3,30 €, αναμονή 0,10→0,00 €· POS 2 κινήσεις 12→13, πωλήσεις/έξοδα αμετάβλητα, POS 1 και ΚΑΤ αμετάβλητα. Κατάθεση με αρχικό PDF, απόκλιση, φυσικό συρτάρι και όλο το Gate 5 OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`, manual `docs/manual/payments/PASS.md`.

# ACTIVE CHECKPOINT

- Ενεργή αλλαγή: 2026-09-22 — FRESH SNACK: διόρθωση του κεντρικού προφίλ στο πραγματικό ΑΦΜ `999162880`, ώστε να ενεργοποιείται η ένωση των 18 μισών γραμμών σε 9 προϊόντα.
- Checkpoint αλλαγής: `CHECKPOINTS/CHANGES/2026-09-22-fresh-snack-correct-tax-id.md`

- Ενεργή αλλαγή: 2026-09-22 — FRESH SNACK: ένωση κάθε τυπωμένης γραμμής προϊόντος με την αμέσως επόμενη αριθμητική συνέχεια, με υποχρεωτική συμφωνία γραμμών και footer πριν γίνει αποδεκτή.
- Checkpoint αλλαγής: `CHECKPOINTS/CHANGES/2026-09-22-fresh-snack-wrapped-line-pairs.md`

- Ενεργή αλλαγή: 2026-09-22 — POS: η τυπωμένη μονάδα `pc` θεωρείται τεμάχιο και δεν πολλαπλασιάζεται ξανά από `8TMX/9TMX/10TMX` της περιγραφής.
- Checkpoint αλλαγής: `CHECKPOINTS/CHANGES/2026-09-22-pos-pc-quantity-no-double-conversion.md`

- Ενεργή αλλαγή: 2026-09-22 — Invoice Learning: η αλλαγή ΦΠΑ ενημερώνει άμεσα τη γραμμή, τα σύνολα και την επαγγελματική προβολή.
- Checkpoint αλλαγής: `CHECKPOINTS/CHANGES/2026-09-22-invoice-learning-vat-live-update.md`

- Ενεργή αλλαγή: 2026-09-22 — Invoice Learning: popup προτάσεων στα πεδία «Μονάδα τιμολογίου» και «Μονάδα stock», με διατήρηση ελεύθερης πληκτρολόγησης.
- Checkpoint αλλαγής: `CHECKPOINTS/CHANGES/2026-09-22-invoice-learning-unit-suggestions.md`

- Ενεργή αλλαγή: 2026-09-22 — Invoice Learning: ασφαλής αναγνώριση κανονικού τιμολογίου πώλησης, χωρίς ψευδή μετατροπή σε πιστωτικό από αρνητικό προηγούμενο υπόλοιπο ή άσχετη αναφορά επιστροφής.
- Checkpoint αλλαγής: `CHECKPOINTS/CHANGES/2026-09-22-invoice-learning-explicit-document-type.md`

- Ενεργή αλλαγή: 2026-09-22 — Invoice Learning: επαναφορά πριν από τα λανθασμένα crops και σύνδεση της ίδιας δοκιμασμένης προεπεξεργασίας φωτογραφίας που χρησιμοποιεί το POS.
- Checkpoint αλλαγής: `CHECKPOINTS/CHANGES/2026-09-22-invoice-learning-rollback-crop-reader.md`

- Ενεργή αλλαγή: 2026-09-22 — Invoice Learning: ο πίνακας προσαρμόζεται στο πλάτος οθόνης χωρίς δεξιά–αριστερά.
- Checkpoint αλλαγής: `CHECKPOINTS/CHANGES/2026-09-22-invoice-learning-no-horizontal-scroll.md`

- Ενεργή αλλαγή: 2026-09-22 — Invoice Learning: Enter → επόμενο κελί, πλήρης κάθετη προβολή και χρωματισμός επιβεβαιωμένων γραμμών.
- Checkpoint αλλαγής: `CHECKPOINTS/CHANGES/2026-09-22-invoice-learning-review-navigation.md`

- Ενεργή αλλαγή: 2026-09-22 — Invoice Learning: η παλιά λίστα «Εκκρεμή Barcodes» κρυφή στην αρχική φόρτωση και διαθέσιμη μόνο από το κουμπί.
- Checkpoint αλλαγής: `CHECKPOINTS/CHANGES/2026-09-22-invoice-learning-collapse-pending-barcodes.md`
- PR: #1060 — περιμένει πράσινο CI και merge.

- Ημερομηνία: 2026-09-14
- Εργασία: Gate 3 — πληρωμένο τιμολόγιο εμφανίζεται αμέσως στα Πρόχειρα BackOffice
- Κατάσταση: LAB `2612188`: αποθηκεύτηκε κεντρικό InvoiceSupplierReadingProfile για ΑΦΜ `998878583`, από το επιβεβαιωμένο checkpoint των 38 γραμμών / 608 τεμαχίων / `2.369,99 €`. Ο κανόνας κρατά μόνο τις θέσεις των στηλών λιανικής, μονάδας, ποσότητας και αγοράς· οι τιμές κάθε νέου τιμολογίου διαβάζονται αποκλειστικά από το δικό του πρωτότυπο.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-14-gate3-paid-draft-before-ai.md`

## Κανόνες δοκιμής

- Η γρήγορη φόρμα τιμολογίου κλείνει άμεσα ώστε να συνεχίζεται η πώληση και η λίστα Παραγγελίες & Αγορές δείχνει το νέο πρόχειρο.
- Η ένδειξη στην πράσινη κεφαλίδα δείχνει μόνο την κατάσταση της παραλαβής: επεξεργασία, επιτυχία BackOffice ή αποτυχία.
- Σε επανάληψη αναγνωρίζεται και επαναχρησιμοποιείται η υπάρχουσα πληρωμή· δεν γίνεται δεύτερη χρέωση.
- Stock και οριστικοποίηση παραμένουν BackOffice-only.

## Επόμενο βήμα

1. Πράσινο CI, merge και deploy της δημιουργίας πρόχειρου πριν την πλήρη AI ανάγνωση.
2. LAB: οι δύο σελίδες του `2612188` διαβάζονται ξανά σε μία ενιαία προεπισκόπηση με 38 γραμμές, 608 τεμάχια και `2.369,99 €`, σωστή λιανική/αγορά/ποσότητα και χωρίς νέα πληρωμή.
3. Επιβεβαίωση ότι η πλήρης ανάγνωση συμπληρώνει αυτόματα τις γραμμές στο ίδιο πρόχειρο· καμία δεύτερη πληρωμή, stock κίνηση ή οριστικοποίηση.

## Workforce V2 — καρτέλες Προγράμματος & AI draft version — 2026-09-23

- Κατάσταση: σε CI πριν από merge.
- Το Πρόγραμμα & Άδειες χωρίζεται σε AI Πρόγραμμα, Βάρδιες, Άδειες & Ρεπό και Audit ώστε να αφαιρεθεί το μεγάλο scroll.
- Τα μηνύματα εμφανίζονται κάτω από την ενεργή πλοήγηση και η επιτυχής AI αποθήκευση μεταφέρει στις Βάρδιες.
- Η AI αποθήκευση δημιουργεί την επόμενη έκδοση της εβδομάδας και δεν συγκρούεται πλέον με υπάρχουσα έκδοση 1.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-section-tabs-ai-version.md`

## Workforce V2 — εύκολη ροή και καθαρή εβδομάδα — 2026-09-23

- Κατάσταση: σε CI πριν από merge.
- Η αναλυτική εβδομάδα εμφανίζεται χωρίς επικαλύψεις, με responsive κάρτες ανά ημέρα και βάρδια.
- Οι καθημερινές ενέργειες χρησιμοποιούν αυτόματη αιτιολογία Audit· η δημοσίευση έχει μία απλή τελική επιβεβαίωση και ανοίγει την τελική εβδομάδα.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-easy-week-view.md`

- Διόρθωση δεύτερης δοκιμής Workforce: μεγαλύτερο modal και αυστηρή απομόνωση κάθε βάρδιας σε ξεχωριστή σειρά, χωρίς επικαλύψεις.

## Workforce V2 — Πρόγραμμα βαρδιών ΟΛΟΚΛΗΡΩΘΗΚΕ — 2026-09-23

- Κατάσταση: **PRODUCTION PASS / USER VISUAL PASS**.
- Ολοκληρώθηκε η ροή AI Πρόγραμμα → Πρόχειρο → Έλεγχος → Προεπισκόπηση → Έγκριση → Δημοσίευση.
- Ολοκληρώθηκαν οι ενότητες Βάρδιες, Άδειες & Ρεπό και Audit με χωριστή πλοήγηση.
- Οι συνηθισμένες ενέργειες γράφουν αυτόματη αιτιολογία στο Audit χωρίς επαναλαμβανόμενα textarea· χειροκίνητη αιτιολογία μένει στις κρίσιμες ενέργειες.
- Μετά τη δημοσίευση ανοίγει αυτόματα η τελική Αναλυτική εβδομάδα.
- Το modal είναι σχεδόν πλήρους οθόνης και κάθε ημέρα/βάρδια εμφανίζεται καθαρά, χωρίς επικαλύψεις.
- Ο χρήστης επιβεβαίωσε οπτικά την τελική παραγωγική προβολή.
- Production revision της τελικής οπτικής διόρθωσης: `5eb06f2c307029d044efe5cc8ea732b425c33154` (PR #1100, πράσινο CI #2813).
- **Να μη γίνει ξανά η εργασία του Προγράμματος βαρδιών. Επόμενο Workforce βήμα: Παρουσίες / Κάρτα εργασίας.**
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-easy-week-view.md`.

## Workforce V2 — Παρουσίες / Κάρτα εργασίας από POS — 2026-09-23

- Κατάσταση: LOCAL IMPLEMENTATION / AWAITING CI + LAB.
- Το άνοιγμα και κλείσιμο ταμειακής βάρδιας δημιουργεί και κλείνει αυτόματα την παρουσία του συνδεδεμένου εργαζομένου.
- Η υπέρβαση άνω των 8 ωρών απαιτεί έγκριση· καθυστέρηση/πρόωρη αποχώρηση/υπερωρία καταγράφονται για έλεγχο.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-pos-attendance.md`.

## Workforce V2 — κάρτα συναδέλφων από POS — 2026-09-23

- Κατάσταση: **AWAITING CI / LAB**.
- Νέο μικρό κουμπί «Κάρτα εργασίας» για προσέλευση/αποχώρηση μη ταμιών με προσωπική κάρτα, χωρίς αλλαγή χειριστή.
- Τα βοηθητικά κουμπιά POS έγιναν συμπαγή ώστε να μη σκεπάζουν πίνακες και modals.
- Η εργασία του Προγράμματος βαρδιών παραμένει ολοκληρωμένη και δεν επαναλαμβάνεται.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-pos-colleague-card.md`.

## Workforce V2 — πρόγραμμα ανά εργαζόμενο — 2026-09-23

- Κατάσταση: **AWAITING CI / LAB**.
- Προστίθεται προβολή ανά εργαζόμενο με όλες τις ημερομηνίες, ώρες βάρδιας και εμφανές ΡΕΠΟ.
- Οι νέες δημοσιεύσεις θα στέλνονται στο Store Chat με την ίδια ομαδοποίηση.
- Η ολοκληρωμένη προβολή ανά ημέρα διατηρείται χωρίς αλλαγή.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-schedule-by-employee.md`.

## Workforce V2 — εκτυπώσιμες κάρτες εργασίας — 2026-09-23

- Κατάσταση: **LOCAL PASS / AWAITING CI + LAB**.
- Δίπλα σε κάθε ενεργό εργαζόμενο του καταστήματος βάσης υπάρχει κουμπί «Εκτύπωση κάρτας».
- Η προεπισκόπηση είναι σε φυσικό μέγεθος κάρτας, χωρίς PIN ή άλλα ευαίσθητα στοιχεία, με Code 128 συμβατό με το υπάρχον POS.
- Η επανεκτύπωση κρατά τον ίδιο κωδικό και δεν αντικαθιστά σιωπηρά διαφορετική υπάρχουσα κάρτα.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-workforce-printable-cards.md`.

## POS — σάρωση κάρτας εργασίας με κάμερα — 2026-09-23

- Κατάσταση: **LOCAL PASS / AWAITING CI + LAB**.
- Στην επιλογή «Κάρτα» προστέθηκε κουμπί «Σάρωση με κάμερα» για ανάγνωση του Code 128 από την κάμερα PC/tablet.
- Παραμένουν διαθέσιμα το κανονικό barcode scanner, η χειροκίνητη εισαγωγή και το προσωπικό PIN.
- Η κάμερα κλείνει μετά την αναγνώριση ή όταν κλείσει/αλλάξει η επιλογή του παραθύρου.
- Checkpoint: `CHECKPOINTS/CHANGES/2026-09-23-pos-attendance-camera-scan.md`.

## Gate 5 — G5-P03 LAB PASS με περιορισμένο scope, 25/09/2026

- Χειριστής LAB-POS-02: μερική πληρωμή FRESH DELICACIES / ΒΒ 6529, 0,10 € μετρητά ενεργής βάρδιας και PDF· μία εκκρεμής έγκριση ιδιοκτήτη, κατόπιν μία επιβεβαίωση και μηδενισμός ουράς. Οφειλή 47,02→46,92 €, έξοδο POS 2 0,10 €, POS 1 και εικονική τράπεζα αμετάβλητα, Audit 08:46 με σωστό ΒΒ 6529. Χωριστή πώληση POS 2 0,90 € στις 08:33 εξηγεί την αύξηση των πωλήσεων μετρητών 3,80→4,70 €.
- Κατάσταση: μόνο αυτό το σενάριο PASS· συνολικό Gate 5 OPEN. Checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`, manual `docs/manual/payments/PASS.md`, κεντρική λίστα `docs/roadmap/PENDING_WORK.md`.
## Gate 5 — G5-P08 λάθος μέθοδος πληρωμής, LAB FAIL / AWAITING LAB διόρθωση 25/09/2026

- Μία ολική πληρωμή FRESH DELICACIES / ΒΒ 6529 **46,92 €** στο LAB POS2 καταχωρίστηκε στις 11:52 Αθήνας ως **μετρητά ενεργής βάρδιας**, ενώ το συνθετικό αποδεικτικό προέβλεπε τραπεζική μεταφορά. POS2 16→17 κινήσεις, έξοδα 0,20→47,12 € ήδη εν αναμονή, πωλήσεις 7,50 € ίδιες· POS1 1 κίνηση / 1,00 € / 0 έξοδα ίδιο. Μία εκκρεμής έγκριση 46,92 €. **Μη γίνει επιβεβαίωση ή δεύτερη πληρωμή.** Η υπάρχουσα «Απόκλιση» στο API μπορούσε να επιβεβαιώσει λανθασμένα. Διόρθωση σε εξέλιξη: διακριτή κατάσταση απόκλισης, ακύρωση εκκρεμούς με αναστροφή μίας κίνησης, εμφανής τρόπος πληρωμής στην ουρά. Αποδοχή μόνο με πράσινο CI, ακριβές deploy, μία ακύρωση και μετρημένη αποκατάσταση βάρδιας/οφειλής/ουράς, μετά φρέσκια νέα προετοιμασία. Το συνολικό Gate 5 παραμένει OPEN. Αναλυτικό checkpoint `CHECKPOINTS/CHANGES/2026-09-24-gate5-payments-assignment.md`.
## Gate 5 — G5-P08 ακύρωση με ασυμφωνία προβολής, LAB FAIL / AWAITING LAB 25/09/2026

- Deploy `148c6b1` και μία ακύρωση εκκρεμούς FRESH/ΒΒ 6529 46,92 € από τον ιδιοκτήτη: owner queue 1→0, Platform Admin δεσμεύσεις 46,92→0 €. BackOffice POS2 **μένει 47,12 € έξοδα / 17 κινήσεις**, επειδή η προβολή μετρά τις αναστραμμένες συναλλαγές `recent`, ενώ το backend `totals()` τις εξαιρεί. Διορθώνεται το frontend, νέα CI/deploy/LAB επαλήθευση εκκρεμούν. POS1 έκλεισε σε παράλληλη Gate4 εργασία, όχι μάρτυρας ανοιχτής βάρδιας. Μη γίνει νέα πληρωμή ώσπου να επαληθευτούν οφειλή, βάρδια, audit και τράπεζα. Συνολικό Gate 5 OPEN.
## Gate 3 — προτεραιότητα βοηθού μετά την πληρωμή, 26/09/2026

- Νεότερη οδηγία ιδιοκτήτη: μία πληρωμή POS δημιουργεί ένα επεξεργάσιμο πρόχειρο με φωτογραφίες· η οθόνη δείχνει «Ανάγνωση από βοηθό». Ο βοηθός διαβάζει και διορθώνει το ίδιο πρόχειρο. Η πρώτη αυτόματη ανάγνωση γραμμών είναι χωριστή μελλοντική βελτίωση. PR #1364: αντικαθιστά το κόκκινο τεχνικό OCR diagnostic μόνο όταν το πρόχειρο έχει ήδη παραδοθεί· πραγματική αποτυχία παράδοσης παραμένει σφάλμα. CI/deploy/LAB **AWAITING**. Τα ιστορικά FAIL, η επαλήθευση 17 γραμμών ΜΑΝΤΖΗΛΑ και η ασφαλής τελική καταχώριση OPEN. `CHECKPOINTS/CHANGES/2026-09-26-gate3-invoice-assistant-integration.md`.

## TABLE_SERVICE — προϊόντα παρασκευής ανά πόστο — 27/09/2026

- Κατάσταση: **END-TO-END LAB PASS** για προϊόντα, τραπέζι, δύο πόστα, ετοιμασία και πληρωμή.
- Δημιουργήθηκαν στο LAB τα δοκιμαστικά `LAB ΚΑΦΕΣ ΔΟΚΙΜΗΣ` και `LAB ΤΟΣΤ ΔΟΚΙΜΗΣ`, με απόθεμα 0. Δεν έγινε πώληση, πληρωμή ή μεταβολή βάρδιας.
- PR #1414, CI #3598 και exact production revision `7dd85a751f940bf2b6a53dfd5404913d22555ab3` **PASS**.
- LAB readback: ο καφές αποθηκεύτηκε στο `ΚΑΦΕ` και το τοστ στην `ΚΟΥΖΙΝΑ`, και τα δύο ως προϊόντα παρασκευής με αυτόματη εκτύπωση.
- Μία παραγγελία Γύρου 1 στο `ΤΡΑΠΕΖΙ LAB 1` διαχωρίστηκε σε `ΚΑΦΕ 1` και `ΚΟΥΖΙΝΑ 1`, ολοκληρώθηκε ανά πόστο και πληρώθηκε μία φορά μετρητά. Πώληση `b408a720-967c-4f72-9862-be56bc2485fd`, 3,00 €. Βάρδια MAIN 0→3,00 € / 0→1 συναλλαγή, LAB-POS-02 αμετάβλητη, τοπική ουρά 0, stock καφέ και τοστ 0→-1.
- Αναλυτικό checkpoint: `CHECKPOINTS/CHANGES/2026-09-27-table-service-restaurant-takeover.md`.
- Modifiers και ελεύθερη σημείωση είδους: **production LAB PASS** μετά τα PR #1428 και #1430· εμφανίστηκαν μαζί στην ουρά `ΚΑΦΕ` και το δελτίο ολοκληρώθηκε. Οικονομικά/stock αμετάβλητα, χωρίς πώληση ή πληρωμή. Αλλεργιογόνα ως first-class πεδίο παραμένουν OPEN.
