
## 15/10/2026 — FIRST NATIVE CI FAILURE / CONCURRENT RETRY CORRECTED

PR2508 firstCI38779431067/job116575651006: one new native test failed because raw PostgreSQL serialization returns Prisma P2010/meta40001, while the assertion expected P2034. Source transaction rolled back, but concurrent retry would reach generic500. Corrected production merge helper to retry ONLY recognized serialization/deadlock codes in a fresh transaction (maximum3attempts), allowing the durable receipt to return once-only success. Strengthened test to require both concurrent calls succeed with exactlyone replay, plus injected final-audit failure proving complete stock/barcode/source-card rollback. No broad error swallowing or relaxed assertion. Other prior suite checks passed; no full CI/LAB PASS yet.


## 15/10/2026 — IMPLEMENTED / AWAITING FULL CI AND HOSTED ACCEPTANCE

Claims PR2506/db60bb4d/full docsCI38777632527 SUCCESS merged d1d79f86 before bulk source; PR2507/a310f059/full docsCI38777938857 SUCCESS merged3e3a7bd3 before merge source. Added always-visible horizontal range bound to actual table scroll, VAT department next to name, dependent taxonomy/real fiscal dropdowns and local SET/percent/EUR price modes. Store price and active updates no longer rewrite all stores/base price; category/subcategory/VAT remain explicitly disclosed company card metadata. Transactional audit, request replay and expected-price conflicts. Legacy text bulk contract now rejected rather than silently updating company-wide. Existing route role/module gates unchanged.

Explicit2–4 merger preview/survivor/confirmation/reason; net stock with paired movements, barcodes plus supplier links/learning move to survivor, sources inactive (not deleted), original sale/invoice identities retained. Existing target policies/price preserved, barcode-specific prices retained. Blocks other-store associations, open POS shifts/counts/orders, composition/delivery/baking, barcode packaging/conflicts and supplier collisions. Historical supplier-link startup backfill excludes audited merged sources so old links are not resurrected. This is a maintenance action; require synced/closed terminals. No production writes/merge/sale/payment/stock diagnostic actions.

Local Node20 mounted real panel and prior VAT/archive regressions23PASS/0FAIL/1nativeSKIP; client build PASS. New isolated PostgreSQL atomicity/control/retry/negative-stock/history tests await mandatory CI, not LAB PASS. New behavior LIVE NOT TESTED. Existing other owners/full-card/invoice/POS permanent-price evidence preserved. Next: green full CI, main exact guarded release, read-only hosted UI/preview verification. Actual state-changing LAB acceptance requires fresh before/after/control checkpoint; do not merge real duplicate screenshot cards without selected survivor and explicit reviewed confirmation. Same owner retained for any untested residual.


## 15/10/2026 — INVENTORY-MERGE-01 / ASSIGNED / NOT TESTED

Owner feat/inventory-bulk-vat-20261015; user expands request to explicit 2–4 selected cards into one survivor. Independent from invoice merge. Preview required; preserve historical IDs, no DELETE of products or invoice/sale history. Restrict first delivery to products exclusive to selected store; reject other-store associations, incompatible units/VAT, composition, open drafts/counts or nonstandard barcode mappings. Move eligible barcodes/supplier links and net stock with paired audited stock movements; archive sources in selected store only, no payment/fiscal posting. Native transactional/retry/conflict tests required. No actual real-store merge until user chooses survivor and confirms preview. Scope remains NOT TESTED.

