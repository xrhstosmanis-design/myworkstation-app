# Render bandwidth investigation — 4 November 2026

Status: READ-ONLY EVIDENCE / ROOT CAUSE ATTRIBUTION INCOMPLETE / NO RUNTIME FIX.

## Observed evidence
Workspace and five services were inspected read-only. Production PostgreSQL compute upgrade PR #3629 is merged and completed; do not repeat. PR #3485 is an existing merged provider billing audit, not a bandwidth optimization. PR #3603 is merged remote support work; no causal bandwidth attribution is established.

Render bandwidth_usage for production app srv-d9isenfavr4c73bdh52g returned unit "mb" and hourly samples, despite resolution=86400. Sum for returned timestamps 2026-11-01 00:00 through 2026-11-04 16:00 UTC: 6022.0092951 reported MB. October query 2026-10-06 00:00 through 2026-11-01 00:00 UTC returned 625 samples totalling 25910.9130594 reported MB; this is not the complete invoice period. Do not silently equate reported MB with decimal GB, or these sums with workspace billing. Boundary/in-progress buckets and metric semantics require reconciliation.

The POS UI LAB and wholesale LAB returned approximately 0.000230 and 0.000478 MB respectively for November. KAT test returned no samples (not proof of zero). Backup cron bandwidth endpoint returned 404 (not zero). Production request log retrieval returned 503, so endpoint byte attribution is unavailable.

Backup completed logs queried 2026-11-01 00:00 to 2026-11-04 16:00 UTC returned 27 successful archives, total 10711760582 bytes, hasMore=false. The subset completed before 2026-11-03 12:13 UTC totals 7159039704 bytes. Archive bytes are measured application upload payload, not independently verified billable workspace egress, and must not be added blindly to service metric totals.

Source ops/backup/run-jobs.sh invokes full backups at eight UTC slots daily. The five-minute cron also runs lifecycle jobs; it does not dump every five minutes. ops/backup/run-backup.sh uses pg_dump custom format compression level 6, then aws s3 cp with size verification and TOC inspection. Successful archive sizes in this sample range from 351651522 to 471850376 bytes. External backup uploads are an evidenced substantial transfer category; complete invoice attribution and private-network database connection selection remain unverified. Preserve frequency, retention, encryption, versioning, monitor and restore safeguards.

server/src/index.js uses express.static(dist). server/package.json contains no compression dependency. This alone does not establish uncompressed on-wire responses (proxy behavior and actual headers remain unmeasured). Authenticated response caching or broad compression is not approved by this finding.

## Blocking evidence and next work
GitHub fetch_file returned empty content with blob SHAs for OPEN_WORK_TRACKER.md, KAT_ACTIVE_LIST_2026-09-05.md and PENDING_WORK.md, including bounded and base64 retries. Git mirror clone failed for lack of authentication. AGENTS.md requires those records and applicable checkpoints before source changes; no runtime code, configuration or state-changing LAB was altered and no existing owner claim was replaced.

Next: restore readable access to the three shared records and relevant checkpoints; reconcile native workspace service/cron billing with these measured categories; retrieve endpoint response-byte distributions and request counts without recording customer content or credentials. Verify exact live source before selecting one causal optimization.

Candidate experiments only after that gate: compare backup compression alternatives on an isolated existing/synthetic archive with restore verification, preserving all backup slots; measure build-hashed static asset repeat downloads before considering cache headers limited to verified fingerprinted public assets; measure API/remote frame bytes separately before changing transport. No numerical savings is claimed without those comparisons. At current observed archive sizes eight full uploads represent approximately 2.81–3.77 decimal GB/day of payload if every slot succeeds. This explains why a 5 GB allowance can be crossed rapidly, but is not full workspace invoice reconciliation.

No production deploy, restart, tier, limits, credentials, database, backup schedule, security control or business action changed. No LAB/LIVE/USER PASS, root-cause closure, current-month charge or central publication completion claimed. This draft is an evidence handoff only.
