# Workstream 1 / #2704 - bounded source prepared

Owner: central coordinator codex/central-four-streams-20261018; implementation branch codex/ws1-cash-20261018. Owner-directed transfer merged before code in #2725/main a756f29bcd6051eeef57ae12ded992b68ff4fec9, exacthead3bbaf0ac CI39134361558 SUCCESS. Prior diagnostics #2716 and all limited PASS preserved.

## Resulting behavior
Preview responses now explicitly label sourceReadiness READY/HOLD separately from financialFinality PROVISIONAL and financialReconciliationComplete false. Three stable scope limitations remain explicit. UI always displays provisional financial scope, including legacy/misleading metadata; no claim about independent external reconciliation.

## Local validation
23 focused local tests passed, 0 failed; 2 native PostgreSQL infrastructure skips. The combined four-stream focused run has57passed/0failed/4infrastructure skips.

Node20.20.2. All local fixture effects are isolated; no production/LAB business data, credential/session or protected transaction replay. Full server suite/frontend build are being checked in the central integration workspace; exact remote full CI/native/invariants/HTTP/Chromium/Windows checks remain required before merge. CI alone will remain AWAITING LAB.

## Limits and protected behavior
Existing amounts, original employee differences, groups, business day/week, HOLD, settings/save and mail remain unchanged. No scheduling/outbox/SMTP activation. Actual native and hosted UI acceptance pending.

Production remains read-only. No fiscal/financial/stock/shift/payroll/database/backup/settings/mail mutation, manual deploy or schema change. No new LAB/LIVE/USER PASS or manual PASS entry. Full original14 requirements remain OPEN. Shared registry/PDF final receipt will reconcile after exact source CI/release, without overwriting other workstreams.

## Required acceptance
After exact ordinary guarded release: read-only selected LAB scope, matching original source/control and relevant changed display/coverage behavior, no Save/send or business replay. Preserve all prior accepted fixtures. Actual hosted/physical/other-role/mobile acceptance remains NOT TESTED unless separately observed.
