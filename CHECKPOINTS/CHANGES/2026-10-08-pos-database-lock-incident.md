# POS database lock incident — bounded operational diagnosis

## POS-DB-LOCK-01 — source merged / deployment BLOCKED / administrative read recovery required

08/10/2026 20:33Athens release readback. Owner codex/pos-startup-loading-20261008 retained. SourcePR1912 finalhead2a7adfe3976289b5e8811dafebe6a6a8a75996c8/fullCI37816230134SUCCESS including1926server tests, isolated PostgreSQL before/after catalog equivalence and concurrent read/health HTTP fixture; merge3458f34affa860120f9722650699880f09bbad3c verified. MainCI37816669920SUCCESS; guardedRender37817103930started, same source queued in Render. This is implemented/CI PASS, not deployed or USER/LAB PASS. No5-store capacity acceptance.

Public health still200/exactb76dc52f5802323a0be1a100f338a7c62afe6479,total7.040s. Priorautomatic f4a9c7ab655aef0ee23da8d24f94c52f45020b07 stuck before port binding; logs17:25:28Z show port-scan timeout. New source3458f34 queued behind it. Do not start another manual deploy or interpret health as new-source activation. Owner20:29:07 says all windows closed except POS: repeated user searches/open tabs are not a current explanation.

Fresh SELECT snapshots identify a new abandoned old catalog read PID3141311,backend_start2026-10-08T17:18:33.719816Z,query_start2026-10-08T17:18:52.503723Z,active/ClientWrite/no blockers. Product ALTER3141315 and PurchaseDocument ALTER3141340 queue on it; preparation cleanup3141558 queues behind Product ALTER. This is a recurring lock chain blocking bootstrap/release independently of the old source's query CPU cost. Earlier PIDs3137180/3137463/3137534 remain vanished/historical: never execute the old guarded command against reused IDs.

All production diagnosis/corrected-query digest probes remain read-only. No backend cancellation/termination/restart or financial/stock action has been performed. Available Render connector SQL is read-only; do not bypass that capability with administrative functions. Preparing official Render CLI authentication as an independent administrative route; authentication/administrative recovery remains NOT EXECUTED. No API key/password is requested in chat or published. Existing owner-confirmed workspace tea-d9ie26vaqgkc739uudqg and database dpg-d9isee7avr4c73bdglog-a must be verified before any administrative action.

Next single action: obtain authorized CLI/admin connection, freshly verify exact PID/starttimes/standalone catalog SELECT/ClientWrite, then cancel only this abandoned reader with the guard below. If cancellation cannot release the same freshly identified ClientWrite reader, termination is limited to that same standalone read after recheck. Never cancel writes/payments/fiscal or unrelated sessions; no broad database restart is proposed. Afterwards read back queue and exact deployed revision before one user search/empty-cart POS acceptance. Remaining prevention: abandoned-connection lifetime/graceful shutdown/runtimeDDL/duplicate deployments need a separately bounded causal claim; broader planned-store capacity measurement stays OPEN. Full incident ASSIGNED/USER FAIL/release BLOCKED. Original financial/no-print acceptance and all other owners protected.

### Fresh reader recovery guard — NOT EXECUTED

The following replaces only the current incident reader identity. Re-identification is mandatory immediately before use, and an absent/mismatched reader means no cancellation.

```sql
SELECT pid,backend_start,query_start,state,wait_event_type,wait_event,
       pg_blocking_pids(pid) AS blockers,left(query,180) AS statement
FROM pg_stat_activity WHERE pid=3141311;

SELECT pg_cancel_backend(pid)
FROM pg_stat_activity
WHERE pid=3141311 AND datname=current_database()
  AND backend_start=TIMESTAMPTZ '2026-10-08T17:18:33.719816Z'
  AND query_start=TIMESTAMPTZ '2026-10-08T17:18:52.503723Z'
  AND state='active' AND wait_event_type='Client' AND wait_event='ClientWrite'
  AND ltrim(query) LIKE 'SELECT p."id",p."sku",p."name",p."description"%'
  AND cardinality(pg_blocking_pids(pid))=0;
```

No cancellation executed; pending user/admin connection. Checkpoint CHECKPOINTS/CHANGES/2026-10-08-pos-database-lock-incident.md.

## POS-DB-LOCK-01 — bounded read-query implementation / AWAITING CI and USER

