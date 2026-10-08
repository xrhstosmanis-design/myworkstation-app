# POS optional audience groups and credit customer dropdown

## POS-AUDIENCE-CREDIT-01 — ASSIGNED / νέα κεντρική απαίτηση 08/10/2026

Owner `codex/pos-audience-credit-settings-20261008` · claim 2026-10-08T17:08:20+03:00. Independent new owner-requested scope: optional hospital audience/card rows, explicit Super Admin enablement per selected store and editable audience labels; a customer dropdown listing active credit customers through the existing authorized POS customer flow. Screenshot `image(20261008-134545).png` shows mandatory hospital options at Διαδόχου: USER FAIL for visibility requirement, physical revision unknown. Current main/live health548ef32cfdab04dbb721c3163df8284ce9cf9f01 independently read. New behavior NOT TESTED. Preserve Gate3/4/6/8 PASS, existing discount IDs/rounding/card hashes/customer-card-only access, fiscal/idempotency/stock/shift guards and all existing owners (including TODAY-04 clipping scope). No sale, payment, invoice or real-store configuration write for diagnostics. Checkpoint `CHECKPOINTS/CHANGES/2026-10-08-pos-audience-credit-settings.md`. Claim publication required before implementation. Acceptance: off hides hospital rows; explicit enabled store uses renamed groups and unchanged pricing; customer click opens scoped credit list, restricted operator requires card; cancel/retail/reset/store switch cannot carry old identity. CI/local are not LAB PASS.

## Protected evidence

25Sep doctor/nurse product-rule and cart/sale scoped PASS retained, including per-line rounding toward0.10 and per-store rules; full Gate4 completed25Sep offline queue checkpoint supersedes older historical OPEN. 08Oct category response USER PASS and opening form visual PASS protected. No repeat old transactions. New requested opt-in requirement supersedes unconditional hospital UI only. Customer records are currently company-wide; do not invent store associations or infer store-specific customer balances. Inspect existing customer access before implementation.

## Current evidence

USER FAIL: screenshot hospital controls permanently visible in nonhospital store. New enable/rename/dropdown behavior NOT TESTED. Source main/history inspected since25Sep audience evidence. No source edits or LAB actions.

## Next action

Publish this independent assignment, then implement and run build/server tests and exact-head full CI. Merge and exact-live verification precede a new acceptance test.


## Explicit public publication approval

2026-10-08T17:27:50+03:00 owner explicitly approved public publication of this checkpoint, active list, work registries, generated PDF and related code to xrhstosmanis-design/myworkstation-app using push and merge. No source edits or LAB actions. Claim publication first.
