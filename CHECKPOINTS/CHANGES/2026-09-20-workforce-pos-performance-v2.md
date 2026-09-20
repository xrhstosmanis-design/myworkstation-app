# 2026-09-20 — Workforce POS Performance v2 — AWAITING LAB

Employee performance now uses the authoritative identity chain WorkforceEmployee.id → StoreOperatorCredential.employeeId → StoreOperatorCredential.id/operatorId → CashShiftSession.openedBy → StoreTransaction.sessionId. No name matching. The card exposes 30-day cashier shifts, transaction count, cash/card sales, closing variance, reversed transactions and recent shift evidence. Human evaluation remains separate from measured facts; no automatic score.

Next after CI/LAB: drill-down transaction types (discount/void/return), evaluation records, then conversational AI scheduler/publish.
