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

25/11/2026 · Weekly4194 retained /root: Διαδόχου module enabled0cost, actualsales calculation preview only; no minimum/runtime activation. Newhead4dbd6b16 fullCI45643643734/AIwallet45643643611 pending after exact Netlink catalogue preservation. Next: green CI→explicit installation→measured Διαδόχου STORE-only test. CHECKPOINTS/CHANGES/2026-11-25-weekly-stock-alarm-diadochou-handoff.md.

25/11/2026 · Weekly4194 retained /root BLOCKED by GitHub Actions rerun500: exactsource65d0239c,7422serverPASS/0FAIL/4existingSKIP +8invariantPASS +isolatedHTTP/recoveryPASS. Only browserstartup Target.createTarget timeout failed twice; thirdrerun APIInternalError/UIHTTP500, no attempt3 created. OfficialGithubstatus PartialSystemOutage. Weeklycode/schema/runtime/policy not deployed or enabled, Diadochou proposalmoduleactive0cost/previewonly. CHECKPOINTS/CHANGES/2026-11-25-weekly-stock-alarm-github-actions-block.md.

25/11/2026 · ASSIGNED retained4194 /root, before-source extension of4236: exact existing StoreChatMessage.cashDay DATE NULL from unchanged No7 store-chat.js is the only further mismatch in all299physical table shapes. Preserve via bounded metadata-only runtime descriptor and exact nullable/default-free column catalogue, native replay/tamper checks; no Chat writer/row/access/session changes, No7 owner retained. No generic unknown-column allowance. Operational test remains Διαδόχου, weekly OFF.

25/11/2026 · ASSIGNED retained4194 /root: bounded weekly-alarm preservation of newly deployed Netlink paid-issuance catalogue from7623888/4229. Before-source claim: verify the exact8nullable NetlinkTransaction columns and paid_checkout partial index against unchanged dedicated-owner DDL, version metadata-only source projection/target declaration, refresh source bindings and native both-order/tamper controls. No Netlink writer/row/fiscal/provider behavior ownership or changes, no generic unknown-column admission. Existing No7/No14/efood/Netlink owners retained. Operational test requested by user at Διαδόχου, preflight/module activation only so far; weekly runtime OFF. Source4194 still pending finalCI/release and new exact-catalogue integration.
