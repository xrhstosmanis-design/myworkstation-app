FROM postgres:18-alpine

RUN apk add --no-cache aws-cli curl openssl

WORKDIR /backup
COPY run-backup.sh /backup/run-backup.sh
RUN chmod 0555 /backup/run-backup.sh

ENTRYPOINT ["/backup/run-backup.sh"]
