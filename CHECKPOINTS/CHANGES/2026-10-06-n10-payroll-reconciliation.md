# N10 — Workforce payroll reconciliation handoff

**Date:** 06/10/2026 23:48:33 Europe/Athens  
**Owner:** `codex/n10-payroll-reconciliation-20261006`  
**Takeover:** Explicit owner instruction in this conversation; transferred from `agent/workforce-payroll-20260925`.  
**Status:** ASSIGNED · existing LAB PASS evidence preserved · remaining scope OPEN · current browser read BLOCKED.

## Existing verified LAB evidence — do not repeat

The September 2026 payroll period is already CLOSED for seven employees with gross/paid total **€313.00** and balance **€0.00**. The period was recalculated and settled once through the virtual LAB flow: partial and final cash allocations of **€20.00 + €100.00** to `LAB-POS-02`, plus an internal bank allocation of **€173.33**. The in-program payroll guide was verified. The deployed checkpoint is `CHECKPOINTS/CHANGES/2026-09-26-workforce-payroll-lab-period-load.md`.

The same checkpoint says the cash-shift opening/closing balance and distinct `StoreTransaction` IDs for the cash payments were not measured. The bank table showed **€5.00**, **€14.67**, and **€173.33** internal LAB entries without proof; no external bank transfer occurred. These gaps do not authorize another payment or replay.

## Takeover scope and guardrails

1. Read the existing September records only and independently reconcile the two cash payments against the `LAB-POS-02` cash-shift ledger, then read back the existing bank entries and available proof/status.
2. Preserve the closed period, all payments, attendance, shifts and Audit history. Do not repeat a payment, recalculate, reopen, approve attendance, lock again, or attach proof unless the existing record and matching evidence support that exact action.
3. After the reconciliation, identify only the uncovered payroll-rule cases. Any new fictional LAB test requires a separate baseline and transaction identity; no duplicate, external transfer, or real-store write.
4. Real-store acceptance and any missing bank proof remain separate requirements. Mark them `NOT TESTED` until directly evidenced.

## Current blocker

The browser runtime refuses to resume because native credential state cannot be safely observed, and a new Platform Admin tab also returns the same guard. No authenticated payroll page was read in this takeover; no LAB action or payment was executed. Do not use a lower-level browser/network route to bypass the credential guard.

**Next single action:** restore an observable authenticated Platform Admin browser session, then perform read-only inspection of the existing closed period, cash-shift transactions/balances and bank records. Record exact IDs and before/after evidence before deciding whether any further isolated LAB test is necessary.
