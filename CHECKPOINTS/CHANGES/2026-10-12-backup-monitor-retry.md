## 12/10/2026 — TASK18-MONITOR-RETRY-01 / IMPLEMENTED / AWAITING FULL CI AND LIVE ACCEPTANCE

Same owner `fix/backup-monitor-retry-20261012`; claimPR2345 mergedc8592954 after documentation CI. One causal correction in the cron only: signed STARTED/SUCCEEDED/FAILED delivery retries transient HTTP408/429/5xx and transport failures, at most5 attempts with20s request timeout and2/4/6/8s backoff. One unchanged body/runId/completedAt per event; fresh HMAC timestamp per attempt. Permanent rejection/redirect fails closed. Failed dump is never retried or uploaded; original exit retained. No web runtime or DB/source/query/configuration change. Cron auto-deploy remains its existing ops/backup/** rule; guarded web deployment should skip these cron/workflow/docs-only changes.

Node20.20.2 targeted11/11 PASS: real shell with synthetic command fakes, independent real HMAC verification, failed dump/receiver500→503→200, success503/lostresponse→200, STARTED connection recovery, permanent401, exhausted five failures, redirect denial; existing backup schedule/encryption/dry-run/HeadObject/signature invariants protected. Shell syntax and text whitespace PASS. This is LOCAL/SIMULATED evidence, not real archive/upload/restore or LAB/LIVE PASS. Full CI and exact cron revision pending. Prior live failure at12:00 remains real; no production row edited or manual cron run. Database SIGKILL root cause and capacity remain unresolved under existing independent scopes;256MB DB and OOM hypothesis do not establish causation. Next single action: full CI/merge/exact cron deploy, then observe a new scheduled run and monitor result; real acceptance remains NOT TESTED.

Checkpoint: `CHECKPOINTS/CHANGES/2026-10-12-backup-monitor-retry.md`.

# Task18 — interrupted backup status delivery

## 12/10/2026 13:46 Athens — TASK18-MONITOR-RETRY-01 / ASSIGNED / NEW LIVE FAIL

Owner: Codex — Έλεγχοι Διαδόχου και σέρβερ; branch `fix/backup-monitor-retry-20261012`. Independent bounded Task18 subtask: retry signed monitoring callbacks after transient HTTP/network failures. No takeover of POS-DB-LOCK-01, capacity, database configuration or other pages.

Read-only incident evidence: run `20261012T090019Z-21056` started12:00:19Athens; database io worker SIGKILL12:00:28; pg_dump failed reading DocumentAttachment at12:00:28; FAILED callback returnedHTTP500 at12:00:29; cron exited1. Monitoring row remains STARTED. Latest recorded success09:01:16Athens,178979316bytes,archive TOC PASSED. At13:44:39 database available,10client connections,0lock waiters,0active queries>15s. Database basic_256mb; OOM cause unconfirmed.

Protected behavior: encrypted off-site upload, bucket/versioning/encryption checks, SHA256/size verification, five HeadObject attempts, archive-only pg_restore --list, same runId/upsert, HMAC/replay checks and3-hour schedule. No pg_dump retry, no recovery/restore, data/settings/credential changes, infrastructure purchase, restart or manual cron run. New code NOT IMPLEMENTED / local NOT TESTED / LIVE NOT TESTED. Existing30Sep bounded backup evidence retained; this12Oct new failure supersedes continuing success for this run only. Next action: publish claim to main, then bounded callback correction plus isolated fault tests and full CI before production acceptance.

Checkpoint: `CHECKPOINTS/CHANGES/2026-10-12-backup-monitor-retry.md`.

