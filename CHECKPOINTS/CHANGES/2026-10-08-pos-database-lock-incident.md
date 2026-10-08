# POS database lock incident — bounded operational diagnosis

## POS-DB-LOCK-01 — ASSIGNED / lock chain absent / AWAITING USER TIMING

2026-10-08T19:54:49+03:00. Fresh read-only database snapshots now show all three previously identified backends3137180/3137463/3137534 absent, followed by9 idle ClientRead connections and no active/Lock row in the aggregate. At19:49 the same root was still835seconds old; at19:52–19:53 it was gone. Render independently records guarded same-SHA deployment update_failed at16:51:09Z and queued automatic deployment starting16:51:10Z; this temporal association does not establish the exact connection-disconnect mechanism. No administrator SQL cancellation, database restart, credential/configuration/source change or manual deploy was executed by this page or evidenced by the user's screenshots. The prepared cancellation is now historical/NOT EXECUTED and must not be run against vanished/reused PIDs. User screens165058/165123/165234 only show Render Overview → web service → correct database Info/Available/storage42.92%; no restart/restore/delete control pressed is inferred.

Fresh Work-network health200/ok=true/exact1cd34448aad6343be33c3757ab8aaf883f4d4050, TTFB5.506s,total5.551s. New automatic deployment90b86d20685c96a3dba2e99a9145ddf0c4b996d9 still update_in_progress in this snapshot; existing live source retains no-print and bulk-scroll changes. Lock-chain absence/health are diagnostic observations, not authenticated POS/session response or physical loading USER/LAB PASS. Reported36seconds, OFFLINE fallback and auth503 have no measured successful user retest yet; whole incident remains OPEN. Read-only connector cancellation blocker is superseded for the vanished reader only. Prior incident PR1906/head a1613fa8f9242bde215b70d43b528f214020335b/docsCI37811701410 SUCCESS/merge90b86d20685c96a3dba2e99a9145ddf0c4b996d9 preserved.

Single next action: after current application deployment settles, measure one empty-cart refresh at LAB and Diadoxou and report seconds/absence or presence of OFFLINE/auth error, without submitting/replaying any existing cart or financial action. Owner codex/pos-startup-loading-20261008 retained for this central availability incident. Preventing recurrence is not implemented: abandoned-reader lifetime, shutdown/runtimeDDL and duplicate automatic+guarded deploy behavior need a separately bounded causal correction after this recovery observation. POS-CATALOG-PERF-01/client resolver owner and all existing PASS/other owners preserved; no new functional waste/financial PASS. Checkpoint CHECKPOINTS/CHANGES/2026-10-08-pos-database-lock-incident.md. Actual36second recovery NOT TESTED/AWAITING USER.

## POS-DB-LOCK-01 — ASSIGNED / USER FAIL / recovery BLOCKED

2026-10-08T19:47:36+03:00. Owner codex/pos-startup-loading-20261008, independent central database availability incident only. Preserve POS-CATALOG-PERF-01 and its retained owner/client-resolver PASS; no takeover of its broader performance audit, installation, TABLE_SERVICE, Gate3/4/6/8, Workforce or TODAY owners. User reports LAB and Diadoxou opening/refresh slow, explicitly36seconds. Attachment163905 shows LAB POS2/layout11/93products/emptycart and new «Κλείσιμο χωρίς Εκτύπωση» label; screenshot164234 shows cached OFFLINE catalog saved18:28:59 Athens;164507 shows AUTH_VALIDATION_UNAVAILABLE with existing waterSKU2270/qty1/cart1.00. Exact physical revision, shift/transaction/action outcome unknown. Do not retry that cart or any payment/waste for evidence. No new functional waste/financial PASS.

Read-only production diagnosis: canonical service myworkstation-app/Render and database myworkstation-db selected in user-confirmed My Workspace. Public page200/TTFB7.528s,total7.571s and health200/TTFB6.439s,total6.441s; healthrevision1cd34448aad6343be33c3757ab8aaf883f4d4050. These Work-network timings are separate from reported physical36s. Render logs repeatedly record10s Prisma pool timeout/limit9 during session validation. PostgreSQL snapshots show root SELECT product-catalog backend3137180, query_start2026-10-08T16:35:05.80891Z, active/ClientWrite/no blockers for526 then609seconds. Pending Product ALTER backend3137463 and PurchaseDocument ALTER3137534 both wait on that reader; at least7catalog/product readers queue behind3137463. This directly establishes a database lock chain affecting POS catalog reads and exhausted app connections, not merely a client rendering inference. CPU/memory snapshots do not establish saturation; http_latency metrics empty. Same-SHA guarded deployment update_in_progress; do not trigger another deploy as a diagnostic cure.

All assistant actions so far are SELECT/read-only, file/doc edits and publication only. No database session cancellation, migration, configuration, restart, seed, sale/payment/stock/shift action. The available Render SQL connector is read-only and exposes no cancellation/write/restart operation; no production credentials or independent authenticated dashboard session available. Recovery is BLOCKED on an authorized administrative SQL or database/service console capability. Prepared bounded action: freshly re-identify the same abandoned SELECT by backendPID/query_start/ClientWrite/SELECT shape, then cancel only that reader; never cancel payment, write, fiscal or unrelated sessions. If cancellation cannot release its ClientWrite connection, termination requires the same fresh identity/read-only checks. No broad restart or data update is proposed.

Single next action: obtain an administrative Render/database console for the targeted abandoned reader; after recovery independently re-read lock queue and fresh authenticated catalog/session response, then user measures one empty-cart refresh at LAB and Diadoxou. Claim/status remains ASSIGNED until that measured acceptance; no throughput/LAB/USER recovery PASS. Checkpoint CHECKPOINTS/CHANGES/2026-10-08-pos-database-lock-incident.md. Prior source#1901/release#1904 and all limited PASS remain protected.

## Reviewable recovery command — NOT EXECUTED

An administrator must first inspect the fresh activity/identity. The exact snapshot identity is guarded so a reused PID cannot be cancelled. This command targets an abandoned catalog SELECT only, not a financial statement. A successful cancellation response alone is not recovery acceptance; read back the lock chain and measure catalog/session requests.

```sql
SELECT pid,query_start,state,wait_event_type,wait_event,
       pg_blocking_pids(pid) AS blockers,left(query,180) AS statement
FROM pg_stat_activity
WHERE pid=3137180;

-- Run only after the fresh identity/abandoned-read check.
SELECT pg_cancel_backend(pid)
FROM pg_stat_activity
WHERE pid=3137180
  AND datname=current_database()
  AND query_start=TIMESTAMPTZ '2026-10-08T16:35:05.80891Z'
  AND state='active'
  AND wait_event_type='Client' AND wait_event='ClientWrite'
  AND ltrim(query) LIKE 'SELECT p."id",p."sku",p."name",p."description"%';
```

No cancellation executed by this page. Prevention remains a separately claimed follow-up after recovery: investigate graceful connection shutdown, repeated runtime DDL and bounded read/lock waits. No global statement timeout affecting sales, authentication bypass, catalog reduction or payment retry is introduced for this incident.
