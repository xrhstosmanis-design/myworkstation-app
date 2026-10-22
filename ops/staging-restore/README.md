# Private staging restore candidate — not provisioned or executed

This independent tool is **not connected to Render, CI deployment, the app or
the existing backup cron**. Claim: FOUR-WORKER-EXECUTION-01, PR2993 corrected by
PR3004, owner `codex/central-staging-restore-20261022`, issue2574. Source and
synthetic tests do not establish STAGING RESTORE PASS.

## Fixed boundary

Only the approved internal Oregon host `dpg-db900vks728c73b9phtg-a`, database
`myworkstation_db_upgrade_test_20261016` and its matching database user are
supported. There is no destination URL, host/port override, SQL argument, object
URL fetch, dump, production connection or scheduling option. The image boots
only this Python tool. It never starts the application, seeds, Prisma,
lifecycle/history workers, SMTP or another daemon.

`validate` is the default mode and performs local receipt/archive checks only;
it opens no database connection and starts no subprocess. It copies the archive
while hashing into an anonymous temporary file, then uses that same private
snapshot fd for restore, preventing a later change to the original pathname
from changing the archive consumed. The local snapshot is removed on exit.

## Required reviewed input, not an authorization token

The operator must supply one already downloaded, approved custom-format
PostgreSQL archive and a separate bounded JSON receipt with **exactly**:

| Field | Required value |
| --- | --- |
| `schema_version` | integer1 |
| `target_id` | the fixed approved staging ID above |
| `source_run_id` | the verified full-backup run ID |
| `object_version` | its independently verified exact object version |
| `archive_bytes`, `archive_sha256` | exact byte size and lowercase SHA256 |
| `restored_bytes_upper_bound` | independently justified conservative size bound |
| `expires_at` | UTC `Z` timestamp, in the next24hours |
| `table_rows` | complete `public.TableName`→exact nonnegative row count map |

No example receipt fabricates real table counts. The19Oct upload/readback
receipt is existing evidence, not a new restore proof. Its full object version
and complete source counts must be obtained from the retained recovery owner;
an amount-only or TOC-only record cannot substitute. This tool trusts a reviewed
receipt; it does not authenticate that review, download/verify S3 policy or
grant anyone permission. Only an independently verified trusted original dump
may be used: PostgreSQL archives can contain executable database objects.

Local validation (with no `DATABASE_URL` in the environment):

```sh
python3 ops/staging-restore/restore.py validate --receipt /mounted/receipt.json --archive /mounted/archive.dump
```

## Separate execution gate

Provisioning, cost, secret transfer, archive transfer, retention and deletion
approval are **outside this implementation**. Do not create a service or alter
the existing web/cron/database in order to try the candidate. The future
dedicated runner must be private, Oregon, named
`myworkstation-staging-restore-20261022`; it requires normal Render identity
variables and only `STAGING_RESTORE_PASSWORD`. `DATABASE_URL` is refused even if
the operator thinks it is staging. Never copy a production credential into it.
The fixed target user and database are checked through a read-only query.

Only after the independent execution prerequisites are satisfied, the explicit
mode is `restore` with `--acknowledge 'RESTORE ONLY dpg-db900vks728c73b9phtg-a'`.
No generic production or other staging target is supported. A different
approved destination requires a separately reviewed source change.

Preflight refuses any non-system relation (including views/sequences), type,
function, extra schema or extension beyond default `public`/`plpgsql`. It checks
current database bytes plus the reviewed restored-size upper bound and512MiB
reserve against a conservative5,000,000,000byte quota. **This is a declared-quota
gate, not measured database-filesystem free space**. The operator must separately
confirm actual Render storage capacity and any concurrent resource consumers.
The local anonymous copy also requires archive size plus64MiB scratch space.

Execution clears inherited connection/shell injection variables, uses a fixed
child environment and never puts a password in argv/evidence. Restore uses
`--single-transaction --exit-on-error --no-owner --no-privileges`, no clean/create,
parallel jobs or automatic retry. Post-verification compares the complete table
set and each expected row count and emits only aggregate counts/digest.

## Failure and retained limits

Errors return nonzero and a generic redacted failure without SQL, subprocess
stderr, password, URI, private paths or table contents. Failed restore rolls back
its single transaction. A **post-restore verification failure can leave the
successfully restored target populated**: quarantine it, do not start the app,
do not rerun and do not automatically drop/clean it. The named owner must review
the exact result and execute only separately approved cleanup. Original backup
objects and production are never changed by this tool. Local snapshots close
automatically; actual staging data/resource retention remains an operator duty.

No actual restore, database-level race/failover, HA/cutover, physical POS/RBS
offline clearance, full-source checksum proof or capacity acceptance is claimed.
Row counts are deliberately not represented as semantic/financial equality.
The existing backup/lifecycle/history owners, archive and accepted tests stay
unchanged. A green full CI and exact review precede any runnable publication.

## Isolated verification

From `server`, run `node --test test/staging-restore-runner.test.js` with Node20.
The nine local boundary tests use synthetic files and mocked subprocess results.
The native-CI test additionally executes the exact metadata SQL read-only on the
existing isolated loopback test PostgreSQL database and verifies its non-staging
identity is refused. The CI packaging test builds this exact image and invokes
offline default validation with network disabled, read-only mounts and no
credentials; a local machine without Docker explicitly skips that check. CI
must execute it. Neither test runs a restore or contacts Render/S3. These checks
are not live staging restore evidence.
