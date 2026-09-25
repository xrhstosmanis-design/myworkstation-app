# Render startup failure — Workforce payroll (26/09/2026)

## Evidence before change

- Render deploys for #1313, #1314 and #1315 failed. Latest merge `158806f` showed Prisma `P2010` / PostgreSQL `42P01`: `relation "WorkforcePayrollLine" does not exist`, at `server/src/ensure-workforce-v2-schema.js:90`.
- Live `/api/health` returned revision `b9ddca396af0caae744820e4268bddbcfce718bb`, the pre-assistant backup. Thus invoice assistant and ΕΦΚ changes were not live.
- Workforce payroll checkpoint `2026-09-25-workforce-payroll-hardening.md`: targeted tests 16/16 PASS; runtime payroll/LAB still NOT TESTED. Gate 3 invoice assistant LAB is also NOT TESTED.
- `render.yaml` specifies `prisma:push`, but the observed startup reached the additive Workforce schema script with its payroll table absent. Do not assume the configured Render command matches that file; inspect the actual deployment separately.

## Bounded change — PR #1316

The existing additive startup script now creates the four Prisma payroll tables when absent, before its ALTER/INDEX statements: WorkforcePayrollPeriod, WorkforcePayrollLine, WorkforceEmployeePayment and WorkforcePayrollClosing. It creates required keys, relations and indexes. `IF NOT EXISTS` preserves existing tables and rows. No payroll calculations, invoice handling, payments, stock, finalization, legacy tables or authorization are changed.

## Verification and acceptance

- Local syntax: `node --check server/src/ensure-workforce-v2-schema.js` PASS.
- Full CI #3337 pending at initial checkpoint. No isolated database execution has been performed; database compatibility remains to be verified in Render.
- Required sequence: green CI, merge, successful Render deployment, exact `/api/health.revision` matching the merged commit, then one genuinely new POS invoice in LAB with original photos and measured before/after state. Review all printed rows, ΕΦΚ, VAT and total with 0.05 € tolerance, and verify no extra payment/stock movement. Gate 3 stays OPEN until recorded real evidence.
