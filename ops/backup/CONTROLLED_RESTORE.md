# Controlled restore and automatic report activation

This is an explicit production maintenance tool, never a scheduled backup task.
It requires Node 20, PostgreSQL 18 client tools and an operator-provided Render
API token. It creates no service, database, bucket or paid storage. Import and
default CLI invocation never contact Render, start PostgreSQL tools or change
configuration. Existing backup uploads and private recovery audits are unchanged.

The tool is fixed to workspace `tea-d9ie26vaqgkc739uudqg`, web service
`srv-d9isenfavr4c73bdh52g`, PostgreSQL `dpg-d9isee7avr4c73bdglog-a`, database/user
`myworkstation`. Execution checks fresh Render metadata and connection information
without printing credentials. Only the direct external Oregon hostname is allowed;
pooling, target overrides, inherited libpq options and arbitrary CLI commands are
not accepted. External TLS verification is required.

## External control

`AUTOMATIC_REPORT_ACTIVATION_CONTROL` is one direct Render environment variable,
outside database backups. Its value is canonical JSON in this exact key order:

```json
{"v":1,"serviceId":"srv-d9isenfavr4c73bdh52g","epoch":"12345678-1234-4123-8123-123456789abc","issuedAt":"2026-10-22T10:00:00.000Z","notBefore":"2026-10-22T21:00:00.000Z","enabled":false}
```

The dates are examples, not an approved activation boundary. An operator must
choose a future Athens business boundary explicitly and express it in UTC.
`notBefore` must be later than `issuedAt`. Missing/malformed control, wrong
`RENDER_SERVICE_ID`, or `enabled:false` denies delivery. Epoch is a fresh UUIDv4.
The full fingerprint hashes `[v,serviceId,epoch,issuedAt,notBefore,enabled]`;
the activation fingerprint excludes `enabled` so enrollment can be prepared
while OFF. Grant creation/consent must be no earlier than `issuedAt`; report
period start and current time must be no earlier than `notBefore`. A period
crossing the boundary is denied. Restored grants from a previous epoch deny.

Only this production web service may host dispatchers. The helper snapshots
process environment; saving OFF in Render does not update an old running
process. Therefore stopping **all** service instances is mandatory before
restore. Other services, external dispatch workers or privileged out-of-band
restores are outside this controlled contract and must not be introduced.
This does not claim protection from a privileged administrator bypassing it.

## Review before execution

Use only a trusted, operator-reviewed backup: matching a SHA256 does not make
an arbitrary PostgreSQL archive safe to execute. Receipt fields are exactly:
`v` (1), fixed `serviceId`, fixed `postgresId`, `sourceRevision` (40 lowercase
hex), `archiveBytes` (positive integer, at most 1 GiB), `archiveSha256` (64
lowercase hex), `expiresAt` (future canonical UTC milliseconds). Receipt is
evidence, not authorization. Keep the receipt file at most 16 KiB.

```sh
node ops/backup/restore-controlled.mjs --archive /reviewed/archive.dump --receipt /reviewed/receipt.json --not-before FUTURE_UTC_BOUNDARY --dry-run
```

Dry run validates the receipt, expiry, file type, exact size and archive digest
offline. The archive is copied while hashing into a private, unlinked file;
the same open descriptor supplies restore stdin, preventing source replacement.

Execution additionally requires `--execute`, a separately supplied
`RENDER_API_KEY`, and `--acknowledge` with the exact string:
`RESTORE dpg-d9isee7avr4c73bdglog-a WITH srv-d9isenfavr4c73bdh52g SUSPENDED`.
This replaces the existing database contents using `pg_restore --clean
--if-exists --single-transaction --exit-on-error --no-owner --no-privileges`.
Do not run it against customer data without the separate approved maintenance
window and reviewed archive. No execution is authorized by source review or CI.

Execution performs these checks/actions in order:

