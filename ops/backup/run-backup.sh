#!/bin/sh
set -eu

required="DATABASE_URL AWS_REGION S3_BUCKET_NAME S3_ENDPOINT_URL BACKUP_MONITOR_URL BACKUP_MONITOR_SECRET"
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
failure_stage="BACKUP_JOB_FAILED"

aws_s3api() {
  aws s3api "$@" --region "$AWS_REGION" --endpoint-url "$S3_ENDPOINT_URL"
}

notify() {
  status="$1"; checksum="${2:-}"; size="${3:-0}"; error_code="${4:-}"
  completed_at=""
  if [ "$status" != "STARTED" ]; then completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; fi
  body="{\"runId\":\"$run_id\",\"status\":\"$status\",\"startedAt\":\"$started_at\",\"completedAt\":\"$completed_at\",\"checksum\":\"$checksum\",\"sizeBytes\":$size,\"objectKey\":\"$object_key\",\"appRevision\":\"${RENDER_GIT_COMMIT:-UNKNOWN}\",\"dryRunStatus\":\"$([ "$status" = "SUCCEEDED" ] && printf PASSED || printf NOT_RUN)\",\"errorCode\":\"$error_code\"}"
  # Keep one event/runId/completion time, but sign each delivery attempt afresh.
  # The receiver upserts by runId, so a lost response can be retried safely.
  notify_attempt=1
  while [ "$notify_attempt" -le 5 ]; do
    timestamp="$(date +%s)"
    signature="$(printf '%s.%s' "$timestamp" "$body" | openssl dgst -sha256 -hmac "$BACKUP_MONITOR_SECRET" -hex | awk '{print $2}')"
    curl_code=0
    http_code="$(curl --fail --silent --show-error --connect-timeout 5 --max-time 20 --output /dev/null --write-out '%{http_code}' -H "Content-Type: application/json" -H "X-Backup-Timestamp: $timestamp" -H "X-Backup-Signature: $signature" --data "$body" "$BACKUP_MONITOR_URL" 2>/dev/null)" || curl_code=$?
    if [ "$curl_code" -eq 0 ]; then
      case "$http_code" in 2??) return 0 ;; esac
    fi
    retryable=0
    case "$http_code" in 408|429|5??) retryable=1 ;; esac
    # Retry connection/transport failures, not TLS or configuration errors.
    case "$curl_code" in 5|6|7|18|28|52|55|56) retryable=1 ;; esac
    if [ "$retryable" -eq 0 ] || [ "$notify_attempt" -eq 5 ]; then
      echo "Backup monitor delivery failed: status=$status http=$http_code curl=$curl_code attempts=$notify_attempt" >&2
      return 1
    fi
    echo "Backup monitor delivery retry: status=$status http=$http_code curl=$curl_code attempt=$notify_attempt" >&2
    sleep $((notify_attempt*2))
    notify_attempt=$((notify_attempt+1))
  done
}

on_exit() {
  code=$?
  trap - EXIT
  if [ "$code" -ne 0 ] && [ "$notified_success" -eq 0 ]; then notify FAILED "" 0 "$failure_stage" || true; fi
  rm -f "$archive" "$toc"
  exit "$code"
}
trap on_exit EXIT INT TERM

failure_stage="MONITOR_START_NOTIFY_FAILED"
notify STARTED

# The bucket must already exist, remain private, use versioning and have default
# encryption. The job never creates or weakens storage security.
failure_stage="BUCKET_ACCESS_FAILED"
aws_s3api head-bucket --bucket "$S3_BUCKET_NAME" >/dev/null
versioning="$(aws_s3api get-bucket-versioning --bucket "$S3_BUCKET_NAME" --query Status --output text)"
[ "$versioning" = "Enabled" ] || { echo "S3 bucket versioning is not enabled" >&2; exit 3; }
aws_s3api get-bucket-encryption --bucket "$S3_BUCKET_NAME" >/dev/null

failure_stage="PG_DUMP_FAILED"
pg_dump --format=custom --compress=6 --no-owner --no-privileges --file="$archive" "$DATABASE_URL"
[ -s "$archive" ] || { echo "pg_dump produced an empty archive" >&2; exit 4; }

# Restore dry-run: read and inspect the archive TOC only. No target DATABASE_URL
# is ever passed to pg_restore and no database is changed.
failure_stage="ARCHIVE_DRY_RUN_FAILED"
pg_restore --list "$archive" >"$toc"
grep -Eq 'TABLE|TABLE DATA' "$toc" || { echo "Backup archive has no table entries" >&2; exit 5; }

checksum="$(sha256sum "$archive" | awk '{print $1}')"
size_bytes="$(wc -c <"$archive" | tr -d ' ')"
failure_stage="UPLOAD_FAILED"
# Retry transient failures inside each SDK request, retaining the multipart upload
# identity. Do not restart the whole upload or run another database dump. Keep
# these settings local to this command; recovery-worker clients are unchanged.
AWS_RETRY_MODE=standard AWS_MAX_ATTEMPTS=8 aws s3 cp "$archive" "s3://$S3_BUCKET_NAME/$object_key" --region "$AWS_REGION" --endpoint-url "$S3_ENDPOINT_URL" --only-show-errors --sse AES256 --metadata "sha256=$checksum,run-id=$run_id,dry-run=passed"
failure_stage="HEAD_VERIFY_FAILED"
remote_size=""
attempt=1
while [ "$attempt" -le 5 ]; do
  if remote_size="$(aws_s3api head-object --bucket "$S3_BUCKET_NAME" --key "$object_key" --query ContentLength --output text 2>/tmp/backup-head-error)"; then break; fi
  [ "$attempt" -eq 5 ] && { cat /tmp/backup-head-error >&2 || true; exit 7; }
  sleep $((attempt*2))
  attempt=$((attempt+1))
done
[ "$remote_size" = "$size_bytes" ] || { echo "Uploaded object size mismatch" >&2; exit 6; }

failure_stage="MONITOR_SUCCESS_NOTIFY_FAILED"
notify SUCCEEDED "$checksum" "$size_bytes"
notified_success=1
echo "Backup completed: run=$run_id bytes=$size_bytes sha256=$checksum"
