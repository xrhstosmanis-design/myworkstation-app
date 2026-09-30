# MyWorkStation database backup cron

This job creates a PostgreSQL custom-format archive every three hours, validates
the archive locally with `pg_restore --list`, uploads it to a private encrypted
Backblaze B2 bucket through its S3-compatible API, and reports a signed status
event to MyWorkStation.

It never runs `pg_restore` against a database. A real restore remains a separate,
manual maintenance-window procedure and is intentionally not implemented here.

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
