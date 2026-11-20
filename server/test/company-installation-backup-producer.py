"""Isolated producer boundary regressions. No network/database commands execute."""
import importlib.util
import json
import datetime
import hashlib
import os
import pathlib
import shutil
import sys
import tempfile
import unittest
from copy import deepcopy
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'ops/backup/lifecycle'))
spec = importlib.util.spec_from_file_location('company_backup_candidate', ROOT / 'ops/backup/lifecycle/company-installation-backup.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class ProducerBoundaries(unittest.TestCase):
    def exercise(self, failure=None):
        request = {'requestId': '12345678-1234-4567-89ab-123456789abc', 'sourceObservationSha256': 'a'*64, 'sourceOwnershipSha256': 'b'*64, 'fullDataDigest': 'c'*64, 'workerRevision': 'd'*40, 'storageIdentity': 'e'*64}
        observed = {key: request[key] for key in ('sourceObservationSha256', 'sourceOwnershipSha256', 'fullDataDigest')}
        envelope = {'requestJson': '{}', 'mac': 'fixture-only'}
        events, uploaded = [], {}

        def source(_directory, label, _request, _auditor):
            events.append(label)
            return {**observed, **({'fullDataDigest': '0'*64} if failure == label else {})}

        def run(args, **_options):
            self.assertEqual(args[0], 'pg_dump')
            self.assertIn('--format=custom', args)
            events.append('dump')
            pathlib.Path(next(arg.removeprefix('--file=') for arg in args if arg.startswith('--file='))).write_bytes(b'isolated-archive')

        def s3(action, *args):
            events.append(action)
            values = list(args)
            if action == 'get-bucket-versioning': return {'Status': 'Suspended' if failure == 'versioning' else 'Enabled'}
            if action == 'get-bucket-encryption': return {'ServerSideEncryptionConfiguration': {'Rules': [{'ApplyServerSideEncryptionByDefault': {'SSEAlgorithm': 'AES256'}}]}}
            if action == 'get-public-access-block': return {'PublicAccessBlockConfiguration': {key: failure != 'privacy' for key in ('BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets')}}
            if action == 'get-bucket-policy-status': return {'PolicyStatus': {'IsPublic': False}}
            if action == 'put-object':
                uploaded['file'] = pathlib.Path(values[values.index('--body')+1])
                uploaded['metadata'] = json.loads(values[values.index('--metadata')+1])
                return {'VersionId': 'null' if failure == 'missing-version' else 'exact-version'}
            if action in ('head-object', 'get-object'):
                self.assertEqual(values[values.index('--version-id')+1], 'exact-version')
                if action == 'head-object': return {'ContentLength': uploaded['file'].stat().st_size, 'ServerSideEncryption': 'AES256', 'Metadata': {**uploaded['metadata'], **({'sha256': '0'*64} if failure == 'head' else {})}}
                shutil.copyfile(uploaded['file'], values[-1])
                if failure == 'bytes': pathlib.Path(values[-1]).write_bytes(b'wrong')
                return {}
            self.fail('Unexpected S3 action '+action)

        def restore(*_args):
            events.append('private-restore')
            if failure == 'restore-error': raise ValueError('actual private restore failed')
            return {**observed, **({'sourceObservationSha256': '0'*64} if failure == 'restore' else {})}

        def signature(protocol, text):
            events.append('sign')
            self.assertEqual(events[-2], 'after')
            return 'e'*64

        environment = {'DATABASE_URL': 'fixture-no-connection', 'AWS_REGION': 'fixture', 'S3_BUCKET_NAME': 'fixture-private', 'S3_ENDPOINT_URL': 'https://fixture.invalid'}
        with patch.dict(os.environ, environment), patch.object(worker, 'parse_request', side_effect=[request, ValueError('Request expired after restore')] if failure == 'expired' else None, return_value=request) as parsed, patch.object(worker, 'observe_source', side_effect=source), patch.object(worker, 'restore_archive', side_effect=restore), patch.object(worker, 'auditor_module', return_value=object()), patch.object(worker, 'run', side_effect=run), patch.object(worker, 's3', side_effect=s3), patch.object(worker, 'signature', side_effect=signature):
            if failure:
                with self.assertRaises(ValueError): worker.run_backup(envelope, authorized=True)
                self.assertNotIn('sign', events)
            else:
                result = worker.run_backup(envelope, authorized=True)
                self.assertEqual(parsed.call_count, 2, 'Request must be reauthenticated after all work')
                proof = json.loads(result['proofJson'])
                self.assertEqual(proof['fullDataDigest'], request['fullDataDigest'])
                self.assertEqual(proof['objectVersion'], 'exact-version')
                self.assertLess(events.index('get-object'), events.index('private-restore'))
                self.assertLess(events.index('private-restore'), events.index('after'))
                self.assertEqual(events[-1], 'sign')

    def test_signs_only_after_version_specific_bytes_private_restore_and_fresh_source(self): self.exercise()
    def test_each_failed_evidence_boundary_prevents_any_proof(self):
        for failure in ('versioning', 'privacy', 'before', 'missing-version', 'head', 'bytes', 'restore-error', 'restore', 'after', 'expired'):
            with self.subTest(failure=failure): self.exercise(failure)
    def test_no_authorization_stops_before_source_or_external_access(self):
        with patch.object(worker, 'parse_request', side_effect=AssertionError('No parse/source expected')):
            for authorized in (False, None, 1, 'true'):
                with self.assertRaises(ValueError): worker.run_backup({}, authorized=authorized)

    def test_real_copy_digest_binds_global_rows_sequences_catalogue_and_account_policy(self):
        auditor = worker.auditor_module()
        metadata = {'schema': 'public', 'nonFinalOperations': 0, 'fences': [{'planHash': 'f'*64, 'maintenance': False, 'retired': False, 'operationId': None}], 'accountSecurityDigest': 'e'*64, 'sourceOwnership': [['GlobalPolicy', 'owner', None]], 'sourceFunctionOwnership': [], 'sourceTypeOwnership': [], 'typeDefinitions': [['PolicyState', 'e', ['OPEN', 'CLOSED']]], 'columns': [['GlobalPolicy', 'policy', 'jsonb', True]], 'guards': [['GlobalPolicy', 'guard', 'reviewed body']]}
        request = {'schema': 'public', 'sourcePlanHash': 'f'*64}
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / 'data.sql'
            data = b'COPY public."GlobalPolicy" (id, policy) FROM stdin;\naccount\t["stores.read"]\naccount2\t[]\n\\.\nSELECT pg_catalog.setval(\'public.policy_seq\', 2, true);\n'
            path.write_bytes(data)
            original = worker.observation(deepcopy(metadata), path, request, auditor)
            for changed in (data.replace(b'stores.read', b'customers.read'), data.replace(b', 2, true', b', 3, true'), data.replace(b'account2\t[]\n', b'')):
                path.write_bytes(changed)
                observed = worker.observation(deepcopy(metadata), path, request, auditor)
                self.assertNotEqual(observed['fullDataDigest'], original['fullDataDigest'])
                self.assertNotEqual(observed['sourceObservationSha256'], original['sourceObservationSha256'])
            path.write_bytes(data)
            for key in ('accountSecurityDigest', 'columns', 'guards', 'typeDefinitions'):
                changed = deepcopy(metadata)
                changed[key] = 'changed'
                if key == 'accountSecurityDigest': changed[key] = '0'*64
                self.assertNotEqual(worker.observation(changed, path, request, auditor)['sourceObservationSha256'], original['sourceObservationSha256'])

    def consume(self, failure=None):
        now = worker.utc_now()
        request = {'requestId': '12345678-1234-4567-89ab-123456789abc', 'sourceObservationSha256': 'a'*64, 'sourceOwnershipSha256': 'b'*64, 'fullDataDigest': 'c'*64, 'storageIdentity': 'd'*64, 'workerRevision': 'e'*40, 'issuedAt': worker.canonical_stamp(now-datetime.timedelta(seconds=1)), 'expiresAt': worker.canonical_stamp(now+datetime.timedelta(minutes=5))}
        envelope = {'requestJson': '{}', 'mac': 'fixture-only'}
        data = b'previously-verified-native-dump'
        proof = {'protocol': worker.PROOF, 'requestSha256': worker.sha(envelope['requestJson']), 'sourceObservationSha256': request['sourceObservationSha256'], 'sourceOwnershipSha256': request['sourceOwnershipSha256'], 'storageIdentity': request['storageIdentity'], 'restoredObservationSha256': request['sourceObservationSha256'], 'fullDataDigest': request['fullDataDigest'], 'artifactSha256': hashlib.sha256(data).hexdigest(), 'sizeBytes': len(data), 'objectKey': 'myworkstation/company-installation/'+request['requestId']+'/12345678-1234-4567-89ab-123456789abc.dump', 'objectVersion': 'exact-version', 'workerRevision': request['workerRevision'], 'verifiedAt': worker.canonical_stamp(now)}
        if failure == 'signed-digest': proof['fullDataDigest'] = '0'*64
        if failure == 'expired': proof['verifiedAt'] = worker.canonical_stamp(now-datetime.timedelta(minutes=15))
        observed = {key: request[key] for key in ('sourceObservationSha256', 'sourceOwnershipSha256', 'fullDataDigest')}
        if failure == 'source': observed['sourceObservationSha256'] = '0'*64
        actions = []
        def s3(action, *args):
            actions.append(action)
            args = list(args)
            if action == 'get-bucket-versioning': return {'Status': 'Enabled'}
            if action == 'get-bucket-encryption': return {'ServerSideEncryptionConfiguration': {'Rules': [{'ApplyServerSideEncryptionByDefault': {'SSEAlgorithm': 'AES256'}}]}}
            if action == 'get-public-access-block': return {'PublicAccessBlockConfiguration': {key: True for key in ('BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets')}}
            if action == 'get-bucket-policy-status': return {'PolicyStatus': {'IsPublic': False}}
            self.assertIn(action, ('head-object', 'get-object'))
            self.assertEqual(args[args.index('--version-id')+1], 'exact-version', 'Never consume latest object version')
            if action == 'head-object': return {'ContentLength': len(data), 'ServerSideEncryption': 'AES256', 'Metadata': {'sha256': '0'*64 if failure == 'head' else proof['artifactSha256'], 'request-sha256': proof['requestSha256']}}
            pathlib.Path(args[-1]).write_bytes(b'changed' if failure == 'bytes' else data)
            return {}
        with patch.dict(os.environ, {'BACKUP_MONITOR_SECRET': 'isolated-consume-proof-test-secret', 'S3_BUCKET_NAME': 'fixture-private'}), patch.object(worker, 'parse_request', return_value=request) as parsed, patch.object(worker, 's3', side_effect=s3), patch.object(worker, 'auditor_module', return_value=object()), patch.object(worker, 'observe_source', return_value=observed):
            text = worker.compact(proof)
            signed = {'proofJson': text, 'mac': '0'*64 if failure == 'mac' else worker.signature(worker.PROOF, text)}
            if failure:
                with self.assertRaises(ValueError): worker.consume_backed_proof(envelope, signed)
                if failure in ('mac', 'signed-digest', 'expired'): self.assertEqual(actions, [])
            else:
                self.assertEqual(worker.consume_backed_proof(envelope, signed), observed)
                self.assertEqual(parsed.call_count, 2)
                self.assertIn('get-object', actions)

    def test_consumer_reads_only_signed_exact_version_and_fresh_source(self): self.consume()
    def test_consumer_refuses_signed_drift_tamper_and_failed_fresh_readback(self):
        for failure in ('mac', 'signed-digest', 'expired', 'head', 'bytes', 'source'):
            with self.subTest(failure=failure): self.consume(failure)


if __name__ == '__main__': unittest.main()
