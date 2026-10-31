import hashlib
import json
import os
import pathlib
import tempfile
import unittest
import uuid
from unittest.mock import patch
import worker

class WorkerContract(unittest.TestCase):
    def attempt(self, failure=None, change_manifest=False):
        operation = str(uuid.uuid4())
        manifest = {'id': 'ISOLATED_WORKER_TEST', 'streaming': True}
        snapshot = {'rowDigestFormat': 'MWS_ROW_MULTISET_SHA256_V1', 'planHash': hashlib.sha256(worker.compact(manifest).encode()).hexdigest(), 'sourceRevision': '1' * 40, 'scope': {'companyId': 'fixture-company', 'storeId': 'fixture-store', 'mode': 'RESET'}, 'snapshotHash': '2' * 64}
        job = {'protocol': 'MWS_STORE_RECOVERY_JOB_V1', 'operationId': operation, 'schema': 'public', 'snapshotMetadataJson': worker.compact(snapshot), 'schemaDescriptorJson': '{}'}
        queries, uploads, restored = [], {}, []
        def query(sql):
            queries.append(sql)
            if sql == 'SELECT current_schema();': return 'public'
            if sql.startswith('CREATE TABLE IF NOT EXISTS') or sql.startswith('INSERT INTO'): return ''
            if sql.startswith('SELECT to_regclass'): return 't'
            if sql.startswith('WITH candidate'):
                self.assertIn('AND e."planHash"=' + worker.literal(snapshot['planHash']), sql.split(') UPDATE ')[0])
                if change_manifest:
                    source.write_text(json.dumps({'id': 'CHANGED_AFTER_ADMISSION'}))
                return worker.compact(job)
            if sql.startswith('UPDATE '): return '' if failure == 'expired' else operation
            self.fail('Unexpected live SQL')
        def run(args, **kwargs):
            self.assertEqual(args[0], 'pg_dump')
            filename = next(a[7:] for a in args if a.startswith('--file='))
            pathlib.Path(filename).write_bytes(b'ISOLATED ARCHIVE TEST BYTES')
        def s3(command, *args):
            if command == 'get-bucket-versioning': return {'Status': 'Disabled' if failure == 'versioning' else 'Enabled'}
            if command == 'get-bucket-encryption': return {}
            if command == 'put-object':
                uploads['bytes'] = pathlib.Path(args[args.index('--body') + 1]).read_bytes()
                uploads['key'] = args[args.index('--key') + 1]
                return {} if failure == 'version' else {'VersionId': 'isolated-version'}
            if command == 'head-object': return {'ContentLength': len(uploads['bytes']), 'ServerSideEncryption': 'none' if failure == 'encryption' else 'AES256', 'Metadata': {'sha256': hashlib.sha256(uploads['bytes']).hexdigest()}}
            if command == 'get-object':
                self.assertEqual(args[args.index('--version-id') + 1], 'isolated-version')
                pathlib.Path(args[-1]).write_bytes(b'CORRUPTED' if failure == 'readback' else uploads['bytes'])
                return {}
            self.fail('Unexpected S3 operation')
        def restore(*args):
            restored.append(True)
            if failure == 'restore': raise ValueError('Isolated failure')
            return {'restoredSnapshotHash': snapshot['snapshotHash'], 'selectiveRestoreVerified': True, 'controlsUnchanged': True, 'fullRestoreAudit': {'dataMatches': True}, 'selectiveRestoreAudit': {'dataMatches': True}}
        env = {k: 'isolated-not-a-real-credential' for k in ('DATABASE_URL', 'AWS_REGION', 'S3_BUCKET_NAME', 'S3_ENDPOINT_URL', 'BACKUP_MONITOR_SECRET')}
        env['RENDER_GIT_COMMIT'] = 'f' * 40
        with tempfile.TemporaryDirectory() as directory:
            source = pathlib.Path(directory) / 'manifest.json'
            source.write_text(json.dumps(manifest))
            with patch.dict(os.environ, env), patch.object(worker, 'query', query), patch.object(worker, 'run', run), patch.object(worker, 's3', s3), patch.object(worker, 'verify_archive', restore):
                if failure:
                    with self.assertRaises(ValueError): worker.process_one(source, 'unused-auditor')
                else:
                    result = worker.process_one(source, 'unused-auditor')
                    self.assertEqual(result['state'], 'VERIFIED')
                    self.assertIn('/' + operation + '/', uploads['key'])
        writes = [q for q in queries if q.startswith('UPDATE ')]
        self.assertEqual(len(writes), 1 if failure in (None, 'expired') else 0)
        if writes:
            self.assertIn('"expiresAt">NOW()', writes[0])
            self.assertIn('"workerLease"' if '"workerLease"' in writes[0] else "'workerLease'", writes[0])
            self.assertIn('"maintenance"', writes[0])
            self.assertIn('"snapshotHash"=', writes[0])
        if failure in ('versioning', 'version', 'encryption', 'readback'):
            self.assertEqual(restored, [])
        self.assertTrue(all(not q.startswith('DELETE') and not q.startswith('ALTER') for q in queries))
    def test_readiness_does_not_enroll_or_queue_a_store(self):
        queries = []
        def query(sql):
            queries.append(sql)
            if sql == 'SELECT current_schema();': return 'public'
            if sql.startswith('SELECT to_regclass'): return 'f'
            if sql.startswith('CREATE TABLE IF NOT EXISTS') or sql.startswith('INSERT INTO'): return ''
            self.fail('Readiness must not lease or mutate store data')
        env = {k: 'isolated-not-a-real-credential' for k in ('DATABASE_URL', 'AWS_REGION', 'S3_BUCKET_NAME', 'S3_ENDPOINT_URL', 'BACKUP_MONITOR_SECRET')}
        env['RENDER_GIT_COMMIT'] = 'f' * 40
        with tempfile.TemporaryDirectory() as directory:
            source = pathlib.Path(directory) / 'manifest.json'
            source.write_text(json.dumps({'id': 'READINESS_FIXTURE', 'streaming': True}))
            with patch.dict(os.environ, env), patch.object(worker, 'query', query), patch.object(worker, 's3', lambda command, *args: {'Status': 'Enabled'} if command == 'get-bucket-versioning' else {}), patch.object(worker, 'verify_archive') as restore:
                self.assertEqual(worker.process_one(source, 'unused')['state'], 'NOT_ENROLLED')
                restore.assert_not_called()
        self.assertTrue(any('StoreLifecycleRuntime' in q and q.startswith('INSERT') for q in queries))
        self.assertFalse(any('StoreLifecycleFence' in q or q.startswith('UPDATE') or q.startswith('WITH') for q in queries))
    def test_closed_profile_selection_preserves_default_and_full_files(self):
        base = worker.selected_manifest_file({})
        self.assertEqual(base, worker.selected_manifest_file({'MWS_STORE_LIFECYCLE_PROFILE': 'BASE'}))
        self.assertEqual(base.name, 'manifest.json')
        full = worker.selected_manifest_file({'MWS_STORE_LIFECYCLE_PROFILE': 'MONTHLY_INVENTORY_CAPTURE_V1'})
        self.assertEqual(full.name, 'monthly-inventory-capture-manifest.proposed.json')
        self.assertEqual(base.parent, full.parent)
        self.assertNotEqual(json.loads(base.read_text()), json.loads(full.read_text()))
    def test_invalid_profiles_refuse_without_database_or_fallback(self):
        with patch.object(worker, 'query', side_effect=AssertionError('Unexpected database')) as query:
            for value in ('', ' ', 'base', 'MONTHLY_INVENTORY_CAPTURE_V1 ', '../manifest.json', 'UNKNOWN', None, 1):
                with self.subTest(value=value), self.assertRaises(ValueError):
                    worker.selected_manifest_file({'MWS_STORE_LIFECYCLE_PROFILE': value})
            query.assert_not_called()
    def test_original_admitted_manifest_is_not_reread_after_lease(self): self.attempt(change_manifest=True)
    def test_success_exact_version_and_bound_publication(self): self.attempt()
    def test_disabled_versioning_denies(self): self.attempt('versioning')
    def test_missing_object_version_denies(self): self.attempt('version')
    def test_wrong_encryption_denies(self): self.attempt('encryption')
    def test_corrupt_download_denies_before_restore(self): self.attempt('readback')
    def test_failed_restore_never_publishes(self): self.attempt('restore')
    def test_obsolete_operation_never_revives(self): self.attempt('expired')

if __name__ == '__main__': unittest.main()
