# Inventory history/report permission boundary — reviewed source map

01/11/2026. DESIGN / NOT EXECUTABLE RIGHTS / NO NEW GRANT. CENTRAL-BACKOFFICE-ACCESS-01 retains BackOffice access integration; INVENTORY-RECONCILIATION-01 owns the explicitly transferred audit/investigation/report value-field extension under merged claim3492/6352b57. This review does not take that implementation back. Current baseline main06a2f95db91c78e5326141d1becbb4167910eca7; independent health5c3e9eacb69ce2c0df801eb5dd9aecf04506d69e. The existing21 exact capabilities and all profile defaults remain unchanged.

## Actual boundaries and dependency

The retained-owner next action from3487 was field classification before any executable grant. Newer claim3492 explicitly transfers the overlapping value/report extension; PR3495 is actively implementing it. Its reviewed unmerged head7b212cfb6fed92d2a2a2289a75854357e05cadaa is a reference only, not installed/source acceptance. Do not merge or rewrite that owner's work from this page. All other permission integrations remain assigned here.

Existing personal list/detail routes are /api/backoffice-staff/inventory/stores/:storeId/stocktakes and /:stocktakeId. List is DRAFT-only. Detail is DRAFT or the existing finalizer's FINALIZED detail; finalizers already receive expected quantities, other counters do not. Cost/retail/actor/device fields are omitted. Preserve that accepted compatibility boundary: existing finalization alone does not authorize a new audit/report/export. Do not silently remove the finalizer's existing detail fields while designing new optional read rights.

Owner native readers are inventory-v2-audit.js: GET /stocktakes/:stocktakeId/audit, /audit.csv and /investigation. They do not admit personal EMPLOYEE sessions. Investigation additionally requires FINALIZED and live paid LOSS_DETECTION. They are not alternate personal readers to reveal with a role label or a prefix allowlist.

Reference PR3495 adds /reconciliation via createInventoryReconciliationHandler. The handler explicitly refuses staffAccess and INVENTORY_COUNTER before any report read. It checks finalized/current-store ownership, paid Loss Detection, strict query fields and an exact source fingerprint before PDF/XLSX. Those controls remain. Its report status is REVIEW_REQUIRED, and coverage explicitly excludes physical times, identity grouping, reviewed corrections, complete invoice and system-event audit. Its null missing-cost values and separate shortages/surpluses/net cannot be upgraded to a complete result by a permission flag.

## Field matrix for future explicit integration

The labels below are policy concepts, not selectable capability keys. Exact keys enter the executable catalogue, Owner editor, native adapter and tests together only after the canonical interface is available.

| Information/action | Explicit authority needed | Fields/derivations that must remain absent otherwise |
|---|---|---|
| Finalized history navigation | Separate history read, scoped to selected store, plus inventory.read | No finalized-list fallback from ordinary blind count/read; no other-store IDs/names |
| Count audit/history | Separate audit read plus scoped history/read | Base projection may contain authorized product code/name, counted quantity/version and count timestamps/source; never forward raw header/snapshot/scope JSON |
| Theoretical stock/differences | Explicit theoretical-stock visibility | expectedQuantity, difference, signed/absolute shortage/surplus, theoretical totals, expected fields inside events, baselines, movement-derived theoretical quantities and all equivalent inferences |
| Cost | Explicit cost visibility | unitCost, cost method/values/totals; difference cost additionally requires theoretical-stock visibility. Never map missing cost to zero |
| Retail monetary values | Explicit retail-value visibility | salePrice, retail totals/difference values; derived differences also require theoretical-stock visibility |
| Operator identity | Separate audit identity visibility | actorName/countBy/creator/finalizer names. Raw actor/user/device IDs and internal tokens have no default personal projection |
| Investigation evidence | Separate investigation authority plus paid Loss Detection and required quantity visibility | No source evidence from sales/invoices merely because an inventory right exists; require existing sales.read/invoices.read respectively or withhold the entire relevant evidence group |
| Audit export/application print | Separate export/print authority plus the underlying read and field rights | CSV/PDF/XLSX must use the same authorized projection, not the original Owner response/CSV or an unredacted cached report |
| Reconciliation report/export | Separate reviewed authority using the incoming canonical contract, exact current/previous selected-store identities and required field rights | No promotion to OWNER, no inference that all21 store rights authorize the new route, no reinterpretation of source coverage/status |

