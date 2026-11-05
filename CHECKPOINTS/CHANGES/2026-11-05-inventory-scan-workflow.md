## 05/11/2026 — INVENTORY-SCAN-WORKFLOW-01 / ASSIGNED BEFORE SOURCE

Owner /root, branch fix/inventory-scan-workflow-20261105, explicit owner requests in this conversation. Bounded personal inventory UI: quantity Enter/next row, preserve counted-only filter across detail reload, missing barcode notice and existing full product card with products.create and inventory.count checked. Existing central BackOffice and reconciliation owners retain every other scope. USER FAIL screenshots at Rizareio; no new LAB action. Required mounted UI/security/native regressions, full CI, exact guarded release and LAB acceptance; no real stock/count/finalize/payment action for diagnostics. Checkpoint CHECKPOINTS/CHANGES/2026-11-05-inventory-scan-workflow.md.

Registry recovery: source c099811 replaced these shared registries with only the Acharnon source note. Restore the complete pre-change 1525890 records and retain the Acharnon source note below. This is document recovery only; fiscal source and every prior owner/PASS are unchanged.


Preserved current source note from the replaced registries:

## 05/11/2026 — ACHARNON-RBS-FISCAL-PROFILE-01 / SOURCE PR #3682 / CI PENDING

Source owner: isolated Acharnon RBS profile follow-up to merged before-source claim PR #3678. Branch `fix/acharnon-rbs-fiscal-profile-20261105`. Exact selected store `cmw0pwyvo000uokg2jrjm1p0c`; owner identity is not hardcoded or inferred: the authenticated `req.user.companyId` must equal the tenant-owned, server-loaded `store.companyId`. Client checkout company/store fields never choose the profile.

Code adds ONLY Acharnon internal legacyVatCode → department/VAT profiles: 1/1/0, 2/2/0, 3/3/0, 4/4/6, 5/5/13, 6/6/24, 7/7/24, 8/8/0, 9/9/0, 17/17/24, 18/18/24. KAT10 and Diadoxou7 profiles are unchanged. The existing CAP Driver checkout builds the command after resolving the confirmed mapping; payments CASH1/CARD2 from existing installation settings remain unchanged, as do Windows-1253, mismatch block, one-shot/no-replay, shift, license, financial and stock posting. No schema, catalogue, pricing, production SQL, credentials or writer/device operation.

Tests added in `server/test/rbs-capdriver-acharnon-profile.test.js`: all eleven pairings, wrong/missing authenticated owner-store identity, foreign store profile cross-over, invalid VAT/code/department, and actual checkout command statement for NERO 500ML 0.50EUR department5 VAT13 with one CASH1 or CARD2 final CR; body-provided foreign identity cannot select profile. Source PR #3682 initially failed CI checkpoint policy because this log was missing; remediation recorded here. FULL PR CI / main CI / deployed exact revision / physical receipt / financial, payment, stock and audit deltas all OPEN until verified; no claim of successful sale. No repeat of older attempted or paid transactions.


Diagnosis: InventoryFastCount quantity key handler handles only ArrowDown; Enter submits find. Staff workspace open clears detail before every refresh, unmounting FastCount and resetting showAll. Delegated missing-product action is disabled; full InventoryNewProductCard already supports category/subcategory/VAT/department. Existing product creation API supports products.create; attaching to draft needs separate bounded inventory.count admission, never Owner role promotion. Preserve cumulative scan versus absolute pencil correction, optimistic countVersion/event IDs, stale scope locks, blind DTOs and explicit finalization. No code modified before this claim reaches green main. LAB NOT TESTED.

## 05/11/2026 — ENTER quantity PR #3689 / technical follow-up

Source commit cbc5d22 changes the quantity input Enter key to invoke the existing guarded save(event), preserving ArrowDown and scanner additive quantity semantics. Mounted delegated regression was added at commit 0ec40c3: one Enter expected to send exactly one inventory.count payload with line/version/event identity and no owner API writes. This test is committed but has NOT passed native CI or LAB. Initial PR workflow 42082287351 failed in checkpoint policy BEFORE functional tests; other independent jobs completed. GitHub fetch_blob recovered full existing KAT_ACTIVE_LIST content (5,078,088 characters), but creating its updated 5MB blob failed with an HTTP/2 request body error. The original central registry remains untouched and must not be replaced by connector fetch_file empty content. Required active list update, full CI, review, guarded release and LAB acceptance remain pending.
