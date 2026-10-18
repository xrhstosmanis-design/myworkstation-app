# Workstream 2 / #2705 - bounded source prepared

Owner: central coordinator codex/central-four-streams-20261018; implementation branch codex/ws2-supplier-orders-20261018. Owner-directed transfer merged before code in #2725/main a756f29bcd6051eeef57ae12ded992b68ff4fec9, exacthead3bbaf0ac CI39134361558 SUCCESS. Prior diagnostics #2716 and all limited PASS preserved.

## Resulting behavior
Adds a separate guarded read-only GET /order-suggestions/by-supplier in one repeatable-read snapshot. Groups candidates by distinct approved invoice documents over a declared historyDays window. Ties, missing or globally capped evidence remain unassigned. Rows preserve existing suggested quantities; candidateSupplierId is a proposal, primarySupplierId remains null, reviewRequired true and automaticTransmission false.

## Local validation
9 local quantity/helper tests passed, 0 failed; isolated PostgreSQL-WASM registered HTTP/guard/SQL5passed including20001evidence overflow and unchanged table digests. Native PostgreSQL fixture skips locally; exact CI execution required.

Node20.20.2. All local fixture effects are isolated; no production/LAB business data, credential/session or protected transaction replay. Full server suite/frontend build are being checked in the central integration workspace; exact remote full CI/native/invariants/HTTP/Chromium/Windows checks remain required before merge. CI alone will remain AWAITING LAB.

## Limits and protected behavior
Document frequency is explicitly APPROVED_DOCUMENT_FREQUENCY_PROXY, not independently verified physical deliveries or final primary supplier. No costs, persistence, order sending, invoice approval, stock or pricing changes. Default flat endpoint untouched; no frontend integration/weekly delivery claimed.

Production remains read-only. No fiscal/financial/stock/shift/payroll/database/backup/settings/mail mutation, manual deploy or schema change. No new LAB/LIVE/USER PASS or manual PASS entry. Full original14 requirements remain OPEN. Shared registry/PDF final receipt will reconcile after exact source CI/release, without overwriting other workstreams.

## Required acceptance
After exact ordinary guarded release: read-only selected LAB scope, matching original source/control and relevant changed display/coverage behavior, no Save/send or business replay. Preserve all prior accepted fixtures. Actual hosted/physical/other-role/mobile acceptance remains NOT TESTED unless separately observed.
