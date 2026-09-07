# LAB POS runtime aligned with KAT

Date: 2026-09-07

## Change

- Store Mode CommercialPosApp now delegates to StoreOperatorApp, the same runtime used by KAT.
- The former generic numeric-keypad runtime is retained only as an internal legacy component and is no longer mounted live.

## Operating model

- Terminal binding comes from the device activation token; it is not a permanent operator assignment.
- An operator can use any terminal after login, but an open shift remains locked to its terminal.
- Inventory, turnover, store cash and BackOffice events remain store-scoped; shift sessions and variance remain terminal-scoped.

## Verification gate

- Requires green CI, main merge, successful Render deployment, then LAB-POS-01 verification before any cash/payment test.
