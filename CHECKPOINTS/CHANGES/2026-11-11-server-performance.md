# SERVER-PERFORMANCE-01 — 2026-11-11

- Owner: κεντρικός συντονιστής. Draft PR: #3827.
- Scope: (1) reduce expected closed-store HTTP 503 polling in the active Store Online Orders V2 UI; (2) propose non-automatic read indexes for CloudAudit and FTEXT; (3) collect fixed-label latency and HTTP status aggregates without request data.
- Baseline (read-only production): CloudAudit 20 rows after 47,661 filtered in one 9.57 ms sample; FTEXT error-evidence lookup filtered 3,455 rows in one 68.6 ms sample. These are single samples, not guaranteed overall latency.
- Changes: `client/src/components/store/StoreOnlineOrdersV2.jsx` and `client/src/utils/online-orders-poll.mjs` (60s expected-503 backoff, manual refresh immediate); `server/src/request-latency-monitor.js` and `server/src/index.js` (bounded per-minute diagnostics, suppression of only known expected 503 stack traces); `ops/performance/2026-11-11-read-indexes.sql` (manual index candidates); `server/test/server-performance-monitor.test.js` (focused regression tests).
- CI: pending exact-head validation. LAB: **NOT TESTED**. New indexes: **NOT APPLIED**. Production service/database: **UNCHANGED**.
- Next: full CI, existing LAB closed/reopen + active order acceptance, confirm stable POS checkout and FTEXT, benchmark LAB index plans, then request explicit approval separately before merge or production SQL.
