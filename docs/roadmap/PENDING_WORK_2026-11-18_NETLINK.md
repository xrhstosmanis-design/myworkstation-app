## 18/11/2026 — NETLINK-STORE-CREDENTIALS-01 — ASSIGNED / NOT TESTED

Owner /root, branch `codex/netlink-store-credentials-20261118`. Explicit owner request: implement separate Netlink connection credentials for each selected store, with safe configuration and a non-issuing connection check. Scope does not transfer provider certification, cash reconciliation or another page's work.

Read-only baseline main `31c8c46a221fc465d02c9fb55378d0d11497a690`: NetlinkStoreConfig contains POS product/fee mapping only; client singleton uses global environment credentials. No per-store credential form or provider identity/report verification exists. Existing reports read MyWorkStation's ledger, not a provider statement. Existing Netlink checkpoint and current tracker show provider certification/production acceptance BLOCKED EXTERNAL; no new LAB PASS.

Bounded implementation: encrypted store-bound username/password/Station ID in a versioned migration; Platform Super Admin form within existing selected-store integrations; scoped provider resolution with no global credential fallback for scoped calls; selected-store status/menu requests; safe authentication/catalogue check. Provider report API contract is not present in the repository, so catalogue authentication must not be described as provider-store identity verification. No invented report endpoint, card issuance or charges during checks.

Preserve existing licensing/authentication, demo outbound block, fiscal receipt gates, execute lock, POS product/service mapping, commission, idempotency and all old LAB PASS. Save/disable and check require authorized company/store context; secrets never returned. No production migration, configuration, credentials, transaction, merge/deploy of source or actual store check authorized by this documentation claim.

Acceptance: isolated crypto/storage isolation and HTTP route tests; cross-company/store/operator denials; fresh connection after credential replacement/disable; no token reuse across tenants; UI store-change stale-response protection and build; full exact-head CI. Existing shared LAB and physical provider/store checks remain NOT TESTED until observed. Final user tests are grouped at the end.

This small continuation preserves the oversized historical tracker/roadmap unchanged. Prior tracker: [OPEN_WORK_TRACKER.md](OPEN_WORK_TRACKER.md). Prior roadmap: [PENDING_WORK.md](PENDING_WORK.md). Companion checkpoint: `CHECKPOINTS/CHANGES/2026-11-18-netlink-store-credentials.md`.
