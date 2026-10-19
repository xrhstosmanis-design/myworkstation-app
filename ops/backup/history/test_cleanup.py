import importlib.util
import json
import os
import pathlib
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('history_cleanup', pathlib.Path(__file__).with_name('cleanup.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CleanupContract(unittest.TestCase):
    def env(self):
        return {'DATABASE_URL': 'postgresql://fixture:private-fixture@localhost/test?schema=history_test&connection_limit=1',
                'ASSISTANT_HISTORY_CLEANUP_ENABLED': 'true', 'BACKUP_MONITOR_SECRET': 'isolated-history-signing-secret', 'RENDER_GIT_COMMIT': 'a' * 40}

    def test_disabled_never_opens_database(self):
        with patch.object(module.subprocess, 'run') as run:
            self.assertEqual(module.cleanup({}), {'state': 'DISABLED'})
            run.assert_not_called()

    def test_missing_schema_and_busy_do_not_publish_false_readiness(self):
        for state in ('UNAVAILABLE', 'BUSY'):
            with patch.object(module.subprocess, 'run', return_value=types.SimpleNamespace(returncode=0, stdout=json.dumps({'state': state}))) as run:
                self.assertEqual(module.cleanup(self.env()), {'state': state})
                self.assertEqual(run.call_count, 1)

    def test_success_publishes_only_domain_separated_metadata_without_secret_arguments(self):
        responses = [types.SimpleNamespace(returncode=0, stdout='{"state":"COMPLETED","erased":2,"deferredScopes":1}'), types.SimpleNamespace(returncode=0, stdout='')]
        with patch.object(module.subprocess, 'run', side_effect=responses) as run:
            self.assertEqual(module.cleanup(self.env())['erased'], 2)
            self.assertEqual(run.call_count, 2)
            first, second = run.call_args_list
            self.assertNotIn('private-fixture', ' '.join(first.args[0]))
            self.assertEqual(first.kwargs['env']['PGDATABASE'], 'test')
            self.assertEqual(first.kwargs['env']['PGPASSWORD'], 'private-fixture')
            connection = first.args[0][-1]
            self.assertNotIn('connection_limit', connection)
            self.assertIn('search_path', connection)
            self.assertIn('assistant-history-cleanup', second.kwargs['input'])
            self.assertIn('MWS_ASSISTANT_HISTORY_RETENTION_V1', second.kwargs['input'])
            self.assertNotIn(self.env()['BACKUP_MONITOR_SECRET'], second.kwargs['input'])

    def test_failure_redacts_sql_and_never_publishes_readiness(self):
        with patch.object(module.subprocess, 'run', return_value=types.SimpleNamespace(returncode=1, stdout='', stderr='private-fixture prose')) as run:
            with self.assertRaisesRegex(ValueError, '^History cleanup unavailable$'):
                module.cleanup(self.env())
            self.assertEqual(run.call_count, 1)

    def test_invalid_schema_and_receipt_refuse(self):
        env = self.env();env['DATABASE_URL'] = 'postgresql://fixture@localhost/test?schema=bad%3BDROP'
        with patch.object(module.subprocess, 'run') as run:
            with self.assertRaises(ValueError): module.cleanup(env)
            run.assert_not_called()
        with patch.object(module.subprocess, 'run', return_value=types.SimpleNamespace(returncode=0, stdout='{"state":"COMPLETED","payload":"private"}')):
            with self.assertRaises(ValueError): module.cleanup(self.env())


if __name__ == '__main__':
    unittest.main()
