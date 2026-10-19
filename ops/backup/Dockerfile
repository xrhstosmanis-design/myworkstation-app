FROM postgres:18-alpine

RUN apk add --no-cache aws-cli curl openssl python3

WORKDIR /backup
COPY ops/backup/run-backup.sh /backup/run-backup.sh
COPY ops/backup/run-jobs.sh /backup/run-jobs.sh
COPY ops/backup/entrypoint.sh /backup/entrypoint.sh
COPY ops/backup/lifecycle /backup/lifecycle
COPY server/scripts/store-lifecycle-verify-copy.py /backup/lifecycle/store-lifecycle-verify-copy.py
RUN chmod 0555 /backup/run-backup.sh /backup/run-jobs.sh /backup/entrypoint.sh

ENTRYPOINT ["/backup/entrypoint.sh"]
