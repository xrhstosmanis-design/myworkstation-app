# N40 / AI-CC-LIMITS — Full Digital Twin navigation audit

Date: 2026-10-10 (Europe/Athens)

Status: SOURCE AUDIT FINDINGS / FIX PENDING / LIVE NOT TESTED. This is not a completion or PASS declaration.

Requested by the project owner: start printed task 40, followed by "continue". Working branch: `codex/n40-full-twin-navigation-audit-20261010`.

## Scope and publication boundary

The numbered checklist maps task 40 to `AI-CC-LIMITS`: Full Digital Twin transition clicks remain untested. The original visual acceptances for phases 1–14 remain closed and must not be repeated. AI credits/billing, invoice, inventory, workforce, video implementation and all other existing owners remain outside this assignment.

This branch contains a documentation-only source audit. It does NOT claim that the central tracker ownership update has been published to main. Before implementation or state-changing LAB work, reconcile and publish the exact N40 claim in `docs/roadmap/OPEN_WORK_TRACKER.md` through the existing green-CI/main workflow. Do not replace the tracker with a partial file or overwrite concurrent updates. The numbered list and PDFs have not been changed; no completion status is being proposed.

## Source evidence read

- `docs/roadmap/NUMBERED_WORK_CHECKLIST_2026-10-06.md`, task 40.
- `docs/roadmap/OPEN_WORK_TRACKER.md`, `AI-CC-LIMITS` section and latest ownership notes.
- `AGENTS.md`: preserve accepted results, selected-store isolation and central claim requirements.
- `client/src/components/platform/AiCommandCenter.jsx`, blob `c42df6207e7f8ba6255c1d7bf71b34f7a23fa192`: store-status callbacks, local selectedTwin state and fullTwinAreas (approximately lines 184–196).
- `client/src/components/platform/PlatformAdminApp.jsx`, blob `c5a97f2859dcdc362564c4ac2f7b445bb8f05e94`: AiCommandCenter integration and destination close handlers (approximately lines 573–610).

These are repository source observations, not evidence of the deployed client revision or authenticated browser behavior.

## Findings

### N40-F1 — selected-store context is not propagated by three tile routes

The Full Digital Twin area table uses `open:onOpenChecks` for POS and `open:onOpenCash` for EFTPOS / cash registers. The Cash tile uses `open:selectedTwin.status.open`; the store-status resolver selects the generic checks/cash/payments/bank callbacks. None of these callbacks captures the selected twin's company/store pair.

The parent confirms the gap: `onOpenChecks`, `onOpenCash`, `onOpenPayments` and `onOpenBank` are zero-argument handlers. They close the Command Center and open the central destination; they do not consume the selected Twin's companyId/storeId. Simply adding arguments at the child would therefore be insufficient.

In contrast, Stock, Workforce and Video callbacks explicitly pass `selectedTwin.companyId, selectedTwin.id`; the parent resolves both against its company/store data before opening. This is a positive SOURCE wiring observation only, NOT a runtime or permission PASS.

No server-side data leak or authorization bypass was tested or established. The established issue is absence of explicit selected-store handoff in the inspected source.

### N40-F2 — no explicit return-to-Command-Center path in the inspected integration

Destination callbacks set `showAiCommandCenter` false. Destination close handlers inspected in the parent clear their own state but do not set it true again. `selectedTwinId` is local state in the conditionally mounted Command Center, initialized to an empty string. Reopening this component cannot rely on that unmounted local state to retain the prior selection.

A bounded fix must preserve navigation origin and the selected company/store, while preserving normal close behavior when the destination was opened directly from Platform Admin. A broad global selected-store replacement is not required or justified by this finding.

### N40-F3 — stale selected Twin silently falls back to the first store

The inspected selector is `digitalTwin.find(item=>item.id===selectedTwinId)||digitalTwin[0]||null`. The first-store fallback is unconditional: it applies both to an initial empty selection and to a nonempty selection that disappeared after refresh. The latter can change the context silently.

Handle invalidated selection explicitly and disable store-specific navigation until a valid authorized store is selected. Assess initial central-view selection separately; do not silently broaden an invalid store to an all-stores view.

## Bounded implementation and acceptance queue — NOT EXECUTED

1. Publish the scoped central claim after reconciling fresh main and preserving all other owners.
2. Trace canonical destination APIs/props. Add explicit company/store handoff for the three unscoped routes; preserve the intended destination for each tile rather than merely attaching ignored arguments.
3. Preserve return origin and selected store without changing previously accepted visual design or ordinary destination entry/close behavior.
4. Reject stale/invalid selection and stale responses without a fallback to a different store.
5. Run focused callback/selection tests, then authenticated read-only LAB acceptance for all six tiles: POS, EFTPOS / cash registers, Cash, Stock, Workforce, Video. Verify destination title, selected store and request scope, then return to the same Twin.
6. Include a second authorized store/control, missing or revoked store access, module denial and an unavailable data source. Do not treat source-level wiring or CI as live acceptance.
7. Publish only actually observed results and residuals; synchronize the tracker/checklist/manual/PDFs when the appropriate claim or acceptance is ready.

## Actual execution and limits

Completed: read-only repository inspection and this documentation checkpoint.

Not executed: application source fix, build, lint, unit/integration suite, authenticated UI clicks, screenshots, LAB mutations, production deploy, central tracker ownership publication or full N40 acceptance. No sales, payments, fiscal commands, stock, staff, camera or billing changes were made.

The current tool session has repository access but no connected authenticated browser runtime. Local repository cloning also failed because the execution environment could not resolve github.com. These are execution limitations, not application functional failures. No browser PASS, CI PASS, merge or live revision is inferred from them.

N40 remains OPEN. Next executable implementation step: publish the exact scoped central claim and trace the canonical destination interfaces before a minimal source patch.

## 2026-10-10T10:51:38+03:00 — implementation instruction and scoped claim

N40-NAV-CLAIM-20261010: owner explicitly instructed «ξεκινα» after the audit. Same owner `codex/n40-full-twin-navigation-audit-20261010`. The central tracker, active list, pending list and numbered list now contain the bounded N40 claim on this branch. This supersedes only the earlier note that those files were not updated; publication to main still requires final green CI and merge. No application source or LAB action yet. Temporary preparation operates only on PR2040 head branch, never main, removes itself before final review and preserves concurrent main updates. The local clone failed DNS resolution again; tracked repository source is exported as a short-lived review artifact, without credentials or untracked files. Next: inspect complete source/checkpoints and implement one causal navigation fix after claim merge. Full N40 OPEN / NOT TESTED.
