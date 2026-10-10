# N40 selection guard and remount retention

## 2026-10-10T11:06:54+03:00 — N40-SELECTION-GUARD-20261010 / SOURCE / AWAITING CI AND LAB

Same logical owner codex/n40-full-twin-navigation-audit-20261010; implementation branch fix/n40-twin-selection-20261010. Claim PR2040 merged0618764ab1beb13e1047780ef9bdc41d59a17dfc after exact head CI38036258928 SUCCESS. First causal selection patch only: exact company/store pair, latched initial selection, fail-closed unavailable message with no six-domain actions, in-memory parent retention across Command Center close/manual reopen and reset on session clearing. No silent first-store fallback for remembered invalid selection. No new persistence, token mechanism, API, authorization, business action, CSS redesign or device change. Local dependency-free Node22 helper tests8/8 PASS; Node20 mounted real-parent tests and existing CC regressions run separately below. Not authenticated LAB or visual acceptance.

Residual OPEN: explicit selected-store handoff for POS/EFTPOS/Cash, automatic return from all destinations, same-tab Stock support-navigation return, data-source races, server role/module/revocation breadth and all six authenticated LAB transition tests. Manual reopen retention is not automatic return or full page reload persistence. Visual phases1–14 and all other owners remain protected. Central PDFs preserve other owners latest reports; candidate generation from prior claim succeeded but publication still PENDING. Checkpoint CHECKPOINTS/CHANGES/2026-10-10-n40-selection-guard.md. No manual PASS.

## Isolated Node20 focused execution

The preparation runner executed both new selection suites, including the real mounted PlatformAdminApp/AiCommandCenter with fixture APIs/panels, plus the existing Command Center phase regression suite. The focused command passed; exact assertions/counts are in n40-focused.log. Standard full repository CI, production deployment and authenticated LAB remain NOT TESTED at this commit. This is synthetic runtime evidence only, not server authorization or real store acceptance.
