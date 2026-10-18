# Workstream 3 / #2706 - bounded source prepared

Owner: central coordinator codex/central-four-streams-20261018; implementation branch codex/ws3-sales-counts-20261018. Owner-directed transfer merged before code in #2725/main a756f29bcd6051eeef57ae12ded992b68ff4fec9, exacthead3bbaf0ac CI39134361558 SUCCESS. Prior diagnostics #2716 and all limited PASS preserved.

## Resulting behavior
Canonical product sales reader computes overall normal/reversal basket counts from the full filtered base in the same SQL snapshot. Per-product appearance counts and numeric monetary aggregates remain compatible. Adds strict sourceCoverage including returned/total group counts, limit and COMPLETE_SOURCE versus RETURNED_GROUPS. Empty-source sentinel handled explicitly.

## Local validation
5 local unit tests passed. Actual canonical SQL PostgreSQL-WASM regression passed for multi-product normal/reversal baskets, filters, empty source,10001capped groups and10000exact completeness. Native PostgreSQL fixture skips locally; exact CI required.

Node20.20.2. All local fixture effects are isolated; no production/LAB business data, credential/session or protected transaction replay. Full server suite/frontend build are being checked in the central integration workspace; exact remote full CI/native/invariants/HTTP/Chromium/Windows checks remain required before merge. CI alone will remain AWAITING LAB.

## Limits and protected behavior
Monetary totals remain sums of returned groups and are explicitly partial beyond10000groups. Existing normal report UI has not been expanded to consume coverage; assistant consumer is separate WS4. No hourly staffing/turnover guidance completion, payroll/shift changes, schema or source mutations.

Production remains read-only. No fiscal/financial/stock/shift/payroll/database/backup/settings/mail mutation, manual deploy or schema change. No new LAB/LIVE/USER PASS or manual PASS entry. Full original14 requirements remain OPEN. Shared registry/PDF final receipt will reconcile after exact source CI/release, without overwriting other workstreams.

## Required acceptance
After exact ordinary guarded release: read-only selected LAB scope, matching original source/control and relevant changed display/coverage behavior, no Save/send or business replay. Preserve all prior accepted fixtures. Actual hosted/physical/other-role/mobile acceptance remains NOT TESTED unless separately observed.