Owner codex/pos-startup-loading-20261008; source branch codex/pos-catalog-reader-fix-20261008. Claim PR1909/exact-head8712de6dc752bf5e18f7de5941d4435c05ae58d5/docsCI37814527487SUCCESS/mergeb76dc52f5802323a0be1a100f338a7c62afe6479 published before source edits. New owner20:13:22 report: one product search stalls POS and BackOffice together; screenshot171208 shows coca search in bulk prices and repeated session-unavailable error. Owner asks about5additional stores next week. Current capacity/production stability is NOT accepted; no5-store load PASS or paid-plan recommendation/upgrade is invented.

One bounded change: smart-entry GET/catalog selects company/search matches into a materialized500-product page before enrichment, selects supplier history once for those candidates preserving prior priority/newest timestamp/null-name fallback, and collects stores per candidate without expanding the outer rows. Exact projected product/pricing/VAT/barcode/supplier/store fields, inactive inclusion, search before pagination, no-store headers and existing authentication/licensing/role checks retained. No write route, schema/migration/index, production seed, configuration, timeout or fiscal/financial/stock operation changed. Existing full TODAY-04/client-catalog owners and limited PASS preserved.

Read-only PostgreSQL EXPLAIN (not ANALYZE) on current company: prior plan enriches estimated6623 products before final500, estimated total cost590341.45/start589076.45; new plan500 rows,total3640.46/start3639.21. These are planner costs, not seconds or throughput. One new-query read-only digest probe returns500rows, connector roundtrip65.572seconds under already saturated production load: actual acceptable latency is NOT established. No old expensive query replay or live transaction was executed. Local Node20 production build SUCCESS, existing owner-product14/14 and server1915PASS/0FAIL/4SKIP. New isolated PostgreSQL/HTTP regression fixture compares the frozen pre-change SELECT with current output for600products, all supplier priorities/ignored drafts/inactive links/nulls, barcode outside page, search escaping, foreign store/company filtering and fresh supplier changes; verifies candidate500/supplier-one-loop plan and8concurrent read+health requests. This new fixture awaits full CI, not a real-store PASS. Existing CI receives one additional isolated read-regression flow only.

Next single action: green exact-head full CI including new database fixture, merge and verify exact deployed source, then one identified product search with simultaneous empty-cart POS refresh/session check. Broader durability/capacity measurement with planned stores remains OPEN after the causal correction, no repeated sale/payment/waste. User timing36→8→45→7 remains intermittent historical evidence. Whole incident USER FAIL / AWAITING CI+USER, not fixed or completed. Checkpoint CHECKPOINTS/CHANGES/2026-10-08-pos-database-lock-incident.md.

## POS-DB-LOCK-01 — ASSIGNED / recurring USER FAIL / bounded catalog-query correction claimed

20:08:25Athens owner reports7seconds, screenshot170816 shows the same LAB POS/emptycart. Variation45s→7s confirms intermittent recovery; no durable performance PASS or additional transaction inferred.

08/10/2026 20:07:58Athens owner reports45seconds for refresh; screenshot170737 shows LAB POS2/93activeproducts/layout11/emptycart connected after that wait. This newer timing supersedes any present8second performance acceptance. Category counters visually0 are not proof catalog was deleted. Whole recovery/performance remains USER FAIL/OPEN; no further timing repeat requested.

08/10/2026 20:06:23 Europe/Athens. Newer owner screenshots supersede any general stability interpretation of the20:01 timing readback:170441 shows central owner products/Τιμές ανά κατάστημα, query coca,0products and red «Ο έλεγχος συνεδρίας δεν είναι προσωρινά διαθέσιμος. Δοκίμασε ξανά — δεν έγινε αποσύνδεση.»; owner says this repeatedly appears.170605 shows Diadoxou stalled at «Έλεγχος βάρδιας και δικαιωμάτων…» and owner reports severe server instability. These are real availability USER FAIL; prior8second reports remain historical limited timing only. P2024 pool-exhaustion events continue20:04–20:05, concurrent long SELECT fingerprints match server/src/routes/owner-product-smart-entry.js GET/catalog (VAT department and supplier columns). No credential loss inferred and no auth/shift validation bypass proposed.

