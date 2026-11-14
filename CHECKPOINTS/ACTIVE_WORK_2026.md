# MyWorkStation — Μικρό ενεργό μητρώο βοηθών

**Κατάσταση:** ΕΝΕΡΓΟ ΜΙΚΡΟ ΜΗΤΡΩΟ CI από το merge #3719 — το OPEN_WORK_TRACKER.md παραμένει authoritative για ownership/PASS.

Σκοπός: σύντομες, συχνές ενημερώσεις ανά εργασία χωρίς συνεχή επεξεργασία του μεγάλου `CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md`.

| Προτεραιότητα | Εργασία | Υπεύθυνος | PR / issue | Τρέχουσα κατάσταση | Επόμενο βήμα |
| --- | --- | --- | --- | --- | --- |
| 1 | Προσθήκη γραμμής από υπεύθυνο | /root | #3828 | Ενεργό στο Render · LAB PASS για προσθήκη σε πρόχειρο | [Αποτέλεσμα δοκιμής](CHANGES/2026-11-12-staff-invoice-add-line.md) |
| 1 | POS-MYDATA-QR-LEARNING-01 | Ενεργός χειρισμός τιμολογίων POS / myDATA | #3823 | [Κεντρική εκμάθηση επαληθευμένου QR ανά εταιρεία, ΑΦΜ προμηθευτή και τύπο παρόχου](CHANGES/2026-11-11-pos-mydata-qr-learning.md) · source candidate, όχι εγκατεστημένο / LAB NOT TESTED | Πλήρες CI, επαλήθευση στο υπάρχον LAB και δοκιμή πραγματικού scanner χωρίς νέα πληρωμή |\n| 1 | Επιμερισμός ΕΦΚ ανά τεμάχιο | Τιμολόγια προμηθευτών | #3820 | [Τοπικός έλεγχος προεπισκόπησης, καταχώρισης και περιθωρίου](CHANGES/2026-11-11-invoice-excise-per-piece.md) | Πλήρες CI και φιλοξενούμενη δοκιμή |
| 0 | POS shift close with invoice draft recovery | Current POS work | — | [Local candidate](CHANGES/2026-11-10-pos-shift-invoice-draft-guard.md), focused 19 PASS and isolated native PostgreSQL 24 PASS | CI and existing LAB validation |
| 0 | INVOICE-OWNER-FINALIZATION-01 (#28) | Εγκεκριμένη υλοποίηση / παράλληλος πιλότος Claude | #2705, #3715, #3725, #3726, #3727, #3728, #3729 | [Υλοποίηση #3727](CHANGES/2026-11-08-invoice-owner-posting.md), 81 τοπικοί έλεγχοι. Χωριστός πιλότος Claude | 5.959 δοκιμές server πέρασαν. Διορθώθηκε το fixture του καταλόγου. Νέο CI και LAB πριν από πραγματικό παραστατικό; Claude preview lineAudit #3731 merged (CI PASS); BackOffice lineAudit UI #3737 merged (CI PASS, LAB NOT TESTED); Claude workflow scope fix #3741 MERGED (CI PASS); [server cancel step](CHANGES/2026-11-08-invoice-owner-finalization-cancel.md) Claude native-DB 11/11 on initial commit; coordinator added terminal CANCELLED guards and tests; #3743 exact-head CI #9501 PASS; LAB NOT TESTED; BackOffice owner cancel dialog UI #3746 Draft, exact-head CI/LAB pending |
| 0 | INVOICE-OWNER-FINALIZATION-01 / Two-page assistant reopen | Retained #28 owner | #3727 | [Isolated test 2/2 PASS](CHANGES/2026-11-08-invoice-assistant-reopen-two-page-isolated.md) | Hosted LAB pending |
| 0 | INVOICE-OWNER-FINALIZATION-01 / BackOffice multi-photo intake | Retained #28 owner | #3775 | [Dispatch correction](CHANGES/2026-11-09-backoffice-multi-photo-dispatch-fix.md) | Hosted selector and same draft reopen passed; second photo missing in Assistant; loader deployed; hosted replay exposed legacy create interceptor; [#3790 hosted: 2/2 read, draft creation rejected](CHANGES/2026-11-10-backoffice-invoice-reviewed-source.md); [#3804 hosted: draft and return verified, second photo missing](CHANGES/2026-11-10-backoffice-invoice-page-transport.md); [#3807 hosted LAB PASS: both originals after return](CHANGES/2026-11-10-backoffice-invoice-two-page-lab-pass.md); [repeated-code price correction](CHANGES/2026-11-10-invoice-repeated-code-line-prices.md) [LAB preview PASS](CHANGES/2026-11-12-invoice-repeated-code-lab-pass.md) |
| 1 | AUTO-REPORT-OBSERVABILITY-01 | υπάρχουσα ανάθεση — επιβεβαίωση tracker | #2704 | Preview verified; email delivery NOT TESTED | Verify recipients and controlled send |
| 1 | OCR-CONFIDENCE-01 | υπάρχουσα ανάθεση — επιβεβαίωση tracker | #3706, #3709 | Code merged; hosted LAB NOT TESTED | LAB confidence and multipage checks |
| 2 | INVOICE-HEADER-LATENCY / σύγκρουση ποσών σε φωτογραφίες | /root | #3688, #3732, #3733 | Hosted LAB PASS for payable order and review prompt | Physical POS, real-photo repeatability, invoice number and issuer VAT remain open |
| 2 | INVOICE-HEADER-LATENCY / μοναδικό ανεπιβεβαίωτο πληρωτέο | /root | #3688, #3777, #3787 | VAT table payable check implemented and tested locally | Awaiting CI and real-photo LAB retest |
| 2 | INVOICE-HEADER-LATENCY / αριθμός από πολλαπλές φωτογραφίες | /root | #3688, #3739, #3740 | Hosted LAB PASS for number agreement and conflict review | Single candidate proof, real-photo accuracy, issuer VAT and physical POS remain open |
| 2 | INVOICE-HEADER-LATENCY / ΑΦΜ προμηθευτή από φωτογραφίες | /root | #3688, #3748, #3750 | Hosted LAB PASS for VAT agreement and conflict review | Lone candidate, real photos and physical POS remain open |
| 2 | INVOICE-HEADER-LATENCY / ΑΦΜ εκδότη και παραλήπτη | /root | #3688, #3755, #3756 | Hosted LAB PASS for same-VAT review and distinct-VAT control | Unknown or unrelated VAT misread, real photos and physical POS remain open |
| 2 | AI-WALLET-HISTORY-02 | υπάρχουσα ανάθεση — επιβεβαίωση tracker | #3713 | Draft; LAB NOT TESTED | Scoped LAB acceptance |
| 0 | FTEXT-STATUS-ORPHAN-01 / CMD option 9 | retained FTEXT recovery owner | #3695, #3721, #3724 | Source d6fc7958 CI 6/6 PASS; source branch rebased, exact-head CI pending; physical NOT TESTED | Verify native PS5.1 and full PR CI; merge approved by owner; separate approval required for PC install |
| — | Claude automation | Συντονιστής | #3714, #3716, #3717, #3718, #3719 | Compact registry merged in #3719; isolated policy tests PASS in #3718; old central CI #9416 FAIL | Read-only Claude pilot #2 PASS per owner screenshot; invoice write pilot #3725 merged; run #42504018843 Claude step succeeded, git push auth failed; auth fix #3726 merged; push trigger merged #3728 but run not observed; issue-comment trigger proposed; line-audit step on owner reopen added (CI/LAB NOT TESTED, see CHANGES/2026-11-08-invoice-owner-finalization-line-audit.md) |
| 1 | CASH-UNIFIED-AUDIT-15 | retained cash owner | #3708, #3711, #3712, #3736 | Personal preview, one native send and inbox delivery PASS; financial HOLD | [Delivery receipt](CHANGES/2026-11-08-cash-personal-test-delivery.md) · [Layout #3745: production preview PASS; new-layout delivery NOT TESTED](CHANGES/2026-11-09-cash-owner-email-layout-preview.md) · [Readable evidence candidate](CHANGES/2026-11-09-cash-owner-report-readable-evidence.md) · [Return evidence candidate](CHANGES/2026-11-10-cash-return-evidence.md) · [Return preview PASS; paper scope candidate](CHANGES/2026-11-10-cash-paper-report-scope.md) · [Complete evidence claim](CHANGES/2026-11-10-cash-complete-evidence-claim.md) · [Reading reasons candidate](CHANGES/2026-11-10-cash-paper-reading-reasons.md) · [EFTPOS slip difference](CHANGES/2026-11-10-cash-eftpos-slip-difference.md) · [Netlink shift ledger](CHANGES/2026-11-10-cash-netlink-shift-ledger.md) · [Netlink slip comparison](CHANGES/2026-11-10-cash-netlink-slip-comparison.md) · [Selected paper preparation](CHANGES/2026-11-10-cash-selected-paper-preparation.md) |
| — | PLATFORM-COMPANY-LAYOUT-02 | Συντονιστής | #3734 | Chromium layout fixture PASS στα 1920, 1024 και 390 px. `wholesale-isolated-lab` PASS στο CI #9481 | Πλήρες CI στο νέο commit και έλεγχος με σύνδεση πριν από δημοσίευση. [Checkpoint](CHANGES/2026-11-08-platform-company-layout-compact.md) |

| 1 | INVENTORY-RECONCILIATION-01 | retained /root | #3693, #3696, #3645 | FREE/FREE two-code comparison, PDF and XLSX: scoped LAB PASS | Cross-code identity, physical warehouse/time and verified originals remain open |
| — | Invoice stock selection after stocktake | Συντονιστής | #28 | Δύο απομονωμένα σενάρια τιμολόγησης και ακύρωσης πέρασαν | Πλήρες CI και λειτουργικός έλεγχος στο υπάρχον LAB. [Checkpoint](CHANGES/2026-11-10-invoice-stock-selection.md) |
| — | Invoice stock exclusion email | Συντονιστής | #3785 | Local queue and retry simulation | Full CI and LAB SMTP pending. [Checkpoint](CHANGES/2026-11-10-invoice-stock-exclusion-email.md) |
| — | INVENTORY-CATALOG-XLSX-01 | /root | #3798, #3801 | [Ανάθεση](CHANGES/2026-11-10-inventory-catalog-xlsx.md) · Υλοποίηση σε branch, LAB NOT TESTED | CI και δοκιμή XLSX όλων/επιλεγμένων στο υπάρχον LAB |
| — | STORE-CATALOG-APPEND-XLSX | /root | #3811 | Implementation candidate · LAB NOT TESTED | Verify in CI and existing LAB |
| — | OWNER-SHIFT-TIME-FILTER | /root | — | Assigned · LAB NOT TESTED | Add optional hours to the date range and verify in LAB |
| 1 | Email delivery history | /root · feat/email-delivery-history | #3793 | IN REVIEW · SMTP evidence and store history | [Checkpoint](CHANGES/2026-11-12-email-delivery-history.md) |

## Κεντρικός συντονισμός σελίδων — 13/11/2026

Η παρούσα σελίδα συντονισμού αναλαμβάνει τη συνέχεια του «Ελέγχου αναθέσεων εκκρεμοτήτων». Οι υπεύθυνοι των ήδη ανατεθειμένων εργασιών παραμένουν στις εγγραφές τους στο OPEN_WORK_TRACKER.

**Υποχρεωτικό για όλες τις ανατεθειμένες σελίδες:** Κάθε σελίδα καταγράφει την πρόοδο στο `CHECKPOINTS/ACTIVE_WORK_2026.md` στον κλάδο εργασίας της και τη συμπεριλαμβάνει στο PR της. Μετά από κάθε ουσιαστικό βήμα γράφει σύντομη ενημέρωση με ώρα Ελλάδας, όνομα σελίδας, εργασία, υπεύθυνο και branch, αποτέλεσμα ανά δοκιμή (PASS / FAIL / NOT TESTED), σύνδεσμο και ακριβές commit για CI ή LAB, εκκρεμότητα και επόμενο βήμα. Τα αναλυτικά τεκμήρια συνδέονται από `CHECKPOINTS/CHANGES/`. Ο συντονιστής διασταυρώνει τις ενημερώσεις και επιλύει επικαλύψεις. Αλλαγή υπευθύνου απαιτεί ονομασμένη παράδοση και ενημέρωση του OPEN_WORK_TRACKER. Ένα PASS καλύπτει το σενάριο που δοκιμάστηκε.

| Ομάδα από την προηγούμενη σελίδα | Επιβεβαιωμένη κατάσταση | Επόμενο βήμα |
| --- | --- | --- |
| Τιμολόγια και POS | [#3844](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3844) merged, 3/3 τοπικοί έλεγχοι αντιστοίχισης. [#3822](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3822) merged για κενά πρόχειρα myDATA. | Επιβεβαίωση του QR POS σε υπάρχον LAB με επαληθευμένο παραστατικό και τεκμήριο. |
| Απογραφή | [#3841](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3841) draft, CI 4/5 με αποτυχίες PostgreSQL restore. [#3771](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3771) CI PASS στο `81afd657`, εκκρεμεί συγχρονισμός με main. [#3858](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3858) draft με τεκμήριο LAB για κίνηση αγοράς +2. | Απομόνωση αποτυχιών, συγχρονισμός, δοκιμές στο υπάρχον LAB. Full Audit: επαλήθευση πρωτοτύπου myDATA και πραγματικής ώρας φυσικής παραλαβής. |
| Email και απόδοση | [#3793](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3793) και [#3834](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3834) merged. [#3827](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3827) ανοικτό για polling, SQL και μετρήσεις HTTP. | Τεκμήριο πραγματικής παραλαβής email και μετρήσεις πριν/μετά στο υπάρχον LAB. |

### Πρώτος έλεγχος συντονισμού — 13/11/2026 22:18 ώρα Ελλάδας

- Κεντρικός συντονισμός · [PR #3860](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3860): [CI #9823 PASS](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43499363517) στο `ee6627a0`. Εκκρεμεί ενσωμάτωση του κοινού κανόνα στο main και επιβεβαίωση ενημερώσεων από τους υπεύθυνους.
- Απογραφή · #3841: [CI #9770 FAIL](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43300522469) στο `3acf060c`, με αποτυχίες PostgreSQL restore. Το GitHub τώρα το δείχνει mergeable. #3771: [CI #9573 PASS](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/42631870100) στο `81afd657`, παραμένει μη mergeable. #3858: τεκμήριο LAB στο branch, εκκρεμεί CI στο `83619dd0`.
- Email και απόδοση · #3827: [CI #9735 PASS](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43104586861) στο `9fd6067e`, η εγγραφή του branch αναφέρει ακόμη CI PENDING. Παραμένει μη mergeable. Εκκρεμούν οι μετρήσεις LAB και το τεκμήριο παραλαβής email.
- Τιμολόγια και POS · Ο κλάδος του #3844 έχει το ενεργό μητρώο. Εκκρεμεί εγγραφή του ελέγχου QR POS με τεκμήριο LAB.

### Διασταύρωση νεότερων τεκμηρίων — 13/11/2026

- Τιμολόγια · Το [#3853](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3853) είναι merged. [CI #9805 PASS](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43485507790) στο `d815bee1`. Η διαγραφή του κωδικού προμηθευτή κατά την αποθήκευση barcode τεκμηριώνεται στο [checkpoint](CHANGES/2026-11-13-invoice-clear-supplier-code.md). Για τα τρία είδη χρειάζεται έλεγχος της πραγματικής αντιστοίχισης και του αποθηκευμένου barcode ανά γραμμή. Η συγχώνευση του κώδικα δεν τεκμηριώνει τις τρεις καταχωρίσεις.
- Συντονισμός · [CI #9824 PASS](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43500322685) στο `98ae7b95`. Ο έλεγχος ταξινόμησης και οι δύο έλεγχοι Windows πέρασαν. Τα `build-and-test` και `wholesale-isolated-lab` παραλείφθηκαν. Η καταγραφή στο main και οι ενημερώσεις από τις υπόλοιπες σελίδες παραμένουν προς επιβεβαίωση.

### Οριστικοποίηση τιμολογίου και διάγνωση CI — 13/11/2026

- Τιμολόγια · Ο ιδιοκτήτης επιβεβαίωσε από τη σελίδα «διορθώσεις τιμολογίων κτλπ» ότι οριστικοποίησε το τιμολόγιο και είναι ΟΚ. Η οριστικοποίηση κλείνει ως επιβεβαίωση χειριστή. Δεν υπάρχει ανεξάρτητο τεκμήριο για τις τρεις τιμές barcode ανά γραμμή.
- Απογραφή · Η διασταύρωση των workflow στο `3acf060c` (#3841) και στο `main` έδειξε διαφορά στο βήμα recovery: το branch χτίζει το image από το προεπιλεγμένο Dockerfile, ενώ το main περνά σταθερό digest PostgreSQL 18 και σταθερό digest για την υπηρεσία PostgreSQL 16. Ο επόμενος έλεγχος είναι CI με το workflow του main ώστε να διαπιστωθεί αν υποχωρούν οι αποτυχίες restore του #9770, πριν από την αποδοχή στο LAB. Η αιτία δεν έχει επιβεβαιωθεί με εκτέλεση.
- Συντονισμός · [CI #9825 PASS](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43500654258) στο `34896706` του #3860. Το PR έχει mergeable status και παραμένει draft.

## Κανόνας ενημέρωσης

10/11/2026 — #3786 store-only editor and two-store POS catalog CI pass carried onto current main. New exact-head CI and complete LAB pending.

1. Κάθε βοηθός αλλάζει μόνο τη δική του γραμμή και προσθέτει μικρό checkpoint στο `CHECKPOINTS/CHANGES/`.
2. Διατηρείται το `docs/roadmap/OPEN_WORK_TRACKER.md` ως authoritative πηγή για ownership, acceptance και τελικό PASS, μέχρι ρητή και ελεγμένη αλλαγή των οδηγιών.
3. Το μεγάλο `KAT_ACTIVE_LIST_2026-09-05.md` **δεν διαγράφεται, δεν συμπτύσσεται και δεν αντικαθίσταται**.
4. Με το merge #3719 ενημερώθηκαν validator, tests και AGENTS.md: το CI απαιτεί πλέον το μικρό μητρώο και νέο checkpoint για αλλαγές κώδικα/ρυθμίσεων.
5. Όλοι οι έλεγχοι και τα τεκμήρια παραμένουν υποχρεωτικά· το μικρό μητρώο δεν αποτελεί παράκαμψη checkpoint gate.

Ενημέρωση: 2026-11-08 — αρχικό μικρό μητρώο / migration draft.

Τεκμήριο #28 / test-only PR #3749 (2026-11-08): απομονωμένη HTTP + PostgreSQL ακύρωση BackOffice εκτελέστηκε PASS στο CI #9526 (old SHA `2421d979`, 5/5 jobs, 5.978 server tests, 0 skipped). Απαιτείται νέο exact-head CI μετά τη συμφιλίωση. Hosted LAB: NOT TESTED· #28: OPEN.

09/11/2026 — INVENTORY-SCAN-WORKFLOW-01 / QR/PIN Enter and +1 per scan. Retained owner /root. [Scope and next steps](CHANGES/2026-11-09-inventory-link-scan.md). Separate LAB acceptance pending.
09/11/2026 — INVENTORY-SCAN-WORKFLOW-01 / #3702 same-draft product attachment: main CI and scoped staff LAB PASS. Owner confirmed temporary create-grant removal.

Source `5cfa4d9d` published on the scoped branch. Synthetic handler check verified repeated and alternate barcode, different-item protection, one save on repeated Enter, additive total and reset. Exact PR CI and physical scanner LAB remain pending.

QR/PIN count correction implemented in `5099e0dc`. Focused arithmetic check passed for 7 → 5, 7 → 9, 7 → 0 and additive 7 + 5 → 12. Full CI and live acceptance pending.

09/11/2026 — INVENTORY-SCAN-WORKFLOW-01 / exact existing barcode store assignment implemented through `eff05d16`. Explicit assignment, scoped active grant and draft lock, existing records preserved. CI and live Rizareio verification pending.

09/11/2026 — QR/PIN product creation checks exact barcode duplicates within the stocktake company. Production read-only diagnosis confirmed two outside-company matches and no same-company match for 52016165. CI and live acceptance pending.

## 09/11/2026 — CENTRAL-BACKOFFICE-ACCESS-01

Personal inventory detail pages and stocktake-wide exact barcode/SKU lookup. Frontend build, 28 mounted UI tests and local HTTP/Express + PGlite integration passed. Exact CI and authenticated LAB acceptance pending. Retained ownership and all-functions scope stay open.

09/11/2026 — INVENTORY-SCAN-WORKFLOW-01 / QR/PIN finalization opt-in. Prior #3771 CI and seven mocked authorization scenarios passed. Current-main CI and LAB pending.

10/11/2026 — QR/PIN selection displays current store stock from a read-only, scoped line endpoint. CI and LAB pending.

10/11/2026 — Store warehouse browsing implemented with explicit owner opt-in, scoped read-only search and paging. Price/taxonomy editing remains pending. CI and LAB pending.

## INVENTORY-PRODUCT-CREATE-EVENTS

Assigned to `fix/inventory-product-create-events`. Central Events shows historical inventory PRODUCT_CREATE records with store, date and operator filters. Local syntax and mocked query/mapping checks passed. LAB and production lookup pending. See [change checkpoint](CHANGES/inventory-product-create-events.md).


## MYDATA-DRAFT-PREFILL

Create missing supplier from verified myDATA invoice fields. [Checkpoint](CHANGES/mydata-draft-create-supplier.md).

Show the XML issuer name on unlinked myDATA drafts. [Checkpoint](CHANGES/mydata-draft-issuer-name.md).

Unconfirmed packaging remains in the draft for correction. [Checkpoint](CHANGES/mydata-unconfirmed-packaging.md). CI and production validation pending.

Automatic recovery of attached empty drafts: [checkpoint](CHANGES/mydata-automatic-empty-draft.md). Syntax checks passed; CI and live verification pending.

Follow-up `fix/mydata-draft-vat-zero-retry`. Local replay passed for an empty myDATA draft with VAT category 7. CI and deployed retry pending. See [checkpoint](CHANGES/mydata-draft-vat-zero-retry.md).

Assigned to `fix/mydata-draft-prefill`. Source prepared. Existing LAB and CI pending. See [checkpoint](CHANGES/mydata-draft-prefill.md).

11/11/2026 — Central Offers & Gifts: allow a fixed price for multiple selected products in one submission. See CHECKPOINTS/CHANGES/2026-11-11-platform-bulk-fixed-offer.md.

11/11/2026 — Central Offers & Gifts: reuse an existing company item when SKU and master barcode match. See CHECKPOINTS/CHANGES/2026-11-11-platform-promotion-existing-sku.md.

11/11/2026 — Inventory Archive duplicate scan by selected store. See CHECKPOINTS/CHANGES/2026-11-11-inventory-duplicate-check.md.

12/11/2026 — Inventory Archive: start product merge directly from duplicate results. See CHECKPOINTS/CHANGES/2026-11-12-inventory-merge-duplicates.md.

12/11/2026 — Πληρωμή POS με υπάρχον παραστατικό myDATA. CI και LAB εκκρεμούν. [Checkpoint](CHANGES/2026-11-12-pos-pay-existing-mydata.md).

12/11/2026 — Export active efood offers per store using the in-store euro discount. See CHECKPOINTS/CHANGES/2026-11-12-efood-offer-export.md.

13/11/2026 — Consolidated inventory valuation: report across selected stocktakes with 24-hour Greek timestamps. See CHECKPOINTS/CHANGES/2026-11-12-inventory-valuation.md.

13/11/2026 — POS: επιβεβαίωση πληρωμής με υπάρχον τιμολόγιο myDATA και επαληθευμένο προμηθευτή. [Checkpoint](CHANGES/2026-11-13-pos-mydata-existing-document-supplier.md).

13/11/2026 — Φωτογραφίες και βοηθός στο χειροκίνητο πρόχειρο παραγγελίας. [Checkpoint](CHANGES/2026-11-13-manual-purchase-invoice-photos.md).

13/11/2026 — Ρητή έναρξη ανάγνωσης φωτογραφιών στο χειροκίνητο πρόχειρο. [Checkpoint](CHANGES/2026-11-13-manual-order-photo-explicit-read.md).

13/11/2026 — Τυπωμένη καθαρή αξία στο χειροκίνητο πρόχειρο. [Checkpoint](CHANGES/2026-11-13-manual-invoice-printed-rounding.md).

13/11/2026 — CENTRAL-BACKOFFICE-ACCESS-01 / delegated bank transfer history. [Checkpoint](CHANGES/2026-11-13-manager-payment-history-implementation.md), PR #3851. CI passed before synchronization; hosted LAB pending.


## 2026-11-13 — Inventory audit purchase document links

Continues #3645 in draft #3852. The audit resolves direct approval, local OCR confirmation and credit postings to the purchase document in the selected company and store. Purchase orders resolve through their own source document. Local reconciliation tests passed 18/18 and isolated SQL join checks passed 9/9. Native CI and hosted LAB acceptance are pending. Physical receipt timestamps and verified originals remain open.

13/11/2026 — Διόρθωση εκκαθάρισης κωδικού γραμμής τιμολογίου κατά την αποθήκευση barcode. [Checkpoint](CHANGES/2026-11-13-invoice-clear-supplier-code.md).


## 2026-11-13 — Standalone local OCR draft approval
Continues #3852 LAB acceptance. Expose the existing stock approval action for a standalone OCR draft in the selected store. See [checkpoint](CHANGES/2026-11-13-standalone-ocr-draft-approval.md).

13/11/2026 — CENTRAL-BACKOFFICE-ACCESS-01 / independent payment history right. [Checkpoint](CHANGES/2026-11-13-manager-payment-read-independent.md). CI and LAB pending.

13/11/2026 — CENTRAL-BACKOFFICE-ACCESS-01 / independent shift close. [Checkpoint](CHANGES/2026-11-13-manager-shift-close-context.md), PR #3855. LAB pending.

### Διασταύρωση CI και αλλαγών του main — 13/11/2026

- #3841 · Το workflow του main με σταθερές εκδόσεις PostgreSQL 16/18 πέρασε 5/5 στο [CI #9775 του #3838](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43374661572). Το #3841 είναι 23 commits πίσω και έχει κοινή αλλαγή με το main στο `inventory-reconciliation-source.js`. Εκκρεμούν έλεγχος συμβατότητας σε branch από main και CI με τις σταθερές εκδόσεις.
- #3858 και #3827 · Η κοινή αλλαγή με το main περιορίζεται σε αυτό το μητρώο. Στο #3771 έχουν αλλάξει και τα τέσσερα αρχεία υλοποίησης QR/PIN.
- #3860 · [CI #9826 PASS](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43500865390) στο `060e096a`. Ο κοινός κανόνας παραμένει στο draft.

### Δοκιμαστική εφαρμογή του #3841 στο main — 13/11/2026

Τα επτά αρχεία κώδικα και δοκιμών του #3841 εφαρμόστηκαν προσωρινά στο περιεχόμενο του main με μοναδική αντιστοίχιση ανά τμήμα diff. Διατηρήθηκαν οι νεότερες αλλαγές στο `inventory-reconciliation-source.js`. Πέρασαν 6/6 έλεγχοι σύνταξης JavaScript. Εκκρεμούν μεταγλώττιση JSX, συνδυασμένο CI και hosted LAB. Ο κλάδος του #3841 διατηρήθηκε στην τρέχουσα έκδοση.

### Δοκιμαστικός κλάδος CI για #3841 — 13/11/2026

Άνοιξε το [draft #3861](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3861) με commit `b4f57a3b` από το main `d8b278b2`. Επιβεβαιώθηκαν τα επτά αρχεία της αλλαγής και τα δύο checkpoints. Χρησιμοποιήθηκε το workflow του main με τις σταθερές εκδόσεις PostgreSQL. [CI #9828 PASS (5/5)](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43501988091), μαζί με το build-and-test. Εκκρεμεί δοκιμή του ίδιου commit στο υπάρχον LAB.

- Έλεγχος Render για #3861 · NOT TESTED στο LAB. Το `myworkstation-app` είναι live στο `d8b278b2`. Το `b4f57a3b` δεν βρέθηκε στους πρόσφατους ελέγχους deploy των διαθέσιμων υπηρεσιών. Τα ενεργά απομονωμένα LAB εξυπηρετούν POS UI και χονδρική. Για hosted αποδοχή χρειάζεται διαθέσιμη έκδοση `b4f57a3b` σε εγκεκριμένο μη παραγωγικό στόχο με δοκιμαστικά δεδομένα απογραφής.

- #3861 · Επανέλεγχος στο ακριβές `b4f57a3b`: `node --test server/test/inventory-reconciliation-reviews.test.js` με Zod 3.24.2, **11/11 PASS**. Επιβεβαιώθηκαν επαναχρησιμοποίηση σε επόμενη σύγκριση, ανάκληση και όρια καταστήματος/γενιάς. Το `render.yaml` του commit δηλώνει την παραγωγική εφαρμογή, όχι ξεχωριστό inventory LAB. Η λειτουργική δοκιμή στο φιλοξενούμενο LAB παραμένει NOT TESTED.

- 14/11/2026 · #3858 συγχρονίστηκε με main `d8b278b2`, με διατήρηση των έξι αρχείων τεκμηρίωσης και των νεότερων εγγραφών του μητρώου. [CI #9830 PASS](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43561772567) στο `32e69a07`. Hosted LAB PASS για standalone OCR και κίνηση αγοράς +2. Η πραγματική ώρα παραλαβής και το αποθηκευμένο πρωτότυπο myDATA παραμένουν ανοικτά.

- 14/11/2026 · #3827 συγχρονίστηκε με main `d8b278b2`. Διατηρήθηκαν τα οκτώ αρχεία του PR και οι εγγραφές του main. [CI #9832 PASS (5/5)](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43562848857) στο `afaa555b`. Εκκρεμούν μετρήσεις polling και καθυστέρησης HTTP στο υπάρχον LAB και έλεγχος SQL indexes. Τα indexes δεν εφαρμόστηκαν από αυτή την εργασία.

- 14/11/2026 · Οριστικοποίηση QR/PIN: το [#3774](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3774) αντικατέστησε το #3771 και συγχωνεύτηκε με `40aaf29f`. Επιβεβαιώθηκε ότι το commit περιλαμβάνεται στο τρέχον main και ότι το [CI #9579 πέρασε](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/42634405981) στο `fdb2cbec`. Οι σχετικές αλλαγές υπάρχουν στα τέσσερα αρχεία υλοποίησης του main. Η παλαιότερη εκκρεμότητα συγχρονισμού #3771 κλείνει ως αντικατασταθείσα. Παραμένει ανοικτή η τεκμηριωμένη δοκιμή στο υπάρχον LAB για ρητή εξουσιοδότηση όλων των ζωνών και συνδέσμους μόνο για καταμέτρηση.

- 14/11/2026 · #3774 hosted LAB: το Render είναι live στο `d8b278b2`, το οποίο περιλαμβάνει την οριστικοποίηση QR/PIN. Το MyWorkStation επέστρεψε «Η προβολή Backoffice διακόπηκε» λόγω ανενεργής συνεδρίας και το Άνοιγμα Backoffice επέστρεψε στην ίδια οθόνη. NOT TESTED για σύνδεσμο μόνο καταμέτρησης και σύνδεσμο με ρητή οριστικοποίηση. Επόμενο βήμα: επανασύνδεση στο δοκιμαστικό Backoffice και επιβεβαίωση των δύο περιπτώσεων αποκλειστικά στο ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ.

- 14/11/2026 · #3827: στοχευμένος επανέλεγχος στο `afaa555b`, **4/4 PASS**. Επιβεβαιώθηκαν η επιβράδυνση polling μόνο για το αναμενόμενο 503 κλειστού καταστήματος, οι συγκεντρωτικές μετρήσεις καθυστέρησης χωρίς IDs καταστημάτων και η συνέχιση του API σε αστοχία καταγραφής. Hosted LAB και μετρήσεις με SQL indexes παραμένουν ανοικτά.

- 14/11/2026 · Τιμολόγια POS #3844: επιβεβαιώθηκε [CI #9780 PASS 5/5](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43418378210) στο `ca93cab0` και συγχώνευση. Εκκρεμεί δοκιμή στο υπάρχον LAB για επιβεβαιωμένο myDATA, ελλιπή στοιχεία και αίτημα φωτογραφίας/PDF. Χρησιμοποιείται δοκιμαστικό παραστατικό.
- 14/11/2026 · Email #3834: επιβεβαιώθηκε [CI #9758 PASS 5/5](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43292527704) στο `14dabfa9` και συγχώνευση. Οι δοκιμές με συνθετικές εγγραφές καλύπτουν ιστορικό ανά κατάστημα και έλεγχο ρόλων. Εκκρεμεί λειτουργική δοκιμή στο LAB και τεκμήριο παραλαβής στο γραμματοκιβώτιο.

### Εκκρεμότητες για κλείσιμο συντονισμού — 14/11/2026

| Εργασία | Κριτήριο κλεισίματος | Κατάσταση |
| --- | --- | --- |
| Κοινός κανόνας #3860 | Ενσωμάτωση στο main και μία καταγραφή από κάθε ομάδα στο ενεργό μητρώο | Η αλλαγή αφορά μόνο το ενεργό μητρώο. CI PASS στο προηγούμενο commit. Εκκρεμεί έγκριση συγχώνευσης. |
| Παραλαβή OCR #3858 | Ενσωμάτωση τεκμηρίωσης για το συγκεκριμένο σενάριο | Hosted LAB PASS για 8 → 10, PURCHASE +2 και διαφορά 0. Χωριστές εκκρεμότητες Full Audit: πραγματική ώρα παραλαβής και επαλήθευση πρωτοτύπου myDATA. |
| Απογραφή #3861 / #3774 | Έλεγχος ομαδοποίησης και ανάκλησης στο LAB για #3861, καθώς και των δύο δικαιωμάτων συνδέσμου QR/PIN για #3774 | #3861 CI 5/5 και 11/11 στοχευμένες δοκιμές. Εκκρεμούν διαθέσιμο build #3861 στο υπάρχον LAB και ενεργή συνεδρία Backoffice για #3774. |
| POS #3844 / Email #3834 / Απόδοση #3827 | Δοκιμή POS myDATA, συσχέτιση δοκιμαστικού email με παραλαβή και μετρήσεις στο LAB | Τα CI πέρασαν. Στη στοχευμένη αναζήτηση του συνδεδεμένου Gmail δεν βρέθηκε σχετικό τεκμήριο παραλαβής. |

## 2026-11-14 — Markup σε πρόχειρα myDATA

Υπολογισμός markup κατά την προβολή αντιστοιχισμένων γραμμών. [Checkpoint](CHANGES/2026-11-14-mydata-draft-markup.md).

## 2026-11-14 — Φίλτρα και διπλοεγγραφές στην Αποθήκη POS

[Checkpoint](CHANGES/2026-11-14-pos-warehouse-duplicate-filters.md).

## 2026-11-14 — Συγχώνευση ειδών και φίλτρα στην Αποθήκη POS

[Checkpoint](CHANGES/2026-11-14-front-pos-warehouse-merge.md).

## 2026-11-14 — Κουμπί φίλτρων στην Αποθήκη POS

[Checkpoint](CHANGES/2026-11-14-front-pos-filter-button.md).

## 2026-11-14 — Τμήμα ΦΠΑ και Margin στην Αποθήκη POS

[Checkpoint](CHANGES/2026-11-14-pos-warehouse-vat-margin.md).

13/11/2026 — #3841: δοκιμαστική εφαρμογή των αλλαγών απογραφής στο main `d8b278b2`, με τις σταθερές εκδόσεις PostgreSQL του main. CI και LAB εκκρεμούν. [Checkpoint](CHANGES/2026-11-12-inventory-reusable-identity-projection.md).

- #3861 · Στοχευμένος επανέλεγχος πηγής του `28a212b9`: 12/12 PASS. Περιλαμβάνει εκτέλεση του πραγματικού SQL επιλογής ιστορικού πάνω σε απομονωμένο PGlite με συνθετικό `WorkforceAuditLog`. Επιβεβαιώθηκαν η επαναχρησιμοποίηση, η ανάκληση, η εξαίρεση του αρχικού ζεύγους και η απομόνωση ανά κατάστημα και γενιά. Hosted LAB παραμένει ανοικτό μέχρι να είναι διαθέσιμη εκεί η δοκιμαστική έκδοση.
