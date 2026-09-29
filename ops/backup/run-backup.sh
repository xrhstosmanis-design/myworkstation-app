#!/bin/sh
set -eu

required="DATABASE_URL AWS_REGION S3_BUCKET_NAME BACKUP_MONITOR_URL BACKUP_MONITOR_SECRET"
for name in $required; do
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "Missing required backup configuration: $name" >&2
    exit 2
  fi
done

umask 077
run_id="$(date -u +%Y%m%dT%H%M%SZ)-${RANDOM:-0}"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
archive="/tmp/myworkstation-${run_id}.dump"
toc="/tmp/myworkstation-${run_id}.toc"
object_key="myworkstation/$(date -u +%Y/%m/%d)/backup-${run_id}.dump"
notified_success=0

notify() {
  status="$1"; checksum="${2:-}"; size="${3:-0}"; error_code="${4:-}"
  completed_at=""
  if [ "$status" != "STARTED" ]; then completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; fi
  body="{\"runId\":\"$run_id\",\"status\":\"$status\",\"startedAt\":\"$started_at\",\"completedAt\":\"$completed_at\",\"checksum\":\"$checksum\",\"sizeBytes\":$size,\"objectKey\":\"$object_key\",\"appRevision\":\"${RENDER_GIT_COMMIT:-UNKNOWN}\",\"dryRunStatus\":\"$([ "$status" = "SUCCEEDED" ] && printf PASSED || printf NOT_RUN)\",\"errorCode\":\"$error_code\"}"
  timestamp="$(date +%s)"
  signature="$(printf '%s.%s' "$timestamp" "$body" | openssl dgst -sha256 -hmac "$BACKUP_MONITOR_SECRET" -hex | awk '{print $2}')"
  curl --fail --silent --show-error --max-time 20 -H "Content-Type: application/json" -H "X-Backup-Timestamp: $timestamp" -H "X-Backup-Signature: $signature" --data "$body" "$BACKUP_MONITOR_URL" >/dev/null
}

on_exit() {
  code=$?
  trap - EXIT
  if [ "$code" -ne 0 ] && [ "$notified_success" -eq 0 ]; then notify FAILED "" 0 "BACKUP_JOB_FAILED" || true; fi
  rm -f "$archive" "$toc"
  exit "$code"
}
trap on_exit EXIT INT TERM

notify STARTED

# The bucket must already exist, remain private, use versioning and have default
# encryption. The job never creates or weakens storage security.
aws s3api head-bucket --bucket "$S3_BUCKET_NAME" --region "$AWS_REGION" >/dev/null
versioning="$(aws s3api get-bucket-versioning --bucket "$S3_BUCKET_NAME" --region "$AWS_REGION" --query Status --output text)"
[ "$versioning" = "Enabled" ] || { echo "S3 bucket versioning is not enabled" >&2; exit 3; }
aws s3api get-bucket-encryption --bucket "$S3_BUCKET_NAME" --region "$AWS_REGION" >/dev/null

pg_dump --format=custom --compress=6 --no-owner --no-privileges --file="$archive" "$DATABASE_URL"
[ -s "$archive" ] || { echo "pg_dump produced an empty archive" >&2; exit 4; }

# Restore dry-run: read and inspect the archive TOC only. No target DATABASE_URL
# is ever passed to pg_restore and no database is changed.
pg_restore --list "$archive" >"$toc"
grep -Eq 'TABLE|TABLE DATA' "$toc" || { echo "Backup archive has no table entries" >&2; exit 5; }

checksum="$(sha256sum "$archive" | awk '{print $1}')"
size_bytes="$(wc -c <"$archive" | tr -d ' ')"
aws s3 cp "$archive" "s3://$S3_BUCKET_NAME/$object_key" --region "$AWS_REGION" --only-show-errors --sse AES256 --metadata "sha256=$checksum,run-id=$run_id,dry-run=passed"
remote_size="$(aws s3api head-object --bucket "$S3_BUCKET_NAME" --key "$object_key" --region "$AWS_REGION" --query ContentLength --output text)"
[ "$remote_size" = "$size_bytes" ] || { echo "Uploaded object size mismatch" >&2; exit 6; }

notify SUCCEEDED "$checksum" "$size_bytes"
notified_success=1
echo "Backup completed: run=$run_id bytes=$size_bytes sha256=$checksum"
