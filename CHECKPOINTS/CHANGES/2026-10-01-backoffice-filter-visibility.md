# BackOffice column filter visibility

ASSIGNED codex/backoffice-filter-visibility-20261001. Owner authorized 01Oct2026 13:15:55 Athens.

## Evidence before change
User screenshots 13:07/13:09 show 1 visible row with 100 loaded rows and 6623 total items. Owner 13:15 confirms a persisted column filter; screenshot101436 shows normal multiple rows after clearing. Existing row filtering works. Low-contrast yellow icon is USER VISUAL FAIL. Live diagnostic shows normal 100-row first page. No new LAB transaction.

## Bounded change
High-contrast amber background/dark icon/white outline and aria-pressed active state. Table-local summary names active columns and shown/loaded page rows, including zero matches. Clear-all resets only this table's stored column rules, closes popup and reveals current page rows. Summary is outside horizontal scrolling for inventory. Same filtering engine, sort/resize/pagination and APIs preserved. No stock/payment/data mutation, no myDATA draft resurrection; owner withdrew TDA6538 recovery.

## Validation and acceptance
Syntax check PASS; frontend build PASS. PR CI passed on the initial head; rerunning after rebasing over supplier export PR #1578. AWAITING exact deploy / USER acceptance: activate two column filters, see summary/icons/counts, refresh retains rules, clear all restores page rows and remains cleared on reopen. Other tables and column widths stay unchanged. Gate2/Gate8 prior PASS protected; Task21 scope untouched. No new manual PASS claim before acceptance.
