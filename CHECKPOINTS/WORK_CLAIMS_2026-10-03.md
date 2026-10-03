# MyWorkStation — CENTRAL WORK CLAIM BOARD

Updated: 2026-10-03
Owner instruction: every ChatGPT/page/agent MUST read this file before taking work.

## Mandatory anti-duplication workflow
1. Before starting any item, read this board.
2. Only an item marked FREE may be claimed.
3. Claim it by changing status to CLAIMED / IN PROGRESS and identify the page/agent.
4. Other pages/agents MUST NOT work on a CLAIMED or PASS item.
5. On completion update the same item to DONE / PASS and add commit/PR/CI/deploy evidence when applicable.
6. If blocked, mark BLOCKED with the exact reason; do not silently duplicate work elsewhere.
7. Never reopen a PASS Gate without a specific user-requested regression reason.

## Canonical Gate status
- Gate 1 — Products: PASS. Only explicitly requested new UI/UX improvements are allowed.
- Gate 2 — Warehouse: PASS. New Inventory 2.0 mobile/tablet improvements below are separate enhancements.
- Gate 3 — Invoices: PASS / CLOSED. DO NOT REOPEN.
- Gate 4 — POS 1/2 & RBS: PASS. The ONLY remaining related enhancement is Mixed Payment.
- Gate 5 — Payments: PASS.
- Gate 6 — Online Orders / Delivery: OPEN.
- Gate 7 — Reports: PASS.
- Gate 8 — Roles / Security: OPEN.
- Gate 9 — Modules: IN PROGRESS (Workforce / Chat / PWA etc.).

## Work queue — 03/10/2026

### TODAY-01 — Larger card-terminal selector
Status: DONE / PASS — PR #1679, CI #4219 PASS, merged 1af48271
Completed by: current ChatGPT page — 2026-10-03
Requirement: make the EFTPOS/card-terminal selection dialog larger, clearer, touch-friendly, with larger controls.

### TODAY-02 — VAT Department product editing
Status: DONE / PASS — PR #1680, CI #4222 PASS, Render b9d1143f LIVE
Completed by: current ChatGPT page — 2026-10-03
Requirement: from VAT Department -> department items, allow full product editing from the pencil action and return to the same department/list after save. Preserve the central rule: category never silently changes VAT department/rate.

### TODAY-03 — Central Product Management UI refresh
Status: DONE / PASS — PR #1681, CI #4226 PASS, merged 461f09e9
Completed by: current ChatGPT page — 2026-10-03
Requirement: implement the approved visual direction for Master Catalog / store prices / mass price changes / offers / Excel-Barcode / inventory. Larger buttons and inputs, cleaner cards, less clutter, touch-friendly. Preserve existing functionality.

### TODAY-04 — Mass price change UI
Status: DONE / PASS — PR #1682, CI #4229 PASS, merged 68ce0f7e
Completed by: current ChatGPT page — 2026-10-03
Requirement: approved cleaner step flow: product selection -> stores -> price action -> preview -> apply.

### TODAY-05 — Offers UI
Status: DONE / PASS — PR #1683, CI #4232 PASS, merged 25085ddc
Completed by: current ChatGPT page — 2026-10-03
Requirement: approved cleaner layout with product search, offer settings, dates, stores and clear preview/info.

### TODAY-06 — Excel / Barcode UI
Status: DONE / PASS — PR #1684, CI #4235 PASS, merged d957d10f
Completed by: current ChatGPT page — 2026-10-03
Requirement: approved cleaner split between Barcode offer flow and Excel import, with large scanner/touch-friendly controls.

### TODAY-07 — Inventory 2.0 mobile/tablet + unknown barcode
Status: CLAIMED / IN PROGRESS
Claimed by: current ChatGPT page — 2026-10-03
Requirement: make inventory cleaner/mobile/tablet friendly. When scanned barcode is unknown, offer:
A) attach barcode to an existing product, or
B) create a new product.
After save, return directly to the same inventory session and continue.

### TODAY-08 — Commercial Modules layout
Status: FREE
Requirement: smaller module cards arranged across left/center/right instead of one long vertical row. Use available width. Remove the redundant POS module button from this section.

### TODAY-09 — Owner store page simplification
Status: FREE
Requirement: on initial load show ONLY these two expanded panels:
1. Shift Center (Κέντρο Βαρδιών)
2. Owner / Manager Payments (Πληρωμές Ιδιοκτήτη / Διαχειριστή)
Everything else must be behind large, clear buttons/tiles and open only on demand.

### PAY-01 — Mixed Payment
Status: FREE
Requirement: only remaining enhancement related to Gate 4. Gate 4 itself stays PASS.

### G6 — Online Orders / Delivery
Status: FREE / OPEN GATE
Must be claimed before work.

### G8 — Roles / Security
Status: FREE / OPEN GATE
Must be claimed before work.

### G9 — Workforce / Chat / PWA
Status: FREE / IN PROGRESS AREA
Existing completed Workforce schedule work MUST NOT be repeated. Continue only from current unfinished checkpoints.

## Installation — Diadochou Pavlou
Status: OPEN, separate installation track
Known topology: 1 POS, 1 RBS cash register, 1 EFTPOS.
Remaining focus: installation/connection procedure and final onsite validation. Do not apply KAT 2-POS assumptions here.

## Permanent rule
When a page/agent finishes an item, it MUST update this board first. The next page/agent then claims a different FREE item. This board is the canonical coordination point to prevent duplicate implementation.

## Global UI rule — 03/10/2026
All new and revised MyWorkStation screens must use large, highly legible typography, large touch-friendly buttons and inputs, clear contrast, and avoid cramped tiny helper text. Applies to desktop, POS, tablet and mobile.
