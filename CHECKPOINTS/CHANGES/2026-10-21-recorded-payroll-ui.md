# Recorded expenses / linked payroll UI and CSV

## 21/10/2026 — CENTRAL-RECORDED-PAYROLL-UI-01 / ASSIGNED BEFORE SOURCE / NOT TESTED

Retained central coordinator codex/central-four-streams-20261018, #2706/#2527; source branch codex/recorded-payroll-ui-20261021. Baseline main a70ea46be258feb8a584e59c8a139c9c4f63477b. Continuation of installed backend#2976/c444cba8 and receipt#2979; receipt mainCI39627120044 now completed SUCCESS, no rerun. Existing central sales V4 ownership from#2725 and2026-10-19-central-sales-comparison.md retained. Green reviewed merge of this claim is required BEFORE any source/test edit.

Exact six source/test paths ONLY:
- client/src/components/commerce/installKioskReportsSalesV4.js (root integration only).
- NEW client/src/components/commerce/recordedPayrollExpenseView.js.
- NEW client/src/components/commerce/recordedPayrollExpenseDialog.js.
- NEW server/test/recorded-payroll-expense-ui.test.js.
- NEW server/test/recorded-payroll-expense-consumer.test.js.
- NEW server/test/recorded-payroll-expense-consumer-postgres.test.js.

Bounded read-only normal sales-report entry opens native dialog inside current report root, with explicit locked selected store, separate ended Athens calendar dates, search,100-row pagination and separate all-applied-rows CSV. No automatic report fetch before explicit search. Strict producer DTO/period/coverage/cent arithmetic/attribution validation, immutable applied snapshot, current root/hub/store/token fences, stale cancellation and no export after draft/context changes. Existing default sales/hourly/comparison/drill/CSV behavior and all accepted PASS protected. Visible LINKED_ONLY and recorded-ledger-not-settlement limits; unattributed expenses may include payroll, signed refunds retained, accrual/standalone Workforce excluded, incomplete10000row cap suppresses full totals. Formula-safe BOM/semicolon CSV carries same source, company/store, exact period/asOf/coverage and uncertainty. No new auth policy or JWT decoding; server authorization remains authoritative, response company scope displayed.

No backend/router/schema/index/auth/module/financial/payroll writer changes. N10 reconciliation, all supplier/VOICE/native/POS layout owners retained, including KAT#2982. Cash dispatch remains OFF; production contract#2704comment6318978275 awaits retained AUTO-REPORTS/mail/schema/lifecycle/backup agreement. No SMTP/recipient/scheduler activation, production data write, business transaction or accepted LAB replay.

Required new isolated verification: pure malformed/overflow/formula/signed/date cases, mounted actual installer/dialog lifecycle and stale cross-store/token/tab cases, actual native producer JSON->consumer->CSV, old sales regression, desktop/mobile layout, independent review and all required PR/exact-main CI. Ordinary guarded exact deployment and independent health required before user test. CI/local/native tests are not LAB/USER PASS. Selected-LAB real-source/role/module/mobile acceptance remains OPEN until observed by user; no manual PASS or whole Task12/four-stream completion.

Root exclusively owns shared registries/checkpoint/scoped regenerated tracker PDF. Checkpoint CHECKPOINTS/CHANGES/2026-10-21-recorded-payroll-ui.md; evidence CHECKPOINTS/EVIDENCE/recorded-payroll-ui-20261021/. Central ownership retained through completion or named handoff. Single next action after green merged claim: implement exactly six paths in isolation through verified release, then one final user acceptance batch.

