# N10 — Workforce payroll LAB acceptance continuation

**Date:** 07/10/2026 12:28 Europe/Athens  
**Owner:** same N10 page and owner; continuation branch `codex/n10-payroll-reconciliation-20261007` from main `ac4b8bb4fb8995b54e3ed870329d06af2f192e0f`.  
**Status:** ASSIGNED · prior LAB PASS preserved · additional acceptance OPEN.  
**Purpose:** perform explicitly authorized fictional tests in MYWORKSTATION LAB only. This claim records the scope before state-changing LAB work; it does not claim a new PASS.

## Protected existing payroll state — do not repeat

- September 2026: CLOSED, 7 employees, gross/paid **€313.00**, balance **€0.00**. Existing cash allocations **€20.00 + €100.00** and internal bank allocation **€173.33** are final historical test actions. Do not replay, recalculate, reopen, re-approve attendance, lock again, or alter that period.
- October 2026: existing DRAFT, 7 employees, gross/paid **€13.67**, balance **€0.00**. Do not create a second payment or duplicate expense.
- The prior checkpoint `CHECKPOINTS/CHANGES/2026-09-26-workforce-payroll-lab-period-load.md` and in-program guide evidence remain authoritative for that bounded flow.

## Read-only LAB baseline — 07/10/2026

Authenticated Platform Admin account selected **MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ** before opening Workforce. Payroll view showed 7 employees, 2 payroll rules and 3 shift templates. November 2026 calculation preview showed 7 employees and **€0.00**; no November period was created.

The bank ledger filtered to this LAB showed four existing pending/no-proof movements: September **−€5.00** (`ac83c6d3-7956-4f0b-b5cc-a2b9941d4b61`), **−€14.67** (`90c0f31b-6828-41c9-a76e-a29ed6721d5c`), **−€173.33** (`ebcc0036-5fa4-47d8-aae0-ec348353c0a3`), and October **−€13.67** (`a2a58e32-ad12-409a-8486-daf3e84b7cdb`). The ledger summary showed four pending entries totaling **−€206.67**. These are internal LAB records; no external bank transfer is evidenced.

The September cash audit showed three shifts on 26/09 with displayed deficit/surplus/net and POS–EFTPOS totals at €0 and zero receipts. Payroll Audit rows showed the existing €20, €100 and €173.33 actions, but did not expose their distinct cash `StoreTransaction` IDs. This is not an independent reconciliation of the payroll cash to a particular shift. The existing September bank entries have no proof. Do not claim either gap is resolved.

A separate October `Λοιπό έξοδο` of **−€13.67** is distinct from the existing October payroll movement; leave it untouched. The synthetic receipt reference below does not establish a real payment.

## Authorized bounded tests after this claim merges with green CI

1. **Synthetic attachment/match fixture only:** if the LAB ledger offers an attachment/match workflow for the exact existing October movement `a2a58e32-ad12-409a-8486-daf3e84b7cdb`, use only the clearly stamped `SYNTHETIC LAB TEST ONLY — NOT A REAL BANK RECEIPT — NO MONEY MOVED` PDF `N10_LAB_UAT_receipt_20261007_a2a58e32.pdf`, reference `N10-LAB-UAT-OCT-2026-01`, amount €13.67. Treat it as a test fixture, never as accounting proof. Observe any automatic comparison. Do not confirm, reconcile, settle, pay, or change the September entries. If the interface would represent the attachment as genuine proof or automatically settle the row, stop before submission.
2. **Future-month rule preview only:** test uniquely tagged `N10-QA-202611-*` employees/rules in LAB using November 2026 dates and preview only. Proposed fictional inputs, subject to matching the visible UI fields: hourly €10.00; 7h30m actual → expected €75.00; an approved 9h hourly case → base €90.00 (approval boundary only, no overtime premium claim); daily €60.00 across two distinct Athens dates with a duplicate attendance row on one date; fixed monthly €1,200.00 with no attendance. Record exact employee/rule/attendance IDs, timestamps, initial and final counts, preview rows and calculated values. Create no November payroll period, payment, bank/cash entry, or close. Do not edit existing employees, attendance, shifts, rules, or rates.
3. Inspect the displayed planned/actual time and any late, early, absence and paid-leave inputs only if visible. Do not invent deduction, overtime-premium, absence, or leave-compensation policy. Those calculations stay NOT TESTED unless an existing documented rule is available and directly observed.
4. Deactivate only the uniquely tagged test employees after readback if the UI supports reversible deactivation; record before/after and preserve their audit history. If deactivation would delete data or is irreversible, leave the records and document why.
5. No action in a real store; no new or repeated payroll disbursement; no September modification.

For each state-changing LAB action, record the exact store, authenticated role/operator, selected test period, object identity, action, timestamp, relevant before/after values and resulting IDs. A state change without a measured baseline is NOT TESTED.

## Acceptance and open items

A bounded rule-preview PASS requires visible LAB identity, unique test IDs, correct preview values for each supported rule and a clean readback; it does not certify payroll legality, a real bank transfer, a real store, the missing September cash transaction IDs, or proof for any bank entry. Full N10 remains **ΜΕΡΙΚΟ PASS / OPEN** until every assigned acceptance item has direct evidence. No in-chat credential or OTP is permitted.

**Current deployed revision:** not independently captured in this read-only session.  
**Next action:** after this exact assignment/checkpoint is merged, perform the synthetic attachment/match test only if the visible workflow preserves pending/no-settlement status; then perform isolated November rule previews with fresh per-action baselines.


## Read-only follow-up — 07/10/2026 14:11 Europe/Athens

- The correct entry URL, `/platform-admin`, was visibly confirmed. The authenticated Platform Admin view showed **MYWORKSTATION LAB** and **ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ** before entering its support Backoffice.
- The test-store employee list showed **8 existing employees**, versus 7 in the 12:28 checkpoint baseline. No existing employee was edited and no new employee, payroll rule, attendance row, payroll period, payment, bank entry, or cash entry was created.
- In the visible Backoffice, **Μισθοδοσία** opened a general expense-entry form (amount, payment source, reason, and “Καταχώριση”), not a payroll preview. It was canceled without submission. The employee creation form exposed identity, position, contact, store, employment type, and weekly contract hours, but no payroll-rate field; it was canceled. The viewed shift-rule panel contained shift eligibility/weekly-target controls only and was canceled without saving. **Παρουσίες & Ώρες** stated that integration with actual hours, POS, and published schedule is still continuing; no November payroll-preview control was visible.
- The schedule view initially selected the other LAB store and showed September dates; it was left unchanged. September payroll remained untouched.
- No November preview was performed and no November period or financial record was created. The authorized synthetic rule-preview acceptance remains **NOT TESTED / OPEN** until the correct payroll-preview surface is available. Full N10 remains **ΜΕΡΙΚΟ PASS / OPEN**; the missing bank proofs and exact cash `StoreTransaction` IDs remain unresolved.

**Next action:** locate the documented payroll preview surface in the authenticated Platform Admin/LAB workflow. If none is available, record the UI limitation as BLOCKED/NOT TESTED and do not substitute the expense-entry form.
