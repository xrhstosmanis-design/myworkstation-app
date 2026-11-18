"""Explicit isolated company-installation backup candidate. Never scheduled/import-run.

Live connections execute SELECT and pg_dump only. Restores connect exclusively
through PrivatePostgres's new Unix socket. No migration, grant, RESET or SQL
writes to the source database are supported.
"""
import argparse
import datetime
import hashlib
import hmac
import importlib.util
import json
import os
import pathlib
import re
import subprocess
import tempfile
import uuid
from worker import run, query, s3, file_sha
from verify_restore import compact, PrivatePostgres
from company_source_root import source_root, source_file, verify_runtime_copy

HERE = pathlib.Path(__file__).resolve().parent
ROOT = source_root()
OBSERVER = HERE / 'company-installation-observe.sql'
REQUEST = 'MWS_BACKOFFICE_COMPANY_INSTALL_BACKUP_REQUEST_V1'
PROOF = 'MWS_BACKOFFICE_COMPANY_INSTALL_BACKUP_PROOF_V1'
REQUEST_KEYS = ['protocol', 'requestId', 'sourceRevision', 'workerRevision', 'profile', 'sourcePlanHash', 'targetPlanHash', 'schema', 'observerSha256', 'sourceObservationSha256', 'sourceOwnershipSha256', 'fullDataDigest', 'storageIdentity', 'issuedAt', 'expiresAt']
OPTIONS = '-c TimeZone=UTC -c DateStyle=ISO,YMD -c extra_float_digits=3 -c bytea_output=hex'


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc)


def stamp(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z', value):
        raise ValueError('Invalid protocol clock')
    return datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))


def canonical_stamp(value):
    return value.isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def signing_secret():
    value = os.environ.get('BACKUP_MONITOR_SECRET', '')
    if len(value) < 24:
        raise ValueError('Signing configuration unavailable')
    return value


def signature(protocol, text):
    return hmac.new(signing_secret().encode(), (protocol + '\n' + text).encode(), hashlib.sha256).hexdigest()


def storage_identity():
    bucket, region, endpoint = [os.environ.get(name, '') for name in ('S3_BUCKET_NAME', 'AWS_REGION', 'S3_ENDPOINT_URL')]
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]', bucket) or not re.fullmatch(r'[a-z0-9-]{1,64}', region) or not re.fullmatch(r'https://[a-z0-9.-]+(?::[0-9]{1,5})?/?', endpoint):
        raise ValueError('Storage identity unavailable')
    return sha(compact({'bucket': bucket, 'region': region, 'endpoint': endpoint.rstrip('/')}))


def parse_request(envelope):
    verify_runtime_copy(__file__, 'ops/backup/lifecycle/company-installation-backup.py')
    verify_runtime_copy(OBSERVER, 'ops/backup/lifecycle/company-installation-observe.sql')
    if not isinstance(envelope, dict) or set(envelope) != {'requestJson', 'mac'} or not isinstance(envelope['requestJson'], str) or len(envelope['requestJson'].encode()) > 8192 or not isinstance(envelope['mac'], str) or not re.fullmatch('[a-f0-9]{64}', envelope['mac']) or not hmac.compare_digest(signature(REQUEST, envelope['requestJson']), envelope['mac']):
        raise ValueError('Request authentication refused')
    value = json.loads(envelope['requestJson'])
    if not isinstance(value, dict) or list(value) != REQUEST_KEYS or compact(value) != envelope['requestJson']:
        raise ValueError('Noncanonical request')
    now = utc_now()
    if value['protocol'] != REQUEST or str(uuid.UUID(value['requestId'], version=4)) != value['requestId'] or value['profile'] not in ('BASE', 'CAPTURE') or value['schema'] != 'public':
        raise ValueError('Request scope differs')
    for name in ('sourceRevision', 'workerRevision', 'sourcePlanHash', 'targetPlanHash', 'observerSha256', 'sourceObservationSha256', 'sourceOwnershipSha256', 'fullDataDigest', 'storageIdentity'):
        if not isinstance(value[name], str) or not re.fullmatch('[a-f0-9]{' + ('40' if name.endswith('Revision') else '64') + '}', value[name]):
            raise ValueError('Invalid request binding')
    issued, expires = stamp(value['issuedAt']), stamp(value['expiresAt'])
    if issued > now + datetime.timedelta(seconds=30) or expires <= now or expires <= issued or expires - issued > datetime.timedelta(minutes=30):
        raise ValueError('Request expired')
    packet = json.loads(source_file('ops/backup/lifecycle/backoffice-company-compatibility.proposed.json').read_text())
    if packet['executionEnabled'] is not False or packet['productionActivated'] is not False:
        raise ValueError('Unexpected preparation packet')
    for name, digest in packet['sourceHashes'].items():
        if file_sha(source_file(name)) != digest:
            raise ValueError('Reviewed source differs')
    variant = next(v for v in packet['variants'] if v['profile'] == value['profile'])
    source = json.loads(source_file(variant['sourceManifest']).read_text())
    if value['storageIdentity'] != storage_identity() or sha(compact(source)) != value['sourcePlanHash'] or variant['proposedPlanHash'] != value['targetPlanHash'] or file_sha(OBSERVER) != value['observerSha256'] or os.environ.get('RENDER_GIT_COMMIT') != value['workerRevision']:
        raise ValueError('Worker/profile differs')
    return value


