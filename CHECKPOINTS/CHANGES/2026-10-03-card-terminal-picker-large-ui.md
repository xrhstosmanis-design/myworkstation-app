# 03/10/2026 — Larger card-terminal selector

Status: IMPLEMENTED / AWAITING CI

User requirement: the EFTPOS/card-terminal selection panel must be substantially larger, clearer and easier to use on touch screens.

Implementation:
- Scoped the change only to the card-terminal picker in StorePosPanel.
- Increased modal width and header readability.
- Changed terminal choices to two large touch targets on desktop.
- Added large labels and secondary descriptions.
- Kept responsive one-column layout for narrow/mobile screens.
- No checkout routing, RBS, CAPDriver, payment logic or terminal semantics changed.

Files:
- client/src/components/store/StorePosPanel.jsx
- client/src/components/store/store-pos.css

Next:
1. CI/build.
2. Visual verification on desktop/touch viewport.
3. After PASS update central WORK_CLAIMS board to DONE/PASS.
