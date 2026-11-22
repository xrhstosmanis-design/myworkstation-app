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
     server/src/services/supplier-expected-receipts-lifecycle-profile.js \
     server/src/services/supplier-expected-receipts-lifecycle-inspection.js \
     server/src/services/supplier-expected-receipts-compatibility-definition.js \
     server/src/services/supplier-expected-receipts-compatibility.js \
     server/src/services/automatic-report-operational-profile.js \
     server/src/services/automatic-report-security-transition.js \
     server/src/services/automatic-report-security-compatibility.js \
     server/src/services/automatic-report-column-compatibility.js \
     server/src/services/automatic-report-chat-compatibility.js \
     server/src/services/automatic-report-source-compatibility.js \
     server/src/services/backoffice-company-current-capture.js \
     server/src/services/backoffice-company-read-worker-ready.js \
     server/src/services/automatic-report-consent-inspection.js \
     server/src/services/automatic-report-event-schema.js \
     server/src/services/ai-owner-wallet-schema.js \
     server/src/services/ftext-cash-schema.js \
     server/src/services/monthly-inventory-snapshot-schema.js \
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
COPY server/scripts/backoffice-company-current-default-review.mjs /backup/company-source/server/scripts/backoffice-company-current-default-review.mjs
COPY server/src/chat-interactions.mjs /backup/company-source/server/src/chat-interactions.mjs
COPY server/scripts/backoffice-company-current-guard-review.mjs /backup/company-source/server/scripts/backoffice-company-current-guard-review.mjs
COPY server/src/backoffice-staff-bootstrap.js server/src/commercial-bootstrap.js /backup/company-source/server/src/
COPY server/src/routes/purchase-orders.js server/src/routes/store-table-orders.js /backup/company-source/server/src/routes/
COPY server/test/fixtures/ftext-full-schema-metadata-20261024.json /backup/company-source/server/test/fixtures/ftext-full-schema-metadata-20261024.json
COPY ops/backup/history /backup/history
COPY server/scripts/store-lifecycle-verify-copy.py /backup/lifecycle/store-lifecycle-verify-copy.py
RUN chmod 0555 /backup/run-backup.sh /backup/run-jobs.sh /backup/entrypoint.sh

ENTRYPOINT ["/backup/entrypoint.sh"]