1. Fresh fixed database/service identity; autodeploy must already be OFF.
2. Save a new external epoch, future cutoff and OFF; fetch exact readback.
3. Suspend the entire fixed service. HTTP 202 alone is not stop evidence.
4. Fetch two independent proofs: service suspended, complete instance list
   empty, no active/queued deployment and unchanged exact external OFF control.
5. Verify actual database/user/PostgreSQL 18 using read-only `psql -X`.
6. Recheck receipt expiry and stopped proof immediately before restore.
7. Restore once from the verified descriptor. No retry or automatic cleanup.
8. While still suspended, rotate a final epoch/cutoff with OFF and verify again.

Stop proofs are fail-closed, not a polling/retry loop. If suspension is not yet
complete, the command refuses and leaves the service suspended/OFF; investigate
before a separately authorized invocation. If the chosen cutoff has elapsed
during restore, final rotation refuses and the service remains suspended/OFF.
The tool **never resumes or deploys the service**, on success or failure.

After forensic restore checks, a separately reviewed deploy/resume must use the
new OFF control. Never use “restart” to load changed environment variables:
Render restarts preserve the old running configuration. Fresh enrollment,
recipient verification and consent are required before explicit activation;
restored enabled flags are insufficient. No historical catch-up before cutoff.

The prospective files `lifecycle/automatic-report-manifest.proposed.json` and
`lifecycle/automatic-report-column-review.proposed.json` classify all six new
tables as store-owned `DIRECT/reset REMOVE`. They are **not loaded by the live
lifecycle worker**. The existing canonical manifest and column review remain
unchanged: adding expected tables before provisioning would break existing
lifecycle inspection even while dispatch is OFF.

Promotion is a separate explicit schema classification gate: review and
provision the six exact tables while dispatch is OFF, verify actual PostgreSQL
columns, constraints, indexes and empty initial state, confirm there are no
in-flight lifecycle jobs tied to the old plan hash, and coordinate application
and backup worker revisions before promoting both prospective files. Existing
catalogue drift must receive an explicit review; it must not be silently copied
into a new plan. Until this gate is completed, do not enable dispatch or treat
reset of the six tables as available. After reviewed promotion, reset/delete
classifies recipients, consent, policy, grants, payload and slots as REMOVE.
No optional-table or executor-validation bypass is introduced.

Automatic email may use a genuinely unenrolled lifecycle generation zero.
It does not create a fence, install triggers or start RESET. Before authoritative
reads or writes, its shared boundary acquires Store table SHARE NOWAIT, optional
existing Fence table SHARE NOWAIT, then all six report tables ROW EXCLUSIVE
NOWAIT. It freshly asserts lifecycle state under these locks; management retains
the original request generation. Existing enrolled generations, maintenance,
retirement and stale-request rejection remain enforced. Report-table locks also
reject a partially progressed installer before a circular wait can form. The
supported installer creates its fence, Store trigger and enrollment atomically;
independent privileged creation outside that protocol is unsupported. Store
SHARE can briefly block Store mutations globally; contention is an explicit
refusal, never an automatic retry. Locks are released before SMTP.

Global lifecycle activation, full production-schema private recovery proof and
physical reset/clearance acceptance remain separate work. The bounded seven-table
CI fixture does not establish full production restore acceptance. Do not invoke
the lifecycle controller's start action to prepare email: it starts RESET drain.
If a supported future enrollment/reset advances the generation, previously
authorized report work fails its next fresh generation check; new authority is
required. The external restore OFF/stop/epoch/cutoff protocol below remains
mandatory for both enrolled and unenrolled stores.
This does not retain a same-database SMTP suppression ledger across full restore;
the enforced external OFF/stop/rotate/cutoff workflow provides that boundary.
No payload, consent or backup retention duration is selected here.

## Validation limits

The tests use actual localhost HTTP requests against a synthetic Render API and
isolated child processes for FD/env/timeout/output-limit checks. PostgreSQL
identity and restore commands are replaced by explicit test doubles; no native
database restore, Render configuration write, suspension or resume is performed.
CI PASS is not production/LAB restore acceptance.
