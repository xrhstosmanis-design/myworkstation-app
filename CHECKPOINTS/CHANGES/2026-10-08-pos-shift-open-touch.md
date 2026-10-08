# POS shift-opening touchscreen layout

## 08/10/2026 — POS shift opening / touchscreen layout — ASSIGNED

Owner `codex/pos-shift-open-touch-20261008`, independent presentation subtask of tracker03, claimed 2026-10-08T10:36+00:00. Existing installation, fiscal, preflight and shift-close owners remain unchanged. Checkpoint `CHECKPOINTS/CHANGES/2026-10-08-pos-shift-open-touch.md`.

USER-reported layout FAIL: opening form exceeds available height; confirmation below viewport. Requirement: touchscreen operation at100% without keyboard zoom/fullscreen shortcuts. Exact physical browser revision NOT CAPTURED. No transaction evidence or new financial PASS claimed.

Scope: only opening-form responsive layout and touch-sized controls. Preserve mandatory initialCash authorization, resolved overview/access gate, four real cash amounts, complete receipt declaration, unchanged submit/API, operator change, tenant/module/fiscal gates and protected05Oct opening/closing/QR PASS; Gates3/4/6/8 not reopened. No production data or shift action. Status AWAITING IMPLEMENTATION/CI/deploy/LAB, no new PASS. Acceptance: actual touchscreen at100%, entire form/confirmation usable without keyboard shortcuts; errors visible; narrower/keyboard view reachable by touch. No shift submission for geometry evidence.

## Pre-change reconciliation

Read AGENTS, complete active list, numbered checklist, tracker, pending, relevant POS PASS manual and05Oct opening-fail-closed/closing checkpoints. Main107f60bb history since05Oct has no later opening-layout change. Latest verified05Oct mandatory opening/close/QR remains protected. Current08Oct real-store geometry FAIL is distinct from financial acceptance. Open PR inventory contains no opening-layout claim.

## Next action

Merge this claim before source editing. Then one scoped layout change, local viewport checks at100%, full green CI and exact deploy before physical acceptance.

## Implementation and isolated validation — AWAITING CI/deploy/LAB

Claim PR1872 merged after documentation CI37765209420 (classifier/Windows SUCCESS, full build correctly SKIPPED), main e292ff710016eed2923e02305361948f3dbe235d. Implementation branch codex/pos-shift-open-touch-implementation-20261008, owner page unchanged. Owner explicitly approved publication in this conversation.

Only a CSS import and opening-only shell class added to StoreOperatorApp; handlers, fields, declaration wording and all APIs unchanged. Added scoped stylesheet: compact store/operator header, two-column cash/declaration form, 50px inputs,56px confirmation,48px operator-change control. Login/no-initialCash/close layouts remain outside selector. Portrait keeps normal touch scrolling without clipping/hiding legal text.

Isolated Chromium rendering of actual React component with global production styles and mocked requests:1024x600,1280x620,1366x650,1366x768,1920x1080 — no normal document overflow, all6inputs50px, confirmation and operator change inside viewport. At1024x600 confirmation bottom547.49px; mocked API error still visible with confirmation bottom590.49px. Error card adds10px document overflow but action remains in view.600x800 narrow fallback has vertical touch scrolling, no horizontal overflow. All geometry reads made0writes; one mock-only rejected submit tested error display, never a live API. Full production build PASS; server suite1896tests/1892PASS/0FAIL/4SKIP; KAT safety source invariants PASS. These are LOCAL/ISOLATED results, not LAB/USER PASS.

Required acceptance: exact deployed revision, then actual touchscreen at100% showing four amounts, full declaration and visible confirmation. Do not submit/open a real shift merely to verify geometry. Financial/stock/physical receipt acceptance remains NOT TESTED; broader installation03/04/06/07 owners and residual stay unchanged.
