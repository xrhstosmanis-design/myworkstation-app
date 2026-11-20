# Company authority installation runtime

The personal Platform Super Admin installation bridge is global, at
`/api/platform/backoffice-company-installation`. It delegates to the existing
installer; it does not create a service actor or infer authority from a selected
company or store. `BACKOFFICE_COMPANY_INSTALL_ENABLED=1` enables the existing
installation gate. Describe and inspect remain available with that gate off.

`POST /inspect` reports boolean `runtimePrerequisites`; `eligible` is false when
any required application-side prerequisite is unavailable. The diagnostic runs
only fixed local `--version` commands, with no shell, database connection or S3
request. It reports no executable paths, versions, credentials, environment
values or raw process output. A green diagnostic is prerequisite evidence only;
it does not replace the installer's live session, schema, worker, backup,
immutable storage and fresh source checks.

The application-side signed-proof consumer needs:

- Python 3.9 or later in the Python 3 series, with its standard library.
- `psql` and `pg_dump`, of matching PostgreSQL major versions, at least 18 for
  the current PostgreSQL 18 source database.
- AWS CLI version 1 or 2.
- `DATABASE_URL`, `S3_BUCKET_NAME`, `AWS_REGION`, `S3_ENDPOINT_URL`,
  `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and a `BACKUP_MONITOR_SECRET` of
  at least 24 characters. Only configured-presence booleans are returned.
- The reviewed repository source files and a writable private temporary
  directory. Source hashes are checked by the existing signed-proof consumer.

The native Node application build in `render.yaml` does not provision these
external executables. They must be prepared in its runtime before enabling
installation. The diagnostic performs no installation or provisioning.

Prepare and produce the signed request/proof on the existing reviewed backup
runtime using `company-installation-backup.py`'s explicit `--prepare` and backup
modes. That producer additionally requires `pg_restore`, `initdb` and `pg_ctl`
for a private restore, and a PostgreSQL system account when run as root. The
existing `postgres:18-alpine` backup image supplies these tools and installs
Python and AWS CLI. The application consume mode does not start a private
PostgreSQL cluster; it verifies the immutable backup object and re-observes the
live source using read-only SQL and `pg_dump`. Do not substitute the backup
worker heartbeat or a synthetic actor for the genuine personal Super Admin.

Install accepts exactly `profile`, `packet`, `requestEnvelope`, `proofEnvelope`
and `explicitAuthorization: true`. Profile is one of `BASE`, `CAPTURE` or
`CURRENT_CAPTURE`. Signed request/proof envelopes must be passed intact; they
are never issued from caller-selected plan hashes or copied environment secrets.
