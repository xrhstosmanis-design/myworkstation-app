# No5 — preserve current monthly counters and delegated reads

Integrates main42601f02635cb4d0e65c9b6bd2b8025322f7266c: peer No2 posted projection and monthly counter drill-down plus documentation/installed partial acceptance receipts. Preserve all peer claims and actual partial results without converting them to No5 acceptance.

Resolve the shared MonthlyInvoiceAuditPanel and monthly-invoice-audit core conflicts. The canonical read-only core retains peer invoice posting normalization/provenance, full-month financial/global counters, allowlisted filtered-before-pagination items and filter-bound cursors. The genuine delegated wrapper retains account/company/store/module/source restrictions and fresh pre/post-snapshot grant checks, with no Owner impersonation. Unknown filters fail before transaction. Native filter query travels through the same independently granted monthly-invoice-audit.read route.

The UI retains exact server filter echo/matchedRecords checks, selected month/store/API serial/abort fencing and peer count buttons. Delegated identity additionally validates companyId/storeId and clears old results before reload; preview email remains hidden and uncallable. A new actual mounted delegated test opens the named counter, checks the scoped filter GET, verifies active filter state and rejects a wrong filter echo without a secondary email/payment request. No additional permission or writer was added.

Affected server85/85PASS. Native peer UI, delegated extra views and warehouse filter cohort44/44PASS; real Chromium was explicitly excluded locally and remains a CI responsibility. Production client build26.45sPASS. No source-bound47 dependency changed in this merge; observer SQL rebind from the preceding fix remains the only new binding. Packet verifier PASS. Exact-head actual Current PostgreSQL/private backup/restore/install still mandatory, because local Unix-socket policy blocks the private restore cluster.

No production merge/deploy/configuration/financial/provider/email action or human login. No5 remains OPEN; all human checks remain one shared existing LAB session at the end. New shared notes belong in Continuation02.
