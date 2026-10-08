# Single validated production deployment — bounded lifecycle gating

## 2026-10-08T19:44:17.466089+00:00 — POS-DB-LOCK-01 / ASSIGNED / single validated deployment path

Retained owner codex/pos-startup-loading-20261008; bounded source codex/pos-single-deploy-20261008. Owner «synexise» authorizes the next recorded lifecycle task. Baseline main a65bb0881d2aba0c37c088340393b5c16f26ae90; read-only health HTTP200/ok=true/exact a65bb088. Actual Render service srv-d9isenfavr4c73bdh52g has autoDeploy=yes despite render.yaml off. Shutdown source2281986 has two observed deploys: dep-db3uq6ojo6nc73bhp5g0/new_commit and dep-db3urag89gic73agm7s0/deploy_hook; latest docs-only a65bb088 also deployed/new_commit. This is duplicate deployment evidence, not a new physical LAB failure or capacity measurement.

Claim only deployment gating: pin the existing hook to the exact successful main CI revision, issue one non-retried POST, serialize triggered deployments without cancelling an in-progress verification, prevent stale/rerun deployments, preserve pre-deploy healthy rollback artifact and exact-revision health verification. Render official deploys/deploy-hooks documentation states a hook with ref=commitSHA disables automatic deploys; verify actual service becomes off after the first pinned hook. First transition may still have an already-triggered automatic deploy; no claim of retroactive suppression. No new credentials, paid plan/instance, production SQL/cancellation, start command, seed, schema, application/business/auth/stock/fiscal change.

Protected: single-search USER PASS21:00:41/manual/PR1918, isolated catalog/hot-column/shutdown CI evidence, financial/stock/PIN/session and other page owners. Analytics bounded USER PASS22:30/PR1931 preserved. Deployment-policy acceptance NOT TESTED until exact CI/release, actual Render off and a later docs-only merge without new_commit deploy; manual remains unchanged for CI-only behavior. Measured20→50→100-store/failover/restore, other DDL and active-business shutdown remain OPEN.

Single next action: publish this claim with green CI/main before editing workflow or deployment configuration, then implement isolated hook/stale-run regressions and verify the actual release. No named handoff; incident owner retained. Checkpoint CHECKPOINTS/CHANGES/2026-10-08-pos-single-deployment.md.

Official references: https://render.com/docs/deploys and https://render.com/docs/deploy-hooks. Current GitHub workflow posts an unpinned hook with three retries and cancels in-progress runs. Existing full CI and rollback guards remain mandatory.
