# MyWorkStation database backup cron

This job creates a PostgreSQL custom-format archive every three hours, validates
the archive locally with `pg_restore --list`, uploads it to a private encrypted
S3 bucket, and reports a signed status event to MyWorkStation.

It never runs `pg_restore` against a database. A real restore remains a separate,
manual maintenance-window procedure and is intentionally not implemented here.

Required Render secrets: `AWS_REGION`, `S3_BUCKET_NAME`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `BACKUP_MONITOR_SECRET`.
The same `BACKUP_MONITOR_SECRET` must be configured on the web service.

The bucket must exist before the job runs, have versioning enabled, remain
private, and have default encryption configured. After deployment, trigger one
manual cron run, confirm `SUCCEEDED` in Super Admin, then independently download
the object and run `pg_restore --list backup.dump` before claiming LIVE PASS.
