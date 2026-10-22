FROM postgres:18-alpine
RUN apk add --no-cache python3
WORKDIR /staging-restore
COPY ops/staging-restore/restore.py /staging-restore/restore.py
RUN chmod 0555 /staging-restore/restore.py
ENTRYPOINT ["python3", "/staging-restore/restore.py"]
CMD ["validate"]
