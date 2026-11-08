# MyWorkStation — Μικρό ενεργό μητρώο βοηθών

**Κατάσταση:** ΕΝΕΡΓΟ ΜΙΚΡΟ ΜΗΤΡΩΟ CI από το merge #3719 — το OPEN_WORK_TRACKER.md παραμένει authoritative για ownership/PASS.

Σκοπός: σύντομες, συχνές ενημερώσεις ανά εργασία χωρίς συνεχή επεξεργασία του μεγάλου `CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md`.

| Προτεραιότητα | Εργασία | Υπεύθυνος | PR / issue | Τρέχουσα κατάσταση | Επόμενο βήμα |
| --- | --- | --- | --- | --- | --- |
| 0 | INVOICE-OWNER-FINALIZATION-01 (#28) | Εγκεκριμένη υλοποίηση / παράλληλος πιλότος Claude | #2705, #3715, #3725, #3726, #3727, #3728, #3729 | [Υλοποίηση #3727](CHANGES/2026-11-08-invoice-owner-posting.md), 81 τοπικοί έλεγχοι. Χωριστός πιλότος Claude | 5.959 δοκιμές server πέρασαν. Διορθώθηκε το fixture του καταλόγου. Νέο CI και LAB πριν από πραγματικό παραστατικό; Claude preview lineAudit #3731 merged (CI PASS); BackOffice list display pending new PR CI/LAB |
| 1 | AUTO-REPORT-OBSERVABILITY-01 | υπάρχουσα ανάθεση — επιβεβαίωση tracker | #2704 | Preview verified; email delivery NOT TESTED | Verify recipients and controlled send |
| 1 | OCR-CONFIDENCE-01 | υπάρχουσα ανάθεση — επιβεβαίωση tracker | #3706, #3709 | Code merged; hosted LAB NOT TESTED | LAB confidence and multipage checks |
| 2 | INVOICE-HEADER-LATENCY / σύγκρουση ποσών σε φωτογραφίες | /root | #3688, #3732, #3733 | Hosted LAB PASS for payable order and review prompt | Physical POS, real-photo repeatability, invoice number and issuer VAT remain open |
| 2 | AI-WALLET-HISTORY-02 | υπάρχουσα ανάθεση — επιβεβαίωση tracker | #3713 | Draft; LAB NOT TESTED | Scoped LAB acceptance |
| 0 | FTEXT-STATUS-ORPHAN-01 / CMD option 9 | retained FTEXT recovery owner | #3695, #3721, #3724 | Source d6fc7958 CI 6/6 PASS; source branch rebased, exact-head CI pending; physical NOT TESTED | Verify native PS5.1 and full PR CI; merge approved by owner; separate approval required for PC install |
| — | Claude automation | Συντονιστής | #3714, #3716, #3717, #3718, #3719 | Compact registry merged in #3719; isolated policy tests PASS in #3718; old central CI #9416 FAIL | Read-only Claude pilot #2 PASS per owner screenshot; invoice write pilot #3725 merged; run #42504018843 Claude step succeeded, git push auth failed; auth fix #3726 merged; push trigger merged #3728 but run not observed; issue-comment trigger proposed; line-audit step on owner reopen added (CI/LAB NOT TESTED, see CHANGES/2026-11-08-invoice-owner-finalization-line-audit.md) |
| 1 | CASH-UNIFIED-AUDIT-15 | retained cash owner | #3708, #3711, #3712, #3736 | Personal preview, one native send and inbox delivery PASS; financial HOLD | [Delivery receipt](CHANGES/2026-11-08-cash-personal-test-delivery.md) |

## Κανόνας ενημέρωσης

1. Κάθε βοηθός αλλάζει μόνο τη δική του γραμμή και προσθέτει μικρό checkpoint στο `CHECKPOINTS/CHANGES/`.
2. Διατηρείται το `docs/roadmap/OPEN_WORK_TRACKER.md` ως authoritative πηγή για ownership, acceptance και τελικό PASS, μέχρι ρητή και ελεγμένη αλλαγή των οδηγιών.
3. Το μεγάλο `KAT_ACTIVE_LIST_2026-09-05.md` **δεν διαγράφεται, δεν συμπτύσσεται και δεν αντικαθίσταται**.
4. Με το merge #3719 ενημερώθηκαν validator, tests και AGENTS.md: το CI απαιτεί πλέον το μικρό μητρώο και νέο checkpoint για αλλαγές κώδικα/ρυθμίσεων.
5. Όλοι οι έλεγχοι και τα τεκμήρια παραμένουν υποχρεωτικά· το μικρό μητρώο δεν αποτελεί παράκαμψη checkpoint gate.

Ενημέρωση: 2026-11-08 — αρχικό μικρό μητρώο / migration draft.
