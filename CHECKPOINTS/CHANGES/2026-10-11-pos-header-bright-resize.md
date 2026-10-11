# POS header brightness and resize — item 2

## 11/10/2026 17:00 Athens - POS-HEADER-LIGHT-RESIZE-02 / ASSIGNED / NOT TESTED

Owner/source `codex/pos-header-bright-resize-20261011`. User11Oct16:53 Athens says continue after delivery of item1; this explicitly authorizes item2 without declaring item1 USER PASS. Item1 calculator remains AWAITING USER; prior instruction to wait is superseded only for proceeding to item2. Items3–9 remain queued.

Original supplied image(20261011-095504).png recovered and visually inspected (1920x203): dark green two-row POS header with primary controls plus wireless ordering/Chat/Barcode/work-card/radio. Target is header brightness and its lower edge, not an unidentified modal or all-system theme. Main3e37a194 preserves current Audit/voice owners and calculator sourceae7c8cc4. Existing08–09Oct auxiliary-header USER PASS remains protected: all same authorized launchers inside the header, wireless ordering uses existing module, modal portals and radio behavior unchanged.

Bounded client presentation: light MyWorkStation header, clearly contrasting text/buttons; visible bottom resize handle for mouse/touch and keyboard; vertical sizing respects natural content minimum so controls never get clipped, protects remaining cart/payment area, and safely remembers browser-local size per store if available. No catalogue/price/permission/API/schema/auth/fiscal/stock/shift/payment change. No production/LAB business action or accepted transaction replay. New physical resize/brightness acceptance NOT TESTED; CI is not USER/LAB PASS.

Require real rendered isolated POS before/after at1920x1080/1366x768/1280x600, relevant font sizes, compact/expanded/viewport-wrap behavior, pointer/touch/keyboard/reset, calculator and scanner regressions; no forbidden API writes from resizing. Node20 build/full source+main CI/invariants/isolated E2E, merge and ordinary guarded exact release before user test. Manual stays unchanged until actual acceptance. Single next action: publish green claim on main before source. Checkpoint `CHECKPOINTS/CHANGES/2026-10-11-pos-header-bright-resize.md`.