Cost permission without quantity-difference permission must not expose differenceValue/shortageValue/netValue: division by a known unit cost would reveal the hidden quantity difference. The same applies to retail values. Counted quantity multiplied by an authorized unit cost is a separate allowed concept, not permission to return theoretical stock. Totals, headers and every nested event/evidence row require the same projection rules as visible columns.

Raw scopeJson/snapshotJson, free text notes/details, generic spread operators and unknown future keys are not safe personal DTOs. Use an explicit allowlist per header/summary/line/event/evidence type; omit unavailable fields rather than invent zero or infer absence of evidence. Do not scrub embedded monetary/actor/source information with regular expressions. If evidence is withheld, the presentation must say coverage is restricted; it must not report zero evidence or complete reconciliation from a partial view.

## Concrete source mismatches to resolve in the canonical integration

- Owner audit returns expected/cost/retail, derived totals, names and raw snapshot/scope; each can leak hidden fields even if a table column is removed.
- Native /audit.csv includes fields/rows independently of the JSON audit. FINALIZED FREE JSON excludes uncounted lines, while that CSV query does not apply the same filter. A personal export must follow its authorized canonical DTO and not fall back to the Owner CSV.
- Native investigation returns expected/unitCost/differenceCostValue and free-text evidence references/details, including invoice/sales/actor information. Live inventory-only authority is insufficient for that composite response.
- Legacy normalization Number(value||0) makes unknown costs look like zero in existing Owner audit. The incoming reconciliation preserves missing/nonpositive costs as null and reports missing-cost coverage. Do not copy the legacy normalization into new personal reports or alter the other owner's calculations here.
- Native investigation's current90-second possible-duplicate heuristic is not proof of responsibility or the complete approved automatic inventory method. Access integration must preserve its meaning/coverage and cannot label it definitive or charge an employee.
- Current personal detail/list cannot simply load every finalized report. New history access, redacted fields and exact store/tenant binding must be integrated deliberately. Existing finalizer detail compatibility remains protected.

## Required adapter and proof before any new right is installed

Keep real EMPLOYEE identity and exact method/path classification. Obtain selected store from authenticated/current personal scope; bind both stocktake IDs and every source object to it and the same company. No missing-store company fallback, support-token substitution or Owner-role shim. Recheck actual live account/session/grant/licence/modules and all optional field/source rights before and after the canonical read. Compare lifecycle generation and captured rights revisions; fail/reload if changed rather than returning a mixed or stale projection. Use private/no-store and late-response/render fences on store, report, API or session changes.

Generate the authorized projection before UI/export. An old report or loaded financial column must disappear on permission/scope changes. Export requires a fresh authorization check and a fingerprint bound to source, selected objects, principal/field visibility and current scope. Keep the incoming native source-fingerprint check; do not replace it with a client-only check. Application printing is a UI/data permission; OS/browser printing of already authorized data is not an enforceable application boundary.

Required proof: minimal/independent rights and unchanged old defaults; exact direct-API/foreign parent and previous-stocktake attacks; recursive absence of denied keys and equivalent derived leaks; unknown nested keys denied; withdrawn field/source right during read/export; stale scope/session/period/fingerprint and old mounted output; null cost/coverage/status preserved; JSON/CSV/PDF/XLSX visible values consistent; CSV formula escaping; existing native Owner controls/semantics unchanged; no financial, stock, count/finalize, schema or hosted grant mutation. Full exact PR/main CI and guarded release precede separately measured hosted acceptance. CI is not LAB PASS.

## Current disposition

Classification review complete; implementation/integration remains OPEN and dependent on the separately owned canonical report/field work in3495. No new checkbox, key, route admission, reader, export or field visibility was installed by this review. No runtime source, grant, credential, schema, worker or business data changed. No LAB/USER/manual/numbered PASS closure. The new audit/value implementation remains with INVENTORY-RECONCILIATION-01; CENTRAL-BACKOFFICE-ACCESS-01 retains the remaining access integration and all non-transferred BackOffice scope. Single next action: reconcile the merged/stable canonical report DTO with this field contract and record the bounded access-only integration before source; do not duplicate or take over the active report implementation.
