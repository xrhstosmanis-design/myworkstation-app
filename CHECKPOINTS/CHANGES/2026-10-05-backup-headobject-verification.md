# 05/10/2026 — Task18 backup HeadObject verification

LIVE backup monitor showed FAIL. Render cron log isolated the run to `HeadObject operation: 404 Not Found` after the job had started. Non-secret production configuration was manually verified by owner: AWS_REGION `eu-central-003`, bucket `myworkstation-prod-backups-eu-20260930`, endpoint `https://s3.eu-central-003.backblazeb2.com`; these are mutually consistent.

Bounded script correction keeps the same pg_dump, encrypted S3 upload and dry-run policy. It records exact failure stages (bucket access, pg_dump, archive dry-run, upload, HeadObject verification, success callback) instead of generic BACKUP_JOB_FAILED. Post-upload HeadObject now retries up to five times with short increasing delay before failing as HEAD_VERIFY_FAILED, covering transient object visibility/API timing without weakening evidence requirements.

No restore, DATABASE_URL mutation, schema mutation, deletion or production data write. Require full CI and a real cron run that reports SUCCEEDED before Task18 LIVE PASS.
