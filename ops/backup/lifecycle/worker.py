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
COMPANY_READ_PROTOCOL = 'MWS_BACKOFFICE_COMPANY_READ_CAPABILITY_V1'

def selected_manifest_file(env=None):
    configuration = os.environ if env is None else env
    profile = configuration.get('MWS_STORE_LIFECYCLE_PROFILE', 'BASE')
    if profile.endswith('__WEEKLY_STOCK_ALARM_V1'):
        from weekly_stock_alarm_profile import weekly_source
        source=weekly_source(profile)
        if source=='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_NO14_V1': source='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V3'
        return selected_manifest_file({'MWS_STORE_LIFECYCLE_PROFILE':source})
    if profile in ('BASE', 'AUTOMATIC_EVENT_REPORTS_V1', 'BACKOFFICE_COMPANY_BASE_V1'):
        filename = 'manifest.json'
    elif profile in ('MONTHLY_INVENTORY_CAPTURE_V1', 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_V1', 'BACKOFFICE_COMPANY_CAPTURE_V1', 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V1', 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V2', 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V3', 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V4', 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V5', 'BACKOFFICE_COMPANY_CURRENT_CAPTURE_V1'):
        filename = 'monthly-inventory-capture-manifest.proposed.json'
    else:
        raise ValueError('Invalid store lifecycle profile')
    return pathlib.Path(__file__).resolve().parent / filename


