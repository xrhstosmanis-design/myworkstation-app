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
    def attempt(self, failure=None):
        operation = str(uuid.uuid4())
        manifest = {'id': 'ISOLATED_WORKER_TEST', 'streaming': True}
        snapshot = {'planHash': hashlib.sha256(worker.compact(manifest).encode()).hexdigest(), 'sourceRevision': '1' * 40, 'scope': {'companyId': 'fixture-company', 'storeId': 'fixture-store', 'mode': 'RESET'}, 'snapshotHash': '2' * 64}
        job = {'protocol': 'MWS_STORE_RECOVERY_JOB_V1', 'operationId': operation, 'schema': 'public', 'snapshotMetadataJson': worker.compact(snapshot), 'schemaDescriptorJson': '{}'}
        queries, uploads, restored = [], {}, []
        def query(sql):
            queries.append(sql)
            if sql == 'SELECT current_schema();': return 'public'
            if sql.startswith('SELECT to_regclass'): return 't'
            if sql.startswith('WITH candidate'): return worker.compact(job)
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
    def test_success_exact_version_and_bound_publication(self): self.attempt()
    def test_disabled_versioning_denies(self): self.attempt('versioning')
    def test_missing_object_version_denies(self): self.attempt('version')
    def test_wrong_encryption_denies(self): self.attempt('encryption')
    def test_corrupt_download_denies_before_restore(self): self.attempt('readback')
    def test_failed_restore_never_publishes(self): self.attempt('restore')
    def test_obsolete_operation_never_revives(self): self.attempt('expired')

if __name__ == '__main__': unittest.main()
