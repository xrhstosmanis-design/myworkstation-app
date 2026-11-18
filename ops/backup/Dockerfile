ARG POSTGRES_IMAGE=postgres:18-alpine
FROM ${POSTGRES_IMAGE}

RUN apk add --no-cache aws-cli curl openssl python3

WORKDIR /backup
ENV MWS_COMPANY_SOURCE_ROOT=/backup/company-source
COPY ops/backup/run-backup.sh /backup/run-backup.sh
COPY ops/backup/run-jobs.sh /backup/run-jobs.sh
COPY ops/backup/entrypoint.sh /backup/entrypoint.sh
COPY ops/backup/lifecycle /backup/lifecycle
# Keep the reviewed source paths intact for the explicit COMPANY verifier.
# These are data/source files only; the backup image does not execute Node.
COPY ops/backup/lifecycle /backup/company-source/ops/backup/lifecycle
COPY server/src/services/store-lifecycle-executor.js \
     server/src/services/automatic-report-operational-profile.js \
     server/src/services/automatic-report-source-compatibility.js \
     server/src/services/store-lifecycle-worker-ready.js \
     server/src/services/store-lifecycle-manifest.js \
     server/src/services/backoffice-company-profile.js \
     server/src/services/backoffice-company-installation-proof.js \
     server/src/services/backoffice-company-installation.js \
     server/src/services/monthly-inventory-capture-schema.js \
     server/src/services/monthly-inventory-capture-authorization.js \
     server/src/services/monthly-inventory-capture-status.js \
     /backup/company-source/server/src/services/
COPY server/scripts/store-lifecycle-verify-copy.py /backup/company-source/server/scripts/store-lifecycle-verify-copy.py
COPY ops/backup/history /backup/history
COPY server/scripts/store-lifecycle-verify-copy.py /backup/lifecycle/store-lifecycle-verify-copy.py
RUN chmod 0555 /backup/run-backup.sh /backup/run-jobs.sh /backup/entrypoint.sh

ENTRYPOINT ["/backup/entrypoint.sh"]
