# Central POS packages and cash returns — assignment continuation
## 17/11/2026 — POS-PACK-STOCK-01 / POS-SCAN-RETURN-01 — ASSIGNED /root
Branch work/pos-packs-returns-20261117. Owner approved central implementation and documentation merge. Claim #4001 merged c8fb55a; NOT TESTED.
Continuation for these two independent new tasks only: [scope and pending acceptance](../../docs/roadmap/POS_PACKS_RETURNS_2026-11-17.md).
Package products have their own barcode/button and store-specific sale price; consume linked base bottle units (24 or 6). Scanned cash return needs no replacement or original receipt selection; restore stock and reduce current terminal cash once, with unchanged card totals and no duplicate miscellaneous expense. Preserve permissions, isolation, fiscal gates, audit and idempotency; existing owners/return flows retained.

The connected GitHub application is functional; CLI push authentication is not required for bounded connector publication. Previous push blocker is superseded for small files.
The large historical tracker and pending roadmap are retained unchanged. This small continuation follows COMMON_WORK_RULE.md's instruction to continue in a new Markdown when existing documents are too large. It covers only the two new independent tasks; no ownership transfer of scanner/permissions/other POS work.
Baseline 21dd890: inspection only. Existing original-sale returns remain protected; exchange endpoint must not become a fiscal bypass.
Acceptance: existing LAB, before/after cash, stock, card control, 1 and 2 packs, loose+pack, return, retry/double-submit, cancel, permission denial, cross-store rejection. Code CI is not LAB PASS. No production mutations.
Next: implement after this synchronized documentation claim is merged. Source merge/deploy needs owner approval.

Previous central registries: [OPEN_WORK_TRACKER.md](OPEN_WORK_TRACKER.md) and [PENDING_WORK.md](PENDING_WORK.md).
