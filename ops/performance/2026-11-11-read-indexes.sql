-- MyWorkStation read performance review, 2026-11-11
-- Approval-gated manual migration: NOT called by app startup or deployment.
-- Apply on the existing LAB first and compare EXPLAIN (ANALYZE, BUFFERS).
-- On production, run each statement separately during an approved low-traffic window.
-- CONCURRENTLY must run outside explicit BEGIN/COMMIT transactions.

-- Cloud overview: WHERE storeId = ? ORDER BY createdAt DESC LIMIT 20
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CloudAudit_store_created_idx"
  ON public."CloudAudit" ("storeId", "createdAt" DESC);

-- FTEXT device polling: scope + status + oldest pending request.
-- Speeds PREPARED, REQUIRES_CHECK and DISPATCHED lookups without changing payment logic.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "FtextCashRequest_scope_status_created_idx"
  ON public."FtextCashRequest" ("companyId", "storeId", "terminalPos", "status", "createdAt");
