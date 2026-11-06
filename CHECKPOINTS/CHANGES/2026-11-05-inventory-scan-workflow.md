## 05/11/2026 — INVENTORY-SCAN-WORKFLOW-01 / ASSIGNED BEFORE SOURCE

Owner /root, branch fix/inventory-scan-workflow-20261105, explicit owner requests in this conversation. Bounded personal inventory UI: quantity Enter/next row, preserve counted-only filter across detail reload, missing barcode notice and existing full product card with products.create and inventory.count checked. Existing central BackOffice and reconciliation owners retain every other scope. USER FAIL screenshots at Rizareio; no new LAB action. Required mounted UI/security/native regressions, full CI, exact guarded release and LAB acceptance; no real stock/count/finalize/payment action for diagnostics. Checkpoint CHECKPOINTS/CHANGES/2026-11-05-inventory-scan-workflow.md.

Registry recovery: source c099811 replaced these shared registries with only the Acharnon source note. Restore the complete pre-change 1525890 records and retain the Acharnon source note below. This is document recovery only; fiscal source and every prior owner/PASS are unchanged.


Preserved current source note from the replaced registries:

## 05/11/2026 — ACHARNON-RBS-FISCAL-PROFILE-01 / SOURCE PR #3682 / CI PENDING

Source owner: isolated Acharnon RBS profile follow-up to merged before-source claim PR #3678. Branch `fix/acharnon-rbs-fiscal-profile-20261105`. Exact selected store `cmw0pwyvo000uokg2jrjm1p0c`; owner identity is not hardcoded or inferred: the authenticated `req.user.companyId` must equal the tenant-owned, server-loaded `store.companyId`. Client checkout company/store fields never choose the profile.

Code adds ONLY Acharnon internal legacyVatCode → department/VAT profiles: 1/1/0, 2/2/0, 3/3/0, 4/4/6, 5/5/13, 6/6/24, 7/7/24, 8/8/0, 9/9/0, 17/17/24, 18/18/24. KAT10 and Diadoxou7 profiles are unchanged. The existing CAP Driver checkout builds the command after resolving the confirmed mapping; payments CASH1/CARD2 from existing installation settings remain unchanged, as do Windows-1253, mismatch block, one-shot/no-replay, shift, license, financial and stock posting. No schema, catalogue, pricing, production SQL, credentials or writer/device operation.

Tests added in `server/test/rbs-capdriver-acharnon-profile.test.js`: all eleven pairings, wrong/missing authenticated owner-store identity, foreign store profile cross-over, invalid VAT/code/department, and actual checkout command statement for NERO 500ML 0.50EUR department5 VAT13 with one CASH1 or CARD2 final CR; body-provided foreign identity cannot select profile. Source PR #3682 initially failed CI checkpoint policy because this log was missing; remediation recorded here. FULL PR CI / main CI / deployed exact revision / physical receipt / financial, payment, stock and audit deltas all OPEN until verified; no claim of successful sale. No repeat of older attempted or paid transactions.


Diagnosis: InventoryFastCount quantity key handler handles only ArrowDown; Enter submits find. Staff workspace open clears detail before every refresh, unmounting FastCount and resetting showAll. Delegated missing-product action is disabled; full InventoryNewProductCard already supports category/subcategory/VAT/department. Existing product creation API supports products.create; attaching to draft needs separate bounded inventory.count admission, never Owner role promotion. Preserve cumulative scan versus absolute pencil correction, optimistic countVersion/event IDs, stale scope locks, blind DTOs and explicit finalization. No code modified before this claim reaches green main. LAB NOT TESTED.

## 05/11/2026 — INVENTORY-SCAN-WORKFLOW-01 / dependent source PR #3692 / NOT RELEASED

PR #3692 depends on #3691 and implements a scoped new-product-to-current-DRAFT-stocktake attachment candidate. Staff admission requires both live transaction-time inventory.count and products.create checks; the unchanged Owner path is retained. The store-bound active product is inserted as an uncounted stocktake line, with ON CONFLICT reuse of an existing line ID and no stock/quantity/finalization writes. Personal UI displays confirmed or uncertain result and does not silently claim inventory acceptance. Narrow request routing test added; native database, mounted UI, full CI, merge, guarded release and LAB acceptance are NOT YET VERIFIED. Do not merge/deploy from this document alone.

CI triage: #3689, #3690 and #3691 each stopped at the repository checkpoint-policy gate before build-and-test. The GitHub connector returns empty text for the large existing KAT_ACTIVE_LIST file despite a non-empty blob SHA, so it has NOT been overwritten, truncated or fabricated. Recover the complete authoritative registry bytes before updating the required active list; preserve all prior owners and checkpoint content.
