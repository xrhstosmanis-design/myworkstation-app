import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch
import worker
import verify_restore

class ReportsOnlyWorker(unittest.TestCase):
    def test_scoped_recovery_refuses_before_database_or_archive_access(self):
        document = worker.selected_manifest_document({'MWS_STORE_LIFECYCLE_PROFILE': 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V1'})
        self.assertTrue(document['executionDisabled'])
        with self.assertRaisesRegex(ValueError, 'reports-only'):
            verify_restore.verify_archive(None, None, document, None)
        with tempfile.TemporaryDirectory() as directory:
            filename = pathlib.Path(directory) / 'manifest.json'
            filename.write_text(json.dumps(document))
            config = {name: 'SYNTHETIC' for name in ('DATABASE_URL', 'AWS_REGION', 'S3_BUCKET_NAME', 'S3_ENDPOINT_URL')}
            config['BACKUP_MONITOR_SECRET'] = 'SYNTHETIC' * 4
            with patch.dict(worker.os.environ, config), patch.object(worker, 'query', side_effect=AssertionError('unexpected database')):
                self.assertEqual(worker.process_one(filename, None), {'state': 'DISABLED', 'reason': 'REPORTS_ONLY_PROFILE'})


class ReportsOnlyScheduledProcess(unittest.TestCase):
    def test_worker_exit_success_allows_following_cleanup_action(self):
        import subprocess
        import sys
        with tempfile.TemporaryDirectory() as directory:
            script = pathlib.Path(directory) / 'worker_then_cleanup.sh'
            marker = pathlib.Path(directory) / 'cleanup'
            script.write_text('set -e\n"$1" "$2"\nprintf cleanup > "$3"\n')
            environment = dict(worker.os.environ, MWS_STORE_LIFECYCLE_PROFILE='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V1')
            result = subprocess.run(['sh', str(script), sys.executable, worker.__file__, str(marker)], env=environment, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)['state'], 'DISABLED')
            self.assertEqual(marker.read_text(), 'cleanup')


class ReportsOnlyV2ScheduledProcess(unittest.TestCase):
    def test_v2_worker_exit_success_preserves_cleanup_and_denies_scoped_restore(self):
        import subprocess
        import sys
        document = worker.selected_manifest_document({'MWS_STORE_LIFECYCLE_PROFILE': 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V2'})
        self.assertTrue(document['executionDisabled'])
        with self.assertRaisesRegex(ValueError, 'reports-only'):
            verify_restore.verify_archive(None, None, document, None)
        with tempfile.TemporaryDirectory() as directory:
            filename = pathlib.Path(directory) / 'manifest.json'
            filename.write_text(json.dumps(document))
            with patch.object(worker, 'query', side_effect=AssertionError('unexpected database')):
                self.assertEqual(worker.process_one(filename, None), {'state': 'DISABLED', 'reason': 'REPORTS_ONLY_PROFILE'})
            script = pathlib.Path(directory) / 'worker_then_cleanup.sh'
            marker = pathlib.Path(directory) / 'cleanup'
            script.write_text('set -e\n"$1" "$2"\nprintf cleanup > "$3"\n')
            environment = dict(worker.os.environ, MWS_STORE_LIFECYCLE_PROFILE='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V2')
            result = subprocess.run(['sh', str(script), sys.executable, worker.__file__, str(marker)], env=environment, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)['state'], 'DISABLED')
            self.assertEqual(marker.read_text(), 'cleanup')

class ReportsOnlyV3ScheduledProcess(unittest.TestCase):
    def test_v3_worker_exit_success_preserves_cleanup_and_denies_scoped_restore(self):
        document = worker.selected_manifest_document({'MWS_STORE_LIFECYCLE_PROFILE': 'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V3'})
        self.assertTrue(document['executionDisabled'])
        with self.assertRaisesRegex(ValueError, 'reports-only'):
            verify_restore.verify_archive(None, None, document, None)
        with tempfile.TemporaryDirectory() as directory:
            filename = pathlib.Path(directory) / 'manifest.json'
            filename.write_text(json.dumps(document))
            with patch.object(worker, 'query', side_effect=AssertionError('unexpected database')):
                self.assertEqual(worker.process_one(filename, None), {'state': 'DISABLED', 'reason': 'REPORTS_ONLY_PROFILE'})
            import subprocess, sys
            script = pathlib.Path(directory) / 'worker_then_cleanup.sh'
            marker = pathlib.Path(directory) / 'cleanup'
            script.write_text('set -e\n"$1" "$2"\nprintf cleanup > "$3"\n')
            environment = dict(worker.os.environ, MWS_STORE_LIFECYCLE_PROFILE='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V3')
            result = subprocess.run(['sh', str(script), sys.executable, worker.__file__, str(marker)], env=environment, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)['state'], 'DISABLED')
            self.assertEqual(marker.read_text(), 'cleanup')

if __name__ == '__main__':
    unittest.main()
