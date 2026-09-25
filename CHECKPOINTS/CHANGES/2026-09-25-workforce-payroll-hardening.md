# Workforce Payroll hardening — 2026-09-25

## Scope

- Branch: `agent/workforce-payroll-20260925`
- Gate 3, Gate 6 and locked PASS Gates 7–8 remain untouched.
- This checkpoint covers the first server-side payroll correctness and access pass.

## Findings fixed

1. Payroll queried only attendance status `COMPLETED`, although Workforce attendance closes valid sessions as `CLOSED` and approved overtime sessions as `APPROVED`.
2. The payroll router inherited only the Basic Workforce guard and did not enforce the independent `PERSONNEL_PAYROLL` entitlement.
3. A payment could target an employee with no line in the selected payroll period.
4. Multiple payments could exceed the employee's gross payroll amount.
5. Payment creation did not synchronise the line paid/balance values and did not create a Workforce audit event.

## Result

- Payroll now consumes `CLOSED`, `APPROVED`, and legacy `COMPLETED` attendance.
- Every payroll endpoint requires the Payroll package (Super Admin bypass remains unchanged).
- Payments are period-line scoped, transactional, overpayment-safe, update paid/balance amounts, and write an audit event.
- Partial and final payments are supported; zero, invalid, and excessive payments are rejected.
- Added a first-class daily-rate payment type. Payroll counts distinct worked dates in `Europe/Athens`, so a split shift on the same calendar day is paid as one daily wage.
- Employee create/edit/preview and payroll period lines now preserve the daily rate explicitly; hourly and fixed-monthly calculations remain unchanged.
- Payroll periods now include every active employee assigned to the store, including fixed-monthly employees with no attendance row.
- Published/approved/locked schedule assignments populate planned minutes, including overnight shifts.
- Approved absences populate absence minutes; approved leave is clipped to the payroll period and preserved by days/type in the immutable calculation evidence. Leave does not silently create hourly pay without an explicit paid-leave policy.
- Period closing now requires explicit confirmation/reason, zero employee balances, and no open/unreviewed attendance.
- Closing and payment take the same database row lock, preventing a payment from racing the final snapshot.
- A successful close stores immutable lines, payments and totals in `WorkforcePayrollClosing`, changes the period to `CLOSED`, blocks further payments and writes a Workforce audit event.
- Employee payments now use the existing economic ledgers: cash requires one selected open `CashShiftSession` and creates a deductible `StoreTransaction`; bank transfer/company card create the same expense plus a linked negative `BankLedgerEntry` awaiting proof.
- `WorkforceEmployeePayment.sourceId` points to the exact store transaction and a unique request key makes retries/double clicks return the original payment without a second cash/bank movement.
- Workforce V2 now exposes one responsive `Μισθοδοσία` workspace with a four-step flow: monthly preview, draft period, employee payments and immutable close.
- The workspace shows planned/actual/absence minutes, gross/paid/balance totals, supports bank transfer, corporate card or a specifically selected open cash shift, and makes closed periods visibly read-only.

## Verification

- `node --test test/workforce-v2-payroll.test.js test/personnel-package-foundation-v2.test.js test/workforce-v2-payroll-ui.test.js`
- Result after the complete UI and ledger linkage: **16 passed, 0 failed**.
- `git diff --check`: **PASS**.
- The repository-wide test command cannot complete in this checkout because runtime dependencies (`express`, `@prisma/client`) are not installed. This is recorded as an environment limitation, not counted as product PASS.

## Remaining before final PASS

- Final runtime/LAB acceptance of the new payroll workspace.
- Full and partial payment end-to-end tests against a runtime database.
