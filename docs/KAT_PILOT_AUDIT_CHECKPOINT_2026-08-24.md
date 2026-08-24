# KAT Pilot Audit Checkpoint — 2026-08-24

Scope: only blockers required for safe KAT pilot: deploy/health, POS regression, stock/preparation/modifiers/audit, online orders, permissions, shifts, backup/recovery and installation readiness.

## Automated coverage already wired into CI

- Server unit/security/licensing suite: `npm test -w server`
- Client build + Prisma generation: `npm run build`
- KAT source invariants: `server/e2e/kat-preparation-source-invariants.mjs`
- Payment/shift flow: `server/e2e/payment-shift-flow.mjs`
- Operator permissions: `server/e2e/live-operator-permissions-flow.mjs`
- Reversal tenant isolation: `server/e2e/reversal-tenant-isolation-flow.mjs`
- Operator ledger visibility: `server/e2e/operator-ledger-visibility-flow.mjs`
- Payment boundaries: `server/e2e/payment-boundaries-flow.mjs`
- Shift close + audit: `server/e2e/operator-shift-close-audit-flow.mjs`
- EFTPOS close flow: `server/e2e/eftpos-shift-close-flow.mjs`
- POS -> shift -> BackOffice: `server/e2e/pos-to-shift-backoffice-flow.mjs`
- KAT POS regression: `server/e2e/kat-pos-regression-flow.mjs`
- Online order -> POS -> sale -> stock: `server/e2e/kat-online-ordering-flow.mjs`
- Milk/preparation stock flow: `server/e2e/kat-preparation-milk-stock-flow.mjs`

## Guardrails

- Do not treat Invoice Learning / Azure tuning as a KAT pilot blocker.
- Do not close a KAT blocker from the printed plan until automated validation is green and, where hardware/real environment is required, the real KAT test passes.
- Hardware-only checks remain manual: RBS receipt, physical EFTPOS, scanner/printer, final store-PC installation.
