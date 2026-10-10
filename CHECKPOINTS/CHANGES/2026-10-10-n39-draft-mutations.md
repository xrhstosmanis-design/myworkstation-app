# N39 — draft mutations versus finalization

Owner codex/n39-inventory-acceptance-20261010 retained; bounded branch fix/n39-draft-finalization-20261010, based on main9505a0bbf2933620e1cab8f01539773507b2424f after PR2056. Read AGENTS/current active/checkpoints/manual/pending/tracker and main history since accepted SELF-01 and WASTE-PAIR-01. Those bounded LIVE PASS results are published; no accepted posting is repeated. Full39 OPEN.

## Pre-change evidence and causal plan

Protected LAB PASS: measured partial LIVE/NONE stocktake11→10/report−1/oneadjustment; source/destination transfer9→8/0→1; expired10→9; SELF8→7; bounded waste pair7→5; ledger agreement/duplicate0; both financial controls unchanged. Gate2 and desktop scroll remain protected. Current TEST1 last observed5, destination1, latest sourceWASTE11:54:13. No production mutation in this source assessment.

Source review: finalize locks Stocktake in its transaction before stock/lines and validates DRAFT. Count, bulk-zero, clear, import and attach-barcode check DRAFT before their transactions; add-line writes outside a transaction. A request can retain that earlier DRAFT result while finalization commits. This is a candidate race, NOT a new LIVE FAIL. First reproduce against the actual registered handlers using a controlled stale DRAFT read followed by FINALIZED transaction state. Then one bounded causal fix: share the parent-row DRAFT lock inside every line-mutation transaction, matching finalization lock order. Do not alter quantity arithmetic, roles, company/zone guards, movement trigger, ordinary movement locking, legacy inventory, barcode workflow, auth, schema or finance.

Meaningful regression: actual handlers must return409 without writes after stale access; native isolated PostgreSQL must exercise finalization-before-mutation and mutation-before-finalization, replay/version checks, recount rejection, company/zone/role denial and unchanged unrelated/control stock. Existing finalization/native trigger tests remain required. Local PostgreSQL absent: local SKIP is not native PASS. Full CI with actual PostgreSQL, green merge, exact guarded deploy/health required before fresh LAB acceptance. No physical/mobile, QR/PIN grant or full39 PASS claim. Mandatory finalization cause remains a separate bounded defect and is not included in this change. Other owners33/44/40/TODAY-07 untouched.

## Isolated reproduction before correction

Actual registered handlers, controlled pre-access DRAFT then transaction FINALIZED: count200/2writes, bulk-zero200/2writes, clear200/2writes, add-line200/1write, attach-barcode200/2writes, import200/2writes. This proves stale-state handler failure in isolation; it is not a LIVE LAB result or native lock-overlap claim. No production request made. Corrected expectation409/0writes for all six.

Local verification: Node20 targeted actual-handler/protected inventory tests19PASS/0FAIL/2nativePGSKIP; frontend production bundle build PASS. Native PostgreSQL CI remains required, not inferred.
