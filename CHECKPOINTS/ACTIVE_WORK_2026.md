# MyWorkStation — Μικρό ενεργό μητρώο βοηθών

**Κατάσταση:** ΕΝΕΡΓΟ ΜΙΚΡΟ ΜΗΤΡΩΟ CI από το merge #3719 — το OPEN_WORK_TRACKER.md παραμένει authoritative για ownership/PASS.

Σκοπός: σύντομες, συχνές ενημερώσεις ανά εργασία χωρίς συνεχή επεξεργασία του μεγάλου `CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md`.

| Προτεραιότητα | Εργασία | Υπεύθυνος | PR / issue | Τρέχουσα κατάσταση | Επόμενο βήμα |
| --- | --- | --- | --- | --- | --- |
| 0 | INVOICE-OWNER-FINALIZATION-01 (#28) | Εγκεκριμένη υλοποίηση / παράλληλος πιλότος Claude | #2705, #3715, #3725, #3726, #3727, #3728, #3729 | [Υλοποίηση #3727](CHANGES/2026-11-08-invoice-owner-posting.md), 81 τοπικοί έλεγχοι. Χωριστός πιλότος Claude | 5.959 δοκιμές server πέρασαν. Διορθώθηκε το fixture του καταλόγου. Νέο CI και LAB πριν από πραγματικό παραστατικό; Claude preview lineAudit #3731 merged (CI PASS); BackOffice lineAudit UI #3737 merged (CI PASS, LAB NOT TESTED); Claude workflow scope fix #3741 MERGED (CI PASS); [server cancel step](CHANGES/2026-11-08-invoice-owner-finalization-cancel.md) Claude native-DB 11/11 on initial commit; coordinator added terminal CANCELLED guards and tests; #3743 exact-head CI #9501 PASS; LAB NOT TESTED; BackOffice owner cancel dialog UI #3746 Draft, exact-head CI/LAB pending |
| 0 | INVOICE-OWNER-FINALIZATION-01 / Two-page assistant reopen | Retained #28 owner | #3727 | [Isolated test 2/2 PASS](CHANGES/2026-11-08-invoice-assistant-reopen-two-page-isolated.md) | Hosted LAB pending |
| 0 | INVOICE-OWNER-FINALIZATION-01 / BackOffice multi-photo intake | Retained #28 owner | #3775 | [Dispatch correction](CHANGES/2026-11-09-backoffice-multi-photo-dispatch-fix.md) | Hosted batch queue observed; explicit same-invoice selector under test |
| 1 | AUTO-REPORT-OBSERVABILITY-01 | υπάρχουσα ανάθεση — επιβεβαίωση tracker | #2704 | Preview verified; email delivery NOT TESTED | Verify recipients and controlled send |
| 1 | OCR-CONFIDENCE-01 | υπάρχουσα ανάθεση — επιβεβαίωση tracker | #3706, #3709 | Code merged; hosted LAB NOT TESTED | LAB confidence and multipage checks |
| 2 | INVOICE-HEADER-LATENCY / σύγκρουση ποσών σε φωτογραφίες | /root | #3688, #3732, #3733 | Hosted LAB PASS for payable order and review prompt | Physical POS, real-photo repeatability, invoice number and issuer VAT remain open |
| 2 | INVOICE-HEADER-LATENCY / μοναδικό ανεπιβεβαίωτο πληρωτέο | /root | #3688, #3773, #3776 | Local safeguard; full CI pending | Fresh LAB and real-photo retest |
| 2 | INVOICE-HEADER-LATENCY / αριθμός από πολλαπλές φωτογραφίες | /root | #3688, #3739, #3740 | Hosted LAB PASS for number agreement and conflict review | Single candidate proof, real-photo accuracy, issuer VAT and physical POS remain open |
| 2 | INVOICE-HEADER-LATENCY / ΑΦΜ προμηθευτή από φωτογραφίες | /root | #3688, #3748, #3750 | Hosted LAB PASS for VAT agreement and conflict review | Lone candidate, real photos and physical POS remain open |
| 2 | INVOICE-HEADER-LATENCY / ΑΦΜ εκδότη και παραλήπτη | /root | #3688, #3755, #3756 | Hosted LAB PASS for same-VAT review and distinct-VAT control | Unknown or unrelated VAT misread, real photos and physical POS remain open |
| 2 | AI-WALLET-HISTORY-02 | υπάρχουσα ανάθεση — επιβεβαίωση tracker | #3713 | Draft; LAB NOT TESTED | Scoped LAB acceptance |
| 0 | FTEXT-STATUS-ORPHAN-01 / CMD option 9 | retained FTEXT recovery owner | #3695, #3721, #3724 | Source d6fc7958 CI 6/6 PASS; source branch rebased, exact-head CI pending; physical NOT TESTED | Verify native PS5.1 and full PR CI; merge approved by owner; separate approval required for PC install |
| — | Claude automation | Συντονιστής | #3714, #3716, #3717, #3718, #3719 | Compact registry merged in #3719; isolated policy tests PASS in #3718; old central CI #9416 FAIL | Read-only Claude pilot #2 PASS per owner screenshot; invoice write pilot #3725 merged; run #42504018843 Claude step succeeded, git push auth failed; auth fix #3726 merged; push trigger merged #3728 but run not observed; issue-comment trigger proposed; line-audit step on owner reopen added (CI/LAB NOT TESTED, see CHANGES/2026-11-08-invoice-owner-finalization-line-audit.md) |
| 1 | CASH-UNIFIED-AUDIT-15 | retained cash owner | #3708, #3711, #3712, #3736 | Personal preview, one native send and inbox delivery PASS; financial HOLD | [Delivery receipt](CHANGES/2026-11-08-cash-personal-test-delivery.md) · [Layout #3745: production preview PASS; new-layout delivery NOT TESTED](CHANGES/2026-11-09-cash-owner-email-layout-preview.md) · [Readable evidence candidate](CHANGES/2026-11-09-cash-owner-report-readable-evidence.md) |
| — | PLATFORM-COMPANY-LAYOUT-02 | Συντονιστής | #3734 | Chromium layout fixture PASS στα 1920, 1024 και 390 px. `wholesale-isolated-lab` PASS στο CI #9481 | Πλήρες CI στο νέο commit και έλεγχος με σύνδεση πριν από δημοσίευση. [Checkpoint](CHANGES/2026-11-08-platform-company-layout-compact.md) |

| 1 | INVENTORY-RECONCILIATION-01 | retained /root | #3693, #3696, #3645 | FREE comparison candidate reconciled; existing LAB pair insufficient for multi-code acceptance | Exact native CI, then validate bounded two-code LAB fixture |

## Κανόνας ενημέρωσης

1. Κάθε βοηθός αλλάζει μόνο τη δική του γραμμή και προσθέτει μικρό checkpoint στο `CHECKPOINTS/CHANGES/`.
2. Διατηρείται το `docs/roadmap/OPEN_WORK_TRACKER.md` ως authoritative πηγή για ownership, acceptance και τελικό PASS, μέχρι ρητή και ελεγμένη αλλαγή των οδηγιών.
3. Το μεγάλο `KAT_ACTIVE_LIST_2026-09-05.md` **δεν διαγράφεται, δεν συμπτύσσεται και δεν αντικαθίσταται**.
4. Με το merge #3719 ενημερώθηκαν validator, tests και AGENTS.md: το CI απαιτεί πλέον το μικρό μητρώο και νέο checkpoint για αλλαγές κώδικα/ρυθμίσεων.
5. Όλοι οι έλεγχοι και τα τεκμήρια παραμένουν υποχρεωτικά· το μικρό μητρώο δεν αποτελεί παράκαμψη checkpoint gate.

Ενημέρωση: 2026-11-08 — αρχικό μικρό μητρώο / migration draft.

Τεκμήριο #28 / test-only PR #3749 (2026-11-08): απομονωμένη HTTP + PostgreSQL ακύρωση BackOffice εκτελέστηκε PASS στο CI #9526 (old SHA `2421d979`, 5/5 jobs, 5.978 server tests, 0 skipped). Απαιτείται νέο exact-head CI μετά τη συμφιλίωση. Hosted LAB: NOT TESTED· #28: OPEN.

09/11/2026 — INVENTORY-SCAN-WORKFLOW-01 / QR/PIN Enter and +1 per scan. Retained owner /root. [Scope and next steps](CHANGES/2026-11-09-inventory-link-scan.md). Separate LAB acceptance pending.
09/11/2026 — INVENTORY-SCAN-WORKFLOW-01 / #3702 same-draft product attachment. Exact CI and LAB pending.

Source `5cfa4d9d` published on the scoped branch. Synthetic handler check verified repeated and alternate barcode, different-item protection, one save on repeated Enter, additive total and reset. Exact PR CI and physical scanner LAB remain pending.

QR/PIN count correction implemented in `5099e0dc`. Focused arithmetic check passed for 7 → 5, 7 → 9, 7 → 0 and additive 7 + 5 → 12. Full CI and live acceptance pending.

09/11/2026 — INVENTORY-SCAN-WORKFLOW-01 / exact existing barcode store assignment implemented through `eff05d16`. Explicit assignment, scoped active grant and draft lock, existing records preserved. CI and live Rizareio verification pending.

09/11/2026 — QR/PIN product creation checks exact barcode duplicates within the stocktake company. Production read-only diagnosis confirmed two outside-company matches and no same-company match for 52016165. CI and live acceptance pending.

## 09/11/2026 — CENTRAL-BACKOFFICE-ACCESS-01

Personal inventory detail pages and stocktake-wide exact barcode/SKU lookup. Frontend build, 28 mounted UI tests and local HTTP/Express + PGlite integration passed. Exact CI and authenticated LAB acceptance pending. Retained ownership and all-functions scope stay open.

09/11/2026 — INVENTORY-SCAN-WORKFLOW-01 / QR/PIN finalization opt-in. Prior #3771 CI and seven mocked authorization scenarios passed. Current-main CI and LAB pending.

10/11/2026 — QR/PIN selection displays current store stock from a read-only, scoped line endpoint. CI and LAB pending.

10/11/2026 — Store warehouse browsing implemented with explicit owner opt-in, scoped read-only search and paging. Price/taxonomy editing remains pending. CI and LAB pending.

10/11/2026 — Draft #3786 includes scoped grant, atomic five-field edit with before/after audit, editor, inventory cost/category and store POS checkout VAT/category integration. Remaining consumer review and exact two-store LAB pending. No release.