def selected_manifest_document(env=None):
    configuration = os.environ if env is None else env
    if configuration.get('MWS_STORE_LIFECYCLE_PROFILE','').endswith('__WEEKLY_STOCK_ALARM_V1'):
        from weekly_stock_alarm_profile import weekly_manifest
        return weekly_manifest(configuration['MWS_STORE_LIFECYCLE_PROFILE'],selected_manifest_document)
    document = json.loads(selected_manifest_file(configuration).read_text())
    profile = configuration.get('MWS_STORE_LIFECYCLE_PROFILE', 'BASE')
    if profile == 'BACKOFFICE_COMPANY_CURRENT_CAPTURE_V1':
        from backoffice_company_profile import current_company_manifest
        return current_company_manifest(document, 'TARGET')
    if profile in ('BACKOFFICE_COMPANY_BASE_V1', 'BACKOFFICE_COMPANY_CAPTURE_V1'):
        from backoffice_company_profile import company_manifest
        return company_manifest(document, 'BASE' if profile == 'BACKOFFICE_COMPANY_BASE_V1' else 'CAPTURE')
    if profile not in ('AUTOMATIC_EVENT_REPORTS_V1', 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_V1', 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V1', 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V2', 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V3', 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V4', 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V5'):
        return document
    extension_file = pathlib.Path(__file__).resolve().parent / 'automatic-report-consent-extension.proposed.json'
    extension = json.loads(extension_file.read_text())
    if extension.get('format') != 'MWS_AUTOMATIC_REPORT_CONSENT_EXTENSION_V1':
        raise ValueError('Invalid report consent lifecycle definition')
    layouts = (
        ('AutomaticReportSupplierComparisonConsent', document['knownColumns']['AutomaticReportRecipientConsent']),
        ('AutomaticReportEventConsent', extension['columns']),
    )
    for name, columns in layouts:
        if name in document['knownTables'] or name in document['knownColumns'] or any(table['name'] == name for table in document['tables']):
            raise ValueError('Report consent lifecycle table is already declared')
        document['knownTables'].append(name)
        document['knownColumns'][name] = columns
        document['tables'].append({'name': name, 'owner': {'kind': 'DIRECT'}, 'reset': 'REMOVE'})
        document['reviewedColumns'].extend(name + '.' + column for column in ('recipientId', 'consentedBy', 'revokedBy', 'updatedBy'))
    document['id'] += '__AUTOMATIC_EVENT_REPORTS_V1'
    document['valueGuards'].append({'table': 'AutomaticReportEventConsent', 'column': 'reportType', 'allowed': ['PROMOTION_RESULT', 'INVENTORY_RESULT']})
    if profile in ('MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V1', 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V2', 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V3', 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V4', 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V5'):
        operational = json.loads((pathlib.Path(__file__).resolve().parent / 'report-operational-compatibility.proposed.json').read_text())
        document['id'] += '__REPORTS_ONLY_OPERATIONAL_V1'
        document['executionDisabled'] = True
        document['preservedOperationalTables'] = [table['name'] for table in operational['tables']]
        document['reviewedColumns'].extend(operational['reviewedColumns'])
        for table in operational['tables']:
            if table['name'] in document['knownTables']:
                raise ValueError('Operational report table already declared')
            document['knownTables'].append(table['name'])
            document['knownColumns'][table['name']] = table['columns']
        stock = next(table for table in document['tables'] if table['name'] == 'StoreProduct')
        stock['existingTriggers'] = stock.get('existingTriggers', []) + [operational['packageTrigger']]
    if profile in ('MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V2', 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V3', 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V4', 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V5'):
        columns = json.loads((pathlib.Path(__file__).resolve().parent / 'report-column-compatibility.proposed.json').read_text())
        document['id'] += '__REVIEWED_REPORT_COLUMNS_V1'
        document['reviewedColumnExtensions'] = [table['name'] + '.' + column[0] for table in columns['tables'] for column in table['columns']]
        for table in columns['tables']:
            document['knownColumns'][table['name']].extend(table['columns'])
        document['reviewedColumns'].extend(columns['reviewedColumns'])
    if profile in ('MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V3', 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V4', 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V5'):
        chat = json.loads((pathlib.Path(__file__).resolve().parent / 'report-chat-compatibility.proposed.json').read_text())
        document['id'] += '__REVIEWED_REPORT_CHAT_V1'
        document['preservedReportChatTables'] = [table['name'] for table in chat['tables']]
        document['preservedOperationalTables'].extend(document['preservedReportChatTables'])
        document['reviewedColumns'].extend(chat['reviewedColumns'])
        for table in chat['tables']:
            if table['name'] in document['knownTables']:
                raise ValueError('Report chat table already declared')
            document['knownTables'].append(table['name'])
            document['knownColumns'][table['name']] = table['columns']
    if profile in ('MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V4', 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V5'):
        definition_bytes = (pathlib.Path(__file__).resolve().parent / 'report-security-profile.proposed.json').read_bytes()
        definition_hash = '467ebede27b7b9b8e0aefddfb274b5c32e89a0a056f65eb4e7443c42f651a074'
        source_hash = '54ceb10a4383faf7367d07bd3b8ad1c066b85c025a23e937c610d1f473423828'
        stage_a_hash = 'bb105475e3e14a3425d4fc67e5b2d855ee4c23f8c161d4c688bae5bbceca203f'
        if hashlib.sha256(definition_bytes).hexdigest() != definition_hash or hashlib.sha256(compact(document).encode()).hexdigest() != source_hash:
            raise ValueError('Report security profile differs from its immutable source')
        definition = json.loads(definition_bytes)
        stage_a_bytes = (pathlib.Path(__file__).resolve().parent / 'report-security-compatibility.proposed.json').read_bytes()
        if definition.get('sourcePlanHash') != source_hash or definition.get('stageADefinitionSha256') != stage_a_hash or hashlib.sha256(stage_a_bytes).hexdigest() != stage_a_hash:
            raise ValueError('Report security definition differs')
        name = definition['table']
        if name in document['knownTables'] or name in document['knownColumns'] or any(table['name'] == name for table in document['tables']):
            raise ValueError('Report security table already declared')
        document['id'] += '__REVIEWED_REPORT_SECURITY_V1'
        document['preservedReportSecurityTables'] = [name]
        document['knownTables'].append(name)
        document['knownColumns'][name] = definition['columns']
        document['reviewedColumns'].extend(definition['reviewedColumns'])
        document['reportSecurityCompatibility'] = {'format': definition['format'], 'definitionSha256': definition_hash}
    if profile == 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V5':
        guard = next(guard for guard in document['valueGuards']
                     if guard['table'] == 'AutomaticReportEventConsent' and guard['column'] == 'reportType')
        guard['allowed'].append('MONTHLY_INVENTORY_SUMMARY')
        document['id'] += '__MONTHLY_INVENTORY_SUMMARY_V1'

    return document


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

def company_read_capability_envelope(manifest_hash, phase, revision, secret, checked_at=None):
    """A separate signed read capability; it conveys no storage/recovery proof."""
    if phase not in ('SOURCE', 'TARGET') or not isinstance(manifest_hash, str) or len(manifest_hash) != 64 or any(c not in '0123456789abcdef' for c in manifest_hash):
        raise ValueError('Invalid company read phase binding')
    if not isinstance(revision, str) or len(revision) != 40 or any(c not in '0123456789abcdef' for c in revision) or not isinstance(secret, str) or len(secret) < 24:
        raise ValueError('Company read signing configuration unavailable')
    clock = datetime.datetime.now(datetime.timezone.utc) if checked_at is None else checked_at
    if not isinstance(clock, datetime.datetime) or clock.tzinfo is None or clock.utcoffset() != datetime.timedelta(0):
        raise ValueError('Company read clock must be UTC')
    heartbeat = compact({'protocol': COMPANY_READ_PROTOCOL, 'manifestHash': manifest_hash, 'workerRevision': revision, 'scope': 'COMPANY_READ_ONLY', 'scopedRecovery': False, 'phase': phase, 'checkedAt': clock.isoformat(timespec='milliseconds').replace('+00:00', 'Z')})
    mac = hmac.new(secret.encode(), (COMPANY_READ_PROTOCOL + '\n' + heartbeat).encode(), hashlib.sha256).hexdigest()
    return {'heartbeatJson': heartbeat, 'mac': mac}


def publish_company_read_capability(schema, manifest_hash, phase):
    # Caller must first validate the exact reviewed current catalogue and guards.
    # This uses the existing metadata table only; it neither bootstraps schema
    # nor calls storage nor advertises the recovery protocol.
    if schema != 'public':
        raise ValueError('Company read schema differs')
    envelope = company_read_capability_envelope(manifest_hash, phase, os.environ.get('RENDER_GIT_COMMIT', ''), os.environ.get('BACKUP_MONITOR_SECRET', ''))
    query('INSERT INTO ' + ident(schema) + '."StoreLifecycleRuntime" ("id","heartbeatJson","mac") VALUES(' + literal('company-read-worker') + ',' + literal(envelope['heartbeatJson']) + ',' + literal(envelope['mac']) + ') ON CONFLICT("id") DO UPDATE SET "heartbeatJson"=EXCLUDED."heartbeatJson","mac"=EXCLUDED."mac";')
    return envelope


def process_company_read(manifest):
    from backoffice_company_profile import current_company_manifest
    from backoffice_company_readiness import observe_company_read_state
    source = json.loads((pathlib.Path(__file__).resolve().parent / 'monthly-inventory-capture-manifest.proposed.json').read_text())
    if manifest != current_company_manifest(source, 'TARGET') or manifest.get('purpose') != 'COMPANY_READ_ONLY':
        raise ValueError('Current company target selection differs')
    if not os.environ.get('DATABASE_URL') or len(os.environ.get('BACKUP_MONITOR_SECRET', '')) < 24:
        raise ValueError('Current company signing configuration unavailable')
    # Independently verify native phase/catalogue/guards before signing. The
    # returned phase hash comes from reviewed policy, never from caller input.
    state = observe_company_read_state(query)
    publish_company_read_capability('public', state['manifestHash'], state['phase'])
    return {'state': 'COMPANY_READ_READY', **state, 'scope': 'COMPANY_READ_ONLY', 'scopedRecovery': False}


def process_one(manifest_file, audit_module):
    manifest = json.loads(pathlib.Path(manifest_file).read_text())
    if manifest.get('purpose') == 'COMPANY_READ_ONLY' or os.environ.get('MWS_STORE_LIFECYCLE_PROFILE') == 'BACKOFFICE_COMPANY_CURRENT_CAPTURE_V1':
        return process_company_read(manifest)
    if manifest.get('executionDisabled') is True:
        return {'state': 'DISABLED', 'reason': 'REPORTS_ONLY_PROFILE'}
    os.umask(0o077)
    for key in ('DATABASE_URL', 'AWS_REGION', 'S3_BUCKET_NAME', 'S3_ENDPOINT_URL', 'BACKUP_MONITOR_SECRET'):
        if not os.environ.get(key):
            raise ValueError('Required worker configuration missing')
    if len(os.environ['BACKUP_MONITOR_SECRET']) < 24:
        raise ValueError('Invalid worker signing configuration')
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
        document = selected_manifest_document()
        with tempfile.TemporaryDirectory(prefix='mws-selected-profile-') as directory:
            manifest_file = pathlib.Path(directory) / 'manifest.json'
            manifest_file.write_text(compact(document))
            print(compact(process_one(manifest_file, here / 'store-lifecycle-verify-copy.py')))
    except Exception as error:
        # No exception text, SQL, business rows, filenames, endpoints or secrets.
        print(compact({'state': 'FAILED', 'error': type(error).__name__}), file=sys.stderr)
        sys.exit(1)