Latest explicit owner direction selects one bounded causal catalog SQL correction here under retained incident owner codex/pos-startup-loading-20261008. ΑΝΑΛΗΨΗ ΑΠΟ codex/central-management-live-audit-20261007 — ASSIGNED codex/pos-startup-loading-20261008 for the exact GET/catalog expensive enrichment/read query only; full TODAY-04 audit, product mutations/price workflows and existing POS-CATALOG-PERF-01 client owner remain assigned to their existing pages. No prior owner's release or whole-scope handoff is invented. This claim must merge before source edits.

Proposed boundary: select the same first500 matching company products before expensive supplier/barcode/store enrichment, replace repeated per-product supplier-history scans with one company/candidate-scoped supplier selection preserving priority0activeLink/1mapping/2approvedDocument/3finalOrInvoicedOrder and newest timestamp. Preserve exact fields, search/barcodes, active/inactive inclusion, VAT/prices, no-store response, company/store isolation and all financial/fiscal/auth/license behavior. No schema/index/migration/configuration, global timeout, paid-plan upgrade, production seed or source outside that bounded query without another causal claim. Required validation: supplier/search/output equivalence in isolated PostgreSQL, meaningful query plan/read behavior, full CI, exact live revision then bounded user search/entry acceptance. Current new behavior NOT TESTED/AWAITING IMPLEMENTATION; CI is not USER/LAB PASS.

Single next action: publish this evidence/claim, then implement and verify the bounded query correction. No further user retry/reset/re-pair/payment/waste or financial replay requested while pool remains exhausted. Owner retained until named handoff; checkpoint CHECKPOINTS/CHANGES/2026-10-08-pos-database-lock-incident.md.

## POS-DB-LOCK-01 — limited USER recovery/timing PASS / recurrence OPEN

08/10/2026 20:01:31 Europe/Athens. Owner codex/pos-startup-loading-20261008 retained. The owner reports «ξεκόλλησε», then «8 δευτερόλεπτα» for LAB and «8 και τα Διαδόχου». This closes the missing physical timing readback only: reported36s → approximately8s at both stores. No repeated timing series, target/SLA, exact click-to-ready boundaries, physical client SHA, independently verified absence of OFFLINE/auth errors or completed login is established. Screenshot170016 at20:00 shows LAB login directory restored (LAB POS2 selectable and PIN form), with no red internal-error/no-PIN message visible; it does not show the completed POS session. The previous19:59 screenshot remains real historical login FAIL, not a credential-change finding. Source no-print functional/financial acceptance remains AWAITING LAB. Manual docs/manual/pos/PASS.md updated for this bounded recovery observation only.

Read-only database evidence:19:58:48.503Athens client backend3139078 terminated by signal9/Killed; PostgreSQL terminated remaining backends and reinitialized, temporarily rejecting connections in recovery. The failed backend was reading StoreChatSettings; this is not proof that this small query caused the crash. Memory253444100bytes near268435460byte limit and CPU0.1quota at19:58 are consistent with capacity pressure; kernel/OOM cause is NOT independently established. At20:03:46 recovery=false and0Lock waiters; subsequent snapshot has8 concurrent owner-products SELECTs aged32–134s without blockers. Lock absence does not certify stability: long catalog readers/resource pressure remain OPEN.

Render automatic deployment ffb2540880273fe72f3f165bcbb980aa17bac0e2 LIVE20:00:43Athens; this is a service revision, not independently read from each physical client. PriorPR1907/docsCI37812663028SUCCESS preserved. No assistant SQL cancellation/restart, source/configuration/migration/seed or manual deploy; all live diagnosis was read-only. Publication of prior PDF records triggered automatic deployments, so do not use further record/deploy cycles as a recovery treatment. Protected tenant/auth/license/fiscal/payment/stock invariants and other owners retained.

Single next action: investigate the observed concurrent owner-products reader lifetime/concurrency and its interaction with runtimeDDL/deployment shutdown under this incident's retained owner, reconciling with existing catalog/central-management owners before any bounded code change. No further user timing repeat or transaction replay is requested for this completed readback. Full availability/performance PASS, prevention and no-print transaction result remain NOT TESTED/OPEN. Checkpoint CHECKPOINTS/CHANGES/2026-10-08-pos-database-lock-incident.md. Older awaiting-timing/cancellation entries below are dated history superseded only for the recovered reader and received timing.

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
