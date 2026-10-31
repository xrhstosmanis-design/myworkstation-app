"""One bounded recovery job on the existing backup service. No live business DELETE.

Uses the existing private, encrypted, versioned backup bucket. A receipt is
published only after version-specific readback, real full restore, selective
RESET/undo and whole-database controls. All temporary plaintext is removed.
"""
import datetime
import hashlib
import hmac
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import uuid
from verify_restore import compact, ident, literal, verify_archive, ROW_DIGEST_FORMAT

PROTOCOL = 'MWS_STORE_RECOVERY_PROOF_V1'

def selected_manifest_file(env=None):
    configuration = os.environ if env is None else env
    profile = configuration.get('MWS_STORE_LIFECYCLE_PROFILE', 'BASE')
    if profile == 'BASE':
        filename = 'manifest.json'
    elif profile == 'MONTHLY_INVENTORY_CAPTURE_V1':
        filename = 'monthly-inventory-capture-manifest.proposed.json'
    else:
        raise ValueError('Invalid store lifecycle profile')
    return pathlib.Path(__file__).resolve().parent / filename

def run(args, **kwargs):
    result = subprocess.run(args, timeout=300, stderr=subprocess.PIPE, **kwargs)
    if result.returncode:
        raise ValueError('Recovery subprocess failed: ' + pathlib.Path(args[0]).name)
    return result

