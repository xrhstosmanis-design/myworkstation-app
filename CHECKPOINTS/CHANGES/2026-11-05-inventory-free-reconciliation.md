# Inventory reconciliation — counted scope for FREE stocktakes

## 05/11/2026 — INVENTORY-RECONCILIATION-01 / FREE COUNT SCOPE / BEFORE-SOURCE CLAIM

Same retained report/value/review/correction/export owner /root; bounded branch `fix/inventory-free-reconciliation-20261105`. User task6 continues in small pieces. Source baseline `759311ed86ad3d58f77b6819fb408043a60f6031`, Render `dep-dbmcgdd9el5s73a4nq90` reported live at that exact revision. Earlier residual receipt remains in PR3645; this independent causal fix does not transfer other owners or close that full request.

Read-only prerequisite inspection found no eligible two-code finalized LAB pair. Fresh native PostgreSQL read at2026-11-05T18:45:31.429176Z confirmed four finalized stocktakes (1/15/1/1 counted lines), the protected LAB31 FREE draft with109persisted lines/0counted,109active LAB products and2existing review audit rows. Proposed LAB-IR6-20261105-A/B codes do not exist; no fixture or business write was made.

Concrete code inconsistency: ordinary Owner creation uses FREE; normal FREE finalization/detail excludes lines whose countedQuantity is null, while inventory-reconciliation-source.js includes every persisted line. Uncounted catalogue placeholders can therefore add unknown groups and prevent complete comparison totals for an otherwise complete two-code test.

Claim only the reconciliation source reader and its regression coverage: align each FREE snapshot with the canonical counted-line semantics; retain products counted in only one snapshot as unknown, preserve explicit zero counts, leave FULL/PARTIAL and legacy scope behavior unchanged, and retain scope/caps/read-only/idempotency/unknown-cost protections. Source evidence and movement retrieval must remain restricted to the actual comparison's product set. Do not edit count/finalization, product, Enter/scanner, access, invoice or financial writers.

Required isolated proof: FREE10/10→8/11 plus an unrelated null/null row yields exactly2items with-2/+1 and total-1; a separate null→3 or3→null item remains unknown; counted0 is retained; FULL/PARTIAL/legacy null rows remain visible; unrelated uncounted movements do not pollute the comparison. Actual PostgreSQL/HTTP/export checks and exact fullCI remain required. Existing November2 accepted source/cost/correction/revoke/navigation behavior stays protected. No hosted LINK, new count/stock/finalization or deployment is part of this claim.

Status BEFORE SOURCE / NOT TESTED. Next: publish this retained-scope claim, then implement and verify one bounded reader correction. Existing manuals/PDF functional PASS claims are unchanged; no new functional closure.

Checkpoint: CHECKPOINTS/CHANGES/2026-11-05-inventory-free-reconciliation.md.

