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
