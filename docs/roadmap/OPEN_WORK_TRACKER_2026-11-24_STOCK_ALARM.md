- 24/11/2026 · ASSIGNED /root · POS4197 deployment dependency: null-category VAT0 startup no-op recognition; prior owner retained. SOURCE LIVE 678e4645 / full CI PASS / native PostgreSQL + adapter 7PASS / LAB acceptance pending. Checkpoint: CHECKPOINTS/CHANGES/2026-11-24-pos-proposal-startup-null-category.md.

## 24/11/2026 — Ξεχωριστό POS υποσύνολο

Ίδιος owner /root και claim4193. Branchfeat/pos-order-proposals-20261124 στη βάση61c2a64. Πρόταση POS read-only με υπάρχοντα δεδομένα και ανεξάρτητο ανακλητό δικαίωμα· κανένας νέος πίνακας/weekly worker. Το αυτόματο alarm παραμένει στο4194, BLOCKED ON SCHEMA ADMISSION με No7/No14 owners διατηρημένους. [Release checkpoint](../../CHECKPOINTS/CHANGES/2026-11-24-pos-order-proposals-release.md). Δεν υπάρχει εγκατάσταση ή νέο LAB PASS.

# 24/11/2026 — Εβδομαδιαίο alarm stock και πρόταση POS

ASSIGNED /root · docs/central-weekly-stock-alarm-claim-20261124 · PR #4193.

Νέο ανεξάρτητο scope: εβδομαδιαίο αυτόματο όριο αποθέματος ανά προϊόν/κατάστημα, κεντρικές ρυθμίσεις και εξαιρέσεις, ιστορικό, και πρόσβαση σε πρόταση από μπροστινό POS με ανακλητό δικαίωμα χειριστή. Δεν αλλάζει απόθεμα ή αποστέλλει αγορά. SOURCE NOT STARTED / LAB NOT TESTED.

Ακολουθεί τον κανόνα συνέχειας του COMMON_WORK_RULE.md αντί επανεγγραφής των μεγάλων μητρώων. Προηγούμενες αναθέσεις και PASS παραμένουν. Πριν αλλαγή ανατεθειμένου αρχείου απαιτείται ακριβής συντονισμός.

Προδιαγραφή, όρια και έλεγχοι: [checkpoint](../../CHECKPOINTS/CHANGES/2026-11-24-central-weekly-stock-alarm-claim.md).

[Προηγούμενο μητρώο](OPEN_WORK_TRACKER.md) · [Κοινός κανόνας](COMMON_WORK_RULE.md)

Επόμενο βήμα: πράσινο CI και merge ανάληψης πριν από πηγαίο κώδικα. Μετά αποτύπωση κεντρικών ρυθμίσεων/χρονοπρογραμματισμού και ακριβές POS entry· τελική κοινή δοκιμή στο υπάρχον LAB.


25/11/2026 · ASSIGNED /root · POS proposal module admission, SOURCE LIVE7adad64f / FULL CI PASS / LABmodule explicitlyON, existingLAB POS2grantON / physical acceptance pending. CHECKPOINTS/CHANGES/2026-11-25-pos-order-proposal-module-admission.md. Existing owners retained; weekly alarm unaffected.


25/11/2026 · ASSIGNED /root · POS proposal supplier/coverage/sales dates/email/print combined package, LIVE669763de / FULL CI45598388164 all5PASS / LAB business hashes unchanged / common POS-print-inbox acceptance pending / existing4193owner retained. CHECKPOINTS/CHANGES/2026-11-25-pos-order-proposal-controls-output.md. Weeklyalarm separateblocked.

25/11/2026 · Retained4194owner /root · weekly alarm continuation; bounded versioned admission extension, old profiles/defaults/No7-No14 owners retained. SOURCE NOT STARTED / PRODUCTION OFF. CHECKPOINTS/CHANGES/2026-11-25-weekly-stock-alarm-continuation.md.