def query(sql):
    return run(['psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '--dbname', os.environ['DATABASE_URL']], input=sql.encode(), stdout=subprocess.PIPE).stdout.decode().strip()

def s3(*args):
    result = run(['aws', 's3api', *args, '--region', os.environ['AWS_REGION'], '--endpoint-url', os.environ['S3_ENDPOINT_URL'], '--output', 'json'], stdout=subprocess.PIPE)
    return json.loads(result.stdout or b'{}')

def file_sha(filename):
    digest = hashlib.sha256()
    with open(filename, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()

def publish_capability(schema, manifest_hash):
    revision = os.environ.get('RENDER_GIT_COMMIT', '')
    if len(revision) != 40 or any(c not in '0123456789abcdef' for c in revision):
        raise ValueError('Verified recovery worker revision unavailable')
    bucket = os.environ['S3_BUCKET_NAME']
    if s3('get-bucket-versioning', '--bucket', bucket).get('Status') != 'Enabled':
        raise ValueError('Versioned recovery storage required')
    s3('get-bucket-encryption', '--bucket', bucket)
    heartbeat = compact({'protocol': 'MWS_STORE_RECOVERY_CAPABILITY_V1', 'manifestHash': manifest_hash, 'workerRevision': revision, 'storagePolicyVerified': True, 'rowDigestFormat': ROW_DIGEST_FORMAT, 'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()})
    mac = hmac.new(os.environ['BACKUP_MONITOR_SECRET'].encode(), ('MWS_STORE_RECOVERY_CAPABILITY_V1\n' + heartbeat).encode(), hashlib.sha256).hexdigest()
    # Global service-readiness metadata only; no store enrollment or business rows.
    query('CREATE TABLE IF NOT EXISTS ' + ident(schema) + '."StoreLifecycleRuntime" ("id" text PRIMARY KEY,"heartbeatJson" text NOT NULL,"mac" text NOT NULL);')
    query('INSERT INTO ' + ident(schema) + '."StoreLifecycleRuntime" ("id","heartbeatJson","mac") VALUES(' + literal('backup-worker') + ',' + literal(heartbeat) + ',' + literal(mac) + ') ON CONFLICT("id") DO UPDATE SET "heartbeatJson"=EXCLUDED."heartbeatJson","mac"=EXCLUDED."mac";')

def process_one(manifest_file, audit_module):
    os.umask(0o077)
    for key in ('DATABASE_URL', 'AWS_REGION', 'S3_BUCKET_NAME', 'S3_ENDPOINT_URL', 'BACKUP_MONITOR_SECRET'):
        if not os.environ.get(key):
            raise ValueError('Required worker configuration missing')
    if len(os.environ['BACKUP_MONITOR_SECRET']) < 24:
        raise ValueError('Invalid worker signing configuration')
    manifest = json.loads(pathlib.Path(manifest_file).read_text())
    manifest_hash = hashlib.sha256(compact(manifest).encode()).hexdigest()
    schema = query('SELECT current_schema();')
    publish_capability(schema, manifest_hash)
    if query('SELECT to_regclass(' + literal(ident(schema) + '."StoreLifecycleExecution"') + ') IS NOT NULL;') != 't':
        return {'state': 'NOT_ENROLLED'}
    lease = str(uuid.uuid4())
    # Atomic lease; re-runs cannot overwrite an existing completed proof. The
    # cron service itself also guarantees a single scheduled run at a time.
    sql = '''WITH candidate AS (
 SELECT e."id" FROM {s}."StoreLifecycleExecution" e JOIN {s}."StoreLifecycleFence" f ON f."storeId"=e."storeId" AND f."companyId"=e."companyId"
 WHERE e."state"='PREPARED' AND e."mode"='RESET' AND e."expiresAt">NOW() AND f."maintenance" AND NOT f."retired" AND f."operationId"=e."id" AND f."planHash"=e."planHash" AND e."planHash"={manifest_hash}
 AND e."result"->'recoveryRequest' IS NOT NULL AND e."result"->'recoveryProof' IS NULL
 AND (e."result"->>'workerLeaseExpiresAt' IS NULL OR (e."result"->>'workerLeaseExpiresAt')::timestamptz<NOW())
 ORDER BY e."expiresAt" LIMIT 1 FOR UPDATE OF e SKIP LOCKED
 ) UPDATE {s}."StoreLifecycleExecution" e SET "result"=e."result"||jsonb_build_object('workerLease',{lease},'workerLeaseExpiresAt',NOW()+INTERVAL '11 minutes') FROM candidate c WHERE e."id"=c."id"
 RETURNING (e."result"->'recoveryRequest')::text;'''.format(s=ident(schema), lease=literal(lease), manifest_hash=literal(manifest_hash))
    raw = query(sql)
    if not raw:
        return {'state': 'IDLE'}
    job = json.loads(raw)
    operation = str(uuid.UUID(job['operationId']))
    if job['schema'] != schema or operation != job['operationId']:
        raise ValueError('Worker scope differs')
    snapshot = json.loads(job['snapshotMetadataJson'])
    if snapshot['planHash'] != manifest_hash or snapshot['scope']['mode'] != 'RESET':
        raise ValueError('Worker manifest differs')
    bucket = os.environ['S3_BUCKET_NAME']
    if s3('get-bucket-versioning', '--bucket', bucket).get('Status') != 'Enabled':
        raise ValueError('Versioned recovery storage required')
    s3('get-bucket-encryption', '--bucket', bucket)
    object_key = 'myworkstation/lifecycle/' + operation + '/' + lease + '.dump'
    with tempfile.TemporaryDirectory(prefix='mws-lifecycle-job-') as directory:
        archive, downloaded = [str(pathlib.Path(directory) / name) for name in ('archive.dump', 'readback.dump')]
        run(['pg_dump', '--format=custom', '--lock-wait-timeout=10s', '--compress=6', '--no-owner', '--no-privileges', '--file=' + archive, os.environ['DATABASE_URL']], stdout=subprocess.DEVNULL, env={**os.environ, 'PGOPTIONS': '-c TimeZone=UTC -c DateStyle=ISO,YMD -c extra_float_digits=3 -c bytea_output=hex'})
        checksum, size = file_sha(archive), os.path.getsize(archive)
        if not size:
            raise ValueError('Empty recovery archive')
        uploaded = s3('put-object', '--bucket', bucket, '--key', object_key, '--body', archive, '--server-side-encryption', 'AES256', '--metadata', compact({'sha256': checksum, 'operation-id': operation}))
        version = uploaded.get('VersionId')
        if not isinstance(version, str) or not version or version == 'null':
            raise ValueError('Missing immutable object version')
        head = s3('head-object', '--bucket', bucket, '--key', object_key, '--version-id', version)
        if head.get('ContentLength') != size or head.get('ServerSideEncryption') != 'AES256' or head.get('Metadata', {}).get('sha256') != checksum:
            raise ValueError('Stored recovery metadata differs')
        s3('get-object', '--bucket', bucket, '--key', object_key, '--version-id', version, downloaded)
        if os.path.getsize(downloaded) != size or file_sha(downloaded) != checksum:
            raise ValueError('Version-specific recovery readback differs')
        restored = verify_archive(downloaded, job, manifest, audit_module)
        proof = {'protocol': PROTOCOL, 'operationId': operation, 'sourceRevision': snapshot['sourceRevision'], 'manifestHash': snapshot['planHash'], **snapshot['scope'], 'snapshotHash': snapshot['snapshotHash'], 'rowDigestFormat': ROW_DIGEST_FORMAT, **restored, 'artifactSha256': checksum, 'sizeBytes': size, 'objectKey': object_key, 'objectVersion': version, 'storageReadbackVerified': True, 'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'workerRevision': os.environ.get('RENDER_GIT_COMMIT', 'UNKNOWN')}
        proof_json = compact(proof)
        mac = hmac.new(os.environ['BACKUP_MONITOR_SECRET'].encode(), (PROTOCOL + '\n' + proof_json).encode(), hashlib.sha256).hexdigest()
        envelope = compact({'proofJson': proof_json, 'mac': mac})
        # An abort, expiration, replaced fence or concurrent preparation wins;
        # a completed private restore alone cannot revive an obsolete operation.
        updated = query('UPDATE ' + ident(schema) + '."StoreLifecycleExecution" e SET "result"=e."result"||jsonb_build_object(\'recoveryProof\',' + literal(envelope) + '::jsonb) WHERE e."id"=' + literal(operation) + ' AND e."state"=\'PREPARED\' AND e."expiresAt">NOW() AND e."snapshotHash"=' + literal(snapshot['snapshotHash']) + ' AND e."result"->>\'workerLease\'=' + literal(lease) + ' AND EXISTS(SELECT 1 FROM ' + ident(schema) + '."StoreLifecycleFence" f WHERE f."storeId"=e."storeId" AND f."companyId"=e."companyId" AND f."maintenance" AND NOT f."retired" AND f."operationId"=e."id" AND f."planHash"=e."planHash") RETURNING e."id";')
        if updated != operation:
            raise ValueError('Recovery completed for obsolete preparation')
        return {'state': 'VERIFIED', 'operationId': operation, 'artifactSha256': checksum}

if __name__ == '__main__':
    try:
        here = pathlib.Path(__file__).resolve().parent
        print(compact(process_one(selected_manifest_file(), here / 'store-lifecycle-verify-copy.py')))
    except Exception as error:
        # No exception text, SQL, business rows, filenames, endpoints or secrets.
        print(compact({'state': 'FAILED', 'error': type(error).__name__}), file=sys.stderr)
        sys.exit(1)
