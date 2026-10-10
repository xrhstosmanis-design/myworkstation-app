# N40 selection guard and remount retention

## Current handoff — 10/10/2026 — SOURCE MERGED / FULL CI SUCCESS / OVERALL N40 OPEN

Same owner `codex/n40-full-twin-navigation-audit-20261010`; implementation branch `fix/n40-twin-selection-20261010`. Source PR **#2046** merged to main as **4e1d6673ce099db6849ba3d544583f23a637a513** after full standard **CI38036849847 / run5113 SUCCESS** on exact PR head **6d603151823db3bf728a1c0621d0d6c24b658e78**. This supersedes the earlier AWAITING CI note for this bounded source change only. Central tracker/active/pending already point to this checkpoint and retain N40 ownership. No source task or other owner is closed.

### Independently reviewed evidence

Preparation run38036750402 completed SUCCESS on Node20. Downloaded artifact11663488873 / n40-selection-review ZIP SHA256 `0215ed2fc28b686b59ee89efefaec32a4bd42b6c7f09bc7f19d0363cdefd5bf3`; contained source revision exactly matches the above PR head. Focused transcript reports **32 tests PASS / 0 FAIL / 0 SKIP**: eight mounted lifecycle subcases using the real PlatformAdminApp/AiCommandCenter with isolated API/destination fixtures; eight pure-helper cases; fifteen pre-existing phase-regression tests; Node also counts the mounted parent test. No mounted error or unexpected mock route/business write was recorded. Fixture login checks only selection-memory reset, not real authentication or permissions.

Standard full CI separately passed: Node20 server tests, client production bundle, Work/Render contracts, licensing/security/invariants, Windows script checks, isolated PostgreSQL import and real HTTP E2E test-environment flows. This is not production/LAB acceptance. Final source diff was reviewed: two component integrations, one helper, two tests and N40 checkpoint/active/tracker/pending updates. No temporary workflow, dependency, API, schema or production business-data changes remain in the PR.

### Bounded behavior implemented

An exact company/store pair is retained in parent memory. Initial display is latched too, so changing list order or removing that first store cannot select a different store silently. Missing/malformed remembered selections produce an explicit unavailable message with no six-domain action tiles. Explicit reselection recovers. Close/manual reopen within the same Platform Admin mount retains the pair; session clearing resets it. No new token handling or browser persistence was introduced.

### NOT TESTED and next action

Exact production deployment of merge4e1d6673 and authenticated LAB behavior have **not** been independently verified. No live/user visual acceptance or manual PASS is recorded. Source/CI success does not close task40. Visual phases1–14 remain protected and are not to be repeated.

Remaining work: explicit selected-company/store handoff for generic POS/EFTPOS/Cash destination callbacks; automatic return from canonical destinations; same-tab Stock support-navigation return; delayed response handling; server role/module/revocation breadth; six authenticated read-only LAB transition/return tests. Current retention covers **manual reopen in the same parent mount**, not automatic return or page reload. Central PDF publication is still pending; newest parallel-owner PDFs were preserved and regenerated candidates exported with the claim, not overwritten.

Next executable action for this same owner: trace canonical Checks/Cash/Supplier/Bank filter props and add bounded selected-store entry plus origin-aware return without changing ordinary central entry, support-token handling or business operations. Then focused regression/full CI, exact deploy readback, and authenticated read-only LAB verification when available. No financial/stock/staff/camera/fiscal/billing mutation is authorized by a navigation test. Do not redo the completed source guard or claim a second ownership.

## Historical preparation — 2026-10-10T11:06:54+03:00 — N40-SELECTION-GUARD-20261010

Same logical owner codex/n40-full-twin-navigation-audit-20261010; implementation branch fix/n40-twin-selection-20261010. Claim PR2040 merged0618764ab1beb13e1047780ef9bdc41d59a17dfc after exact head CI38036258928 SUCCESS. First causal selection patch only: exact company/store pair, latched initial selection, fail-closed unavailable message with no six-domain actions, in-memory parent retention across Command Center close/manual reopen and reset on session clearing. No silent first-store fallback for remembered invalid selection. No new persistence, token mechanism, API, authorization, business action, CSS redesign or device change. Local dependency-free Node22 helper tests8/8 PASS; Node20 mounted real-parent tests and existing CC regressions run separately below. Not authenticated LAB or visual acceptance.

Residual OPEN: explicit selected-store handoff for POS/EFTPOS/Cash, automatic return from all destinations, same-tab Stock support-navigation return, data-source races, server role/module/revocation breadth and all six authenticated LAB transition tests. Manual reopen retention is not automatic return or full page reload persistence. Visual phases1–14 and all other owners remain protected. Central PDFs preserve other owners latest reports; candidate generation from prior claim succeeded but publication still PENDING. Checkpoint CHECKPOINTS/CHANGES/2026-10-10-n40-selection-guard.md. No manual PASS.

## Historical isolated Node20 focused execution

The preparation runner executed both new selection suites, including the real mounted PlatformAdminApp/AiCommandCenter with fixture APIs/panels, plus the existing Command Center phase regression suite. The focused command passed; exact assertions/counts are in n40-focused.log. Standard full repository CI, production deployment and authenticated LAB had not yet run at this preparation commit. Standard CI has since passed as recorded above; deployment and LAB remain unverified. This is synthetic runtime evidence only, not server authorization or real store acceptance.