def auditor_module():
    spec = importlib.util.spec_from_file_location('company_copy_audit', source_file('server/scripts/store-lifecycle-verify-copy.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def dump_data(filename):
    with open(filename, 'wb') as output:
        os.chmod(filename, 0o600)
        run(['pg_dump', '--data-only', '--no-owner', '--no-privileges', os.environ['DATABASE_URL']], stdout=output, env={**os.environ, 'PGOPTIONS': OPTIONS})


def observation(metadata, data_file, request, auditor):
    if metadata.get('schema') != request['schema'] or metadata.get('nonFinalOperations') != 0 or not metadata.get('fences'):
        raise ValueError('Source is not drained')
    for fence in metadata['fences']:
        if fence.get('planHash') != request['sourcePlanHash'] or fence.get('maintenance') is not False or fence.get('retired') is not False or fence.get('operationId') is not None:
            raise ValueError('Source profile/fence differs')
    if not re.fullmatch('[a-f0-9]{64}', metadata.get('accountSecurityDigest', '')):
        raise ValueError('Account policy digest unavailable')
    ownership = {'relations': metadata.pop('sourceOwnership'), 'functions': metadata.pop('sourceFunctionOwnership'), 'types': metadata.pop('sourceTypeOwnership')}
    # compare(file,file) uses the real bounded COPY multiset/sequence auditor.
    data_digest = auditor.compare(data_file, data_file)['sha256']
    return {'sourceObservationSha256': sha(compact({'metadata': metadata, 'fullDataDigest': data_digest})), 'sourceOwnershipSha256': sha(compact(ownership)), 'fullDataDigest': data_digest}


def observe_source(directory, label, request, auditor):
    metadata = json.loads(query("BEGIN READ ONLY; SET LOCAL TimeZone='UTC'; SET LOCAL DateStyle='ISO,YMD'; SET LOCAL extra_float_digits=3; SET LOCAL bytea_output='hex';\n" + OBSERVER.read_text() + '\nCOMMIT;'))
    filename = pathlib.Path(directory) / (label + '.sql')
    dump_data(filename)
    return observation(metadata, filename, request, auditor)


def restore_archive(archive, directory, request, auditor):
    # Private cluster must be directly under the accessible temp parent; never
    # chmod a source archive directory for the postgres system account.
    private = tempfile.TemporaryDirectory(prefix='mws-company-private-restore-')
    root = pathlib.Path(private.name)
    try:
        expected, restored = root / 'expected.sql', root / 'restored.sql'
        # Keep parent-owned output descriptors; no plaintext becomes world-readable.
        with open(expected, 'wb') as output:
            os.chmod(expected, 0o600)
            run(['pg_restore', '--data-only', '--no-owner', '--no-privileges', '--file=-', str(archive)], stdout=output)
        with PrivatePostgres(root) as pg:
            with open(archive, 'rb') as source:
                pg.run(['pg_restore', '--exit-on-error', '--no-owner', '--no-privileges', '--dbname=postgres'], stdin=source, stdout=subprocess.DEVNULL)
            with open(restored, 'wb') as output:
                os.chmod(restored, 0o600)
                pg.run(['pg_dump', '--data-only', '--no-owner', '--no-privileges', 'postgres'], stdout=output)
            audit = auditor.compare(expected, restored)
            metadata = json.loads(pg.query(OBSERVER.read_text()))
            observed = observation(metadata, restored, request, auditor)
        if observed['fullDataDigest'] != audit['sha256']:
            raise ValueError('Full restore digest differs')
        return observed
    finally:
        private.cleanup()


def assert_binding(observed, request):
    if observed['sourceObservationSha256'] != request['sourceObservationSha256'] or observed['sourceOwnershipSha256'] != request['sourceOwnershipSha256'] or observed['fullDataDigest'] != request['fullDataDigest']:
        raise ValueError('Fresh source observation differs')


def check_storage_policy():
    bucket = os.environ['S3_BUCKET_NAME']
    if s3('get-bucket-versioning', '--bucket', bucket).get('Status') != 'Enabled':
        raise ValueError('Immutable versioned storage required')
    encryption = s3('get-bucket-encryption', '--bucket', bucket)
    if not any(rule.get('ApplyServerSideEncryptionByDefault', {}).get('SSEAlgorithm') == 'AES256' for rule in encryption.get('ServerSideEncryptionConfiguration', {}).get('Rules', [])):
        raise ValueError('Encrypted storage required')
    privacy = s3('get-public-access-block', '--bucket', bucket).get('PublicAccessBlockConfiguration', {})
    if any(privacy.get(key) is not True for key in ('BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets')) or s3('get-bucket-policy-status', '--bucket', bucket).get('PolicyStatus', {}).get('IsPublic') is not False:
        raise ValueError('Private storage required')
    return bucket


def run_backup(request_envelope, *, authorized=False):
    if authorized is not True:
        raise ValueError('Explicit candidate backup authorization required')
    os.umask(0o077)
    request = parse_request(request_envelope)
    for name in ('DATABASE_URL', 'AWS_REGION', 'S3_BUCKET_NAME', 'S3_ENDPOINT_URL'):
        if not os.environ.get(name):
            raise ValueError('Worker configuration unavailable')
    bucket = check_storage_policy()
    auditor = auditor_module()
    with tempfile.TemporaryDirectory(prefix='mws-company-install-backup-') as directory:
        before = observe_source(directory, 'before', request, auditor)
        assert_binding(before, request)
        archive, readback = [pathlib.Path(directory) / name for name in ('archive.dump', 'readback.dump')]
        run(['pg_dump', '--format=custom', '--lock-wait-timeout=10s', '--compress=6', '--no-owner', '--no-privileges', '--file=' + str(archive), os.environ['DATABASE_URL']], stdout=subprocess.DEVNULL, env={**os.environ, 'PGOPTIONS': OPTIONS})
        checksum, size = file_sha(archive), archive.stat().st_size
        if not 0 < size <= 1024 ** 4:
            raise ValueError('Archive size refused')
        key = 'myworkstation/company-installation/' + request['requestId'] + '/' + str(uuid.uuid4()) + '.dump'
        uploaded = s3('put-object', '--bucket', bucket, '--key', key, '--body', str(archive), '--server-side-encryption', 'AES256', '--metadata', compact({'sha256': checksum, 'request-sha256': sha(request_envelope['requestJson'])}))
        version = uploaded.get('VersionId')
        if not isinstance(version, str) or not version or version == 'null' or len(version) > 512 or re.search(r'[\x00-\x1f\x7f]', version):
            raise ValueError('Immutable object version unavailable')
        head = s3('head-object', '--bucket', bucket, '--key', key, '--version-id', version)
        if head.get('ContentLength') != size or head.get('ServerSideEncryption') != 'AES256' or head.get('Metadata', {}).get('sha256') != checksum or head.get('Metadata', {}).get('request-sha256') != sha(request_envelope['requestJson']):
            raise ValueError('Immutable object metadata differs')
        s3('get-object', '--bucket', bucket, '--key', key, '--version-id', version, str(readback))
        if readback.stat().st_size != size or file_sha(readback) != checksum:
            raise ValueError('Version-specific bytes differ')
        restored = restore_archive(readback, directory, request, auditor)
        if restored['sourceObservationSha256'] != request['sourceObservationSha256'] or restored['fullDataDigest'] != before['fullDataDigest']:
            raise ValueError('Restored catalogue/global/security/data differ')
        after = observe_source(directory, 'after', request, auditor)
        assert_binding(after, request)
        if after != before:
            raise ValueError('Source changed during backup')
        # Reauthenticate expiry/profile/source hashes after all external work.
        parse_request(request_envelope)
        proof = {'protocol': PROOF, 'requestSha256': sha(request_envelope['requestJson']), 'sourceObservationSha256': before['sourceObservationSha256'], 'sourceOwnershipSha256': before['sourceOwnershipSha256'], 'storageIdentity': request['storageIdentity'], 'restoredObservationSha256': restored['sourceObservationSha256'], 'fullDataDigest': restored['fullDataDigest'], 'artifactSha256': checksum, 'sizeBytes': size, 'objectKey': key, 'objectVersion': version, 'workerRevision': request['workerRevision'], 'verifiedAt': canonical_stamp(utc_now())}
        proof_json = compact(proof)
        return {'proofJson': proof_json, 'mac': signature(PROOF, proof_json)}


def prepare_request(profile, source_revision):
    if profile not in ('BASE', 'CAPTURE') or not re.fullmatch('[a-f0-9]{40}', source_revision or ''):
        raise ValueError('Explicit source/profile required')
    packet = json.loads(source_file('ops/backup/lifecycle/backoffice-company-compatibility.proposed.json').read_text())
    variant = next(v for v in packet['variants'] if v['profile'] == profile)
    source = json.loads(source_file(variant['sourceManifest']).read_text())
    now = utc_now()
    request = {'protocol': REQUEST, 'requestId': str(uuid.uuid4()), 'sourceRevision': source_revision, 'workerRevision': os.environ.get('RENDER_GIT_COMMIT'), 'profile': profile, 'sourcePlanHash': sha(compact(source)), 'targetPlanHash': variant['proposedPlanHash'], 'schema': 'public', 'observerSha256': file_sha(OBSERVER), 'sourceObservationSha256': '0' * 64, 'sourceOwnershipSha256': '0' * 64, 'fullDataDigest': '0' * 64, 'storageIdentity': storage_identity(), 'issuedAt': canonical_stamp(now), 'expiresAt': canonical_stamp(now + datetime.timedelta(minutes=30))}
    # Verify source/worker/profile before any potentially expensive observation.
    raw = compact(request)
    parse_request({'requestJson': raw, 'mac': signature(REQUEST, raw)})
    with tempfile.TemporaryDirectory(prefix='mws-company-prepare-') as directory:
        observed = observe_source(directory, 'prepare', request, auditor_module())
    request.update(observed)
    raw = compact(request)
    envelope = {'requestJson': raw, 'mac': signature(REQUEST, raw)}
    parse_request(envelope)
    return envelope


def consume_backed_proof(request_envelope, proof_envelope):
    request = parse_request(request_envelope)
    if not isinstance(proof_envelope, dict) or set(proof_envelope) != {'proofJson', 'mac'} or not isinstance(proof_envelope['proofJson'], str) or len(proof_envelope['proofJson'].encode()) > 8192 or not isinstance(proof_envelope['mac'], str) or not hmac.compare_digest(signature(PROOF, proof_envelope['proofJson']), proof_envelope['mac']):
        raise ValueError('Proof authentication refused')
    proof = json.loads(proof_envelope['proofJson'])
    expected_keys = ['protocol', 'requestSha256', 'sourceObservationSha256', 'sourceOwnershipSha256', 'storageIdentity', 'restoredObservationSha256', 'fullDataDigest', 'artifactSha256', 'sizeBytes', 'objectKey', 'objectVersion', 'workerRevision', 'verifiedAt']
    if not isinstance(proof, dict) or list(proof) != expected_keys or compact(proof) != proof_envelope['proofJson'] or proof['protocol'] != PROOF or proof['requestSha256'] != sha(request_envelope['requestJson']) or any(proof[key] != request[key] for key in ('sourceObservationSha256', 'sourceOwnershipSha256', 'storageIdentity', 'fullDataDigest', 'workerRevision')) or proof['restoredObservationSha256'] != request['sourceObservationSha256']:
        raise ValueError('Proof request binding differs')
    verified = stamp(proof['verifiedAt'])
    if verified < stamp(request['issuedAt']) or verified >= stamp(request['expiresAt']) or verified > utc_now() + datetime.timedelta(seconds=30) or utc_now() - verified > datetime.timedelta(minutes=10):
        raise ValueError('Proof expired')
    if not isinstance(proof['artifactSha256'], str) or not re.fullmatch('[a-f0-9]{64}', proof['artifactSha256']) or type(proof['sizeBytes']) is not int or not 0 < proof['sizeBytes'] <= 1024 ** 4 or not isinstance(proof['objectVersion'], str) or not proof['objectVersion'] or proof['objectVersion'] == 'null' or len(proof['objectVersion']) > 512 or re.search(r'[\x00-\x1f\x7f]', proof['objectVersion']) or not isinstance(proof['objectKey'], str) or not re.fullmatch('myworkstation/company-installation/' + request['requestId'] + '/[a-f0-9-]{36}\\.dump', proof['objectKey']):
        raise ValueError('Immutable proof object differs')
    if str(uuid.UUID(proof['objectKey'].split('/')[-1][:-5], version=4)) != proof['objectKey'].split('/')[-1][:-5]:
        raise ValueError('Immutable proof object name differs')
    bucket = check_storage_policy()
    head = s3('head-object', '--bucket', bucket, '--key', proof['objectKey'], '--version-id', proof['objectVersion'])
    if head.get('ContentLength') != proof['sizeBytes'] or head.get('ServerSideEncryption') != 'AES256' or head.get('Metadata', {}).get('sha256') != proof['artifactSha256'] or head.get('Metadata', {}).get('request-sha256') != proof['requestSha256']:
        raise ValueError('Immutable proof object readback differs')
    with tempfile.TemporaryDirectory(prefix='mws-company-consume-') as directory:
        archive = pathlib.Path(directory) / 'readback.dump'
        s3('get-object', '--bucket', bucket, '--key', proof['objectKey'], '--version-id', proof['objectVersion'], str(archive))
        if archive.stat().st_size != proof['sizeBytes'] or file_sha(archive) != proof['artifactSha256']:
            raise ValueError('Immutable proof bytes differ')
        observed = observe_source(directory, 'consume', request, auditor_module())
        assert_binding(observed, request)
    parse_request(request_envelope)
    return observed


def main():
    parser = argparse.ArgumentParser(description='Inactive company installation backup candidate; no migrations.')
    parser.add_argument('--request')
    parser.add_argument('--proof')
    parser.add_argument('--prepare', action='store_true')
    parser.add_argument('--profile', choices=('BASE', 'CAPTURE'))
    parser.add_argument('--source-revision')
    parser.add_argument('--output', required=True)
    parser.add_argument('--authorize-isolated-installation-backup', action='store_true')
    args = parser.parse_args()
    if not args.authorize_isolated_installation_backup:
        parser.error('Explicit backup authorization flag required')
    if args.prepare:
        if args.request or args.proof:
            parser.error('Preparation cannot consume receipts')
        envelope = prepare_request(args.profile, args.source_revision)
    else:
        if not args.request or args.profile or args.source_revision:
            parser.error('Exact signed request required')
        request = json.loads(pathlib.Path(args.request).read_text())
        envelope = consume_backed_proof(request, json.loads(pathlib.Path(args.proof).read_text())) if args.proof else run_backup(request, authorized=True)
    # No stdout proof, SQL, rows, credentials or source environment values.
    descriptor = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as output:
        output.write(compact(envelope) + '\n')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(compact({'state': 'REFUSED', 'error': type(error).__name__}), file=__import__('sys').stderr)
        raise SystemExit(1)
