# POS optional audience groups and credit customer dropdown

## POS-AUDIENCE-CREDIT-01 — ASSIGNED / νέα κεντρική απαίτηση 08/10/2026

Owner `codex/pos-audience-credit-settings-20261008` · claim 2026-10-08T17:08:20+03:00. Independent new owner-requested scope: optional hospital audience/card rows, explicit Super Admin enablement per selected store and editable audience labels; a customer dropdown listing active credit customers through the existing authorized POS customer flow. Screenshot `image(20261008-134545).png` shows mandatory hospital options at Διαδόχου: USER FAIL for visibility requirement, physical revision unknown. Current main/live health548ef32cfdab04dbb721c3163df8284ce9cf9f01 independently read. New behavior NOT TESTED. Preserve Gate3/4/6/8 PASS, existing discount IDs/rounding/card hashes/customer-card-only access, fiscal/idempotency/stock/shift guards and all existing owners (including TODAY-04 clipping scope). No sale, payment, invoice or real-store configuration write for diagnostics. Checkpoint `CHECKPOINTS/CHANGES/2026-10-08-pos-audience-credit-settings.md`. Claim publication required before implementation. Acceptance: off hides hospital rows; explicit enabled store uses renamed groups and unchanged pricing; customer click opens scoped credit list, restricted operator requires card; cancel/retail/reset/store switch cannot carry old identity. CI/local are not LAB PASS.

## Implementation — AWAITING LAB

Implementation 2026-10-08T17:50:30+03:00: source branch `codex/pos-audience-credit-implementation-20261008`, same owner/page retained; claim PR #1889 / CI 37793179490 SUCCESS / merge c396387cd9e9a9608f8e9f575093dd7231cf6140 was published before source edits. Rebased onto current main5814573, preserving later Diadoxou card USER acceptance. Central Super Admin settings are stored independently in each published store layout, default OFF, with explicit boolean enable and five editable labels (1–60 characters). POS hides hospital rows when OFF; customer dropdown remains available, lists company-scoped active accounts with creditLimit>0 OR balance>0, caps30 and searches within authorized selected-store access. Customer records remain company-wide: no new store ownership/balance inference. Card-only and live customer permission restrictions preserved. Product layout publish/clone/edit/removal preserves each target store's audience settings; incoming operator settings cannot enable or rename. Server blocks non-NORMAL selections/card scans/quotes when OFF; new checkout reads NORMAL when OFF. Reserved fiscal requests retain their saved audience, resolved items, total and label; no fiscal repricing/idempotency changes. Pricing IDs and0.10 line rounding unchanged. Delayed store/catalog/customer/settings responses are discarded; customer selection resets points and retail choice clears identity. Initial POS load resets stale audience selection; existing fiscal continuations use their snapshot.

Local Node20 build:production and client build PASS; server suite1906 PASS /0 FAIL /4 SKIP; preparation/Windows-observer/backup invariants PASS. Local Playwright on actual React components with simulated API PASS: default OFF, renamed enabled groups, credit dropdown/select/retail/error/Escape,1024×600 bounds, card-only gating, delayed-store discard and central selected-store save. Screenshots visually inspected; local/simulated results are not LAB PASS. New isolated PostgreSQL/HTTP E2E added to full CI for central-only writes, default OFF, labels, target settings preservation, rounding, tenant/card-only/live-permission safeguards; no sales/payments created by this new fixture. Full CI/merge/live revision verification pending at PR preparation. New live/LAB behavior NOT TESTED / AWAITING LAB. No live configuration, sale, payment, invoice, stock or device write performed. Protected Gate3/4/6/8/manual PASS and all other assignments retained.

Next action: exact-head full CI → merge → verify exact healthy deployed revision; only then request bounded LAB acceptance of OFF/ON/rename/dropdown/reset/store-switch using the required before/after record for any state-changing LAB action. No financial test is needed merely to inspect the list. Owner remains assigned until a named handoff.

## Protected evidence

25Sep doctor/nurse product-rule and cart/sale scoped PASS retained, including per-line rounding toward0.10 and per-store rules; full Gate4 completed25Sep offline queue checkpoint supersedes older historical OPEN. 08Oct category response USER PASS and opening form visual PASS protected. No repeat old transactions. New requested opt-in requirement supersedes unconditional hospital UI only. Customer records are currently company-wide; do not invent store associations or infer store-specific customer balances. Inspect existing customer access before implementation.

## Current evidence

USER FAIL: screenshot hospital controls permanently visible in nonhospital store. New enable/rename/dropdown behavior NOT TESTED. Source main/history inspected since25Sep audience evidence. No source edits or LAB actions.

## Next action

Publish this independent assignment, then implement and run build/server tests and exact-head full CI. Merge and exact-live verification precede a new acceptance test.


## Explicit public publication approval

2026-10-08T17:27:50+03:00 owner explicitly approved public publication of this checkpoint, active list, work registries, generated PDF and related code to xrhstosmanis-design/myworkstation-app using push and merge. No source edits or LAB actions. Claim publication first.
