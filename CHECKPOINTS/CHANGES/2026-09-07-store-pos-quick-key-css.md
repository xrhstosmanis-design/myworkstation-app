# Store POS quick-key CSS correction

Date: 2026-09-07

## Confirmed fault

The StorePosPanel JSX renders `standard-quick` with a direct child grid, while the stylesheet targeted unused `standard-quick-panel` and `standard-quick-grid` selectors. The intended quick-key geometry therefore did not apply on LAB terminals.

## Correction

The stylesheet selectors now target the rendered DOM. This restores the KAT reference quick-key panel: fixed left panel, two-column quick keys, correct padding and key sizing. The central sale panel and right keypad retain their existing desktop grid positions.

## Gate

Requires CI, Render deployment and an LAB-POS-01 screenshot comparison against the KAT reference before any transaction test.
