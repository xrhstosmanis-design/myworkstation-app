# MyWorkStation database backup cron

This job creates a PostgreSQL custom-format archive every three hours, validates
the archive locally with `pg_restore --list`, uploads it to a private encrypted
Backblaze B2 bucket through its S3-compatible API, and reports a signed status
event to MyWorkStation.

It never runs `pg_restore` against a database. A real restore remains a separate,
manual maintenance-window procedure and is intentionally not implemented here.

Signed monitoring events retry transient HTTP 408/429/5xx and connection errors
up to five attempts (20 seconds per request, with 2/4/6/8 second backoff).
Each delivery retains the same run ID, completion time and archive evidence,
with a fresh timestamp/signature. Permanent errors, including authentication
rejection and redirects, fail immediately. Exhausted delivery is still a job
failure; it does not prove a backup succeeded. A dump failure is not retried,
to avoid repeating database load during an incident.

Run the isolated command-fake regression with
`node --test ops/backup/test/monitor-delivery-retry.test.mjs`. This tests status
delivery and job control flow; it does not test a real archive, upload or restore.

Required Render secrets: `AWS_REGION`, `S3_BUCKET_NAME`, `S3_ENDPOINT_URL`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `BACKUP_MONITOR_SECRET`.
The same `BACKUP_MONITOR_SECRET` must be configured on the web service.

For Backblaze B2, `AWS_REGION` is the bucket region (for example,
`eu-central-003`) and `S3_ENDPOINT_URL` is the exact S3 endpoint shown by the
Backblaze console. The application key must be restricted to this bucket.

The bucket must exist before the job runs, have versioning enabled, remain
private, have version history enabled, default encryption configured, and
Object Lock enabled with the approved retention period. After deployment,
trigger one manual cron run, confirm `SUCCEEDED` in Super Admin, then
independently download the object and run `pg_restore --list backup.dump` before
claiming LIVE PASS.

## Reviewed store recovery worker (not automatic cleanup)

The existing PG18 image also contains `/backup/lifecycle/worker.py` and the same
strict COPY auditor used for the verified existing-archive recovery. The default/manual
container invocation remains the original full backup. The configured scheduled
command polls recovery every five minutes, but full backups still run only at the
eight original UTC slots 00/03/06/09/12/15/18/21. No recovery job is
queued, no maintenance is started and no application data is deleted by deploying
this image. A trusted operator may run `python3 /backup/lifecycle/worker.py` on the
existing backup service only after an application-prepared RESET job exists.
Do not manually trigger a cron while its regular backup is running: Render cancels
the current invocation when manually retriggered.

The worker leases at most one exact fresh operation, creates a new custom archive,
uploads with AES256 to the existing private versioned bucket, downloads the exact
returned version and checks SHA256/size/encryption. It starts a private socket-only
PG cluster with a clean environment and no application/provider/connector workers,
performs a real full restore and compares every COPY row/sequence. It then deletes
only reviewed REMOVE rows in the private database, checks exact DELETE counts,
restores their complete typed values without rewinding sequences and compares all
COPY multisets/sequences again. KEEP rows, shared data and other stores are controls.
Only exact reviewed INSERT hooks are temporarily disabled inside the private undo
transaction; lifecycle and FK guards remain enabled. This is not live undo or a
physical fiscal replay. Failure/expiration/abort cannot publish a usable proof.

The signed receipt binds operation, company/store, source, reviewed manifest,
prepared snapshot, actual restore audits, artifact checksum/key/version and time.
It is checked before live execution; storage readback alone never qualifies.
The worker has no live business DELETE/ALTER path. The new web adapter is mounted only behind an explicitly enabled Super Admin
flow (disabled by default); actual service configuration/image verification and
physical post-drain acceptance are still required. Render Trigger Run follows the
configured scheduler command. For an explicit on-demand full backup run
`/backup/run-backup.sh` on the existing service; never retrigger an active run. No KAT cleanup is implied by CI tests.

### Worker availability and private KAT operator

Each scheduled worker checks the existing bucket version/encryption policy and
publishes an HMAC-signed service readiness pulse in internal StoreLifecycleRuntime.
Only this global metadata is created/updated automatically; it never enrolls or
freezes a store. The web flag alone cannot start preparation: a current matching
manifest/revision pulse is required. This is availability, not physical clearance
or recovery proof. The actual new object/readback/full+selective restore remains
mandatory before deletion. Pulse/proof use separate HMAC domains and no new key.

The nonsecret enable flag is supplied by the reviewed Blueprint; normal guarded
release and actual image/configuration/readiness verification remain required.
After an explicit confirmed clear, the controller attempts guarded reopen. A
refusal leaves the exact COMPLETED audit in maintenance and supports later
checked reopen without needing the backup service to still be online.

The reviewed `server/scripts/store-lifecycle-operator.mjs` runs only on the exact
authorized production web service and only pilot-company/kat-store, with explicit
STORE-LIFECYCLE-01 approval. It calls the same controller with the genuine default
recovery adapter; no force option or invented human token. Its audit principal is
service-operator:render:STORE-LIFECYCLE-01. Work/wrong-service/other-store calls
refuse before importing Prisma. Prepare requires both actual report files and an
explicit technician-attestation JSON; never derive those facts from cloud counts.
All permanent UI/terminal actions still follow their active confirmation policy.
