import datetime, hashlib, hmac, json, os, unittest
from unittest.mock import patch
import worker
import pathlib,tempfile
import backoffice_company_readiness as readiness
from backoffice_company_profile import current_company_manifest,CURRENT_PHASE_HASHES
import verify_restore
class CompanyReadCapability(unittest.TestCase):
 def test_closed_read_signature_is_separate_from_recovery_and_bound_to_phase(self):
  secret='isolated-company-read-worker-secret'; clock=datetime.datetime(2026,11,18,20,tzinfo=datetime.timezone.utc)
  envelope=worker.company_read_capability_envelope('a'*64,'SOURCE','b'*40,secret,clock); value=json.loads(envelope['heartbeatJson'])
  self.assertEqual(list(value),['protocol','manifestHash','workerRevision','scope','scopedRecovery','phase','checkedAt'])
  self.assertEqual(value['protocol'],'MWS_BACKOFFICE_COMPANY_READ_CAPABILITY_V1'); self.assertEqual(value['scope'],'COMPANY_READ_ONLY'); self.assertIs(value['scopedRecovery'],False)
  self.assertEqual(value['checkedAt'],'2026-11-18T20:00:00.000Z'); self.assertFalse({'storagePolicyVerified','rowDigestFormat','operationId','snapshotHash'}&set(value))
  expected=hmac.new(secret.encode(),(value['protocol']+'\n'+envelope['heartbeatJson']).encode(),hashlib.sha256).hexdigest(); self.assertEqual(envelope['mac'],expected)
  recovery=hmac.new(secret.encode(),('MWS_STORE_RECOVERY_CAPABILITY_V1\n'+envelope['heartbeatJson']).encode(),hashlib.sha256).hexdigest(); self.assertNotEqual(envelope['mac'],recovery)
  for phase,digest,revision in [('TARGET','a'*64,'b'*40),('SOURCE','c'*64,'b'*40),('SOURCE','a'*64,'c'*40)]: self.assertNotEqual(envelope['mac'],worker.company_read_capability_envelope(digest,phase,revision,secret,clock)['mac'])
 def test_invalid_phase_revision_hash_clock_secret_fail_before_publication(self):
  valid=['a'*64,'SOURCE','b'*40,'isolated-company-read-worker-secret']
  for index,bad in [(0,'a'*63),(0,'G'*64),(1,'RESET'),(1,'source'),(2,'b'*39),(3,'short')]:
   args=valid.copy();args[index]=bad
   with self.assertRaises(ValueError): worker.company_read_capability_envelope(*args)
  with self.assertRaises(ValueError): worker.company_read_capability_envelope(*valid,checked_at=datetime.datetime(2026,11,18))
 def test_publisher_only_upserts_existing_dedicated_metadata_without_storage_or_recovery(self):
  queries=[]
  with patch.dict(os.environ,{'RENDER_GIT_COMMIT':'b'*40,'BACKUP_MONITOR_SECRET':'isolated-company-read-worker-secret'}),patch.object(worker,'query',side_effect=lambda sql:queries.append(sql)),patch.object(worker,'s3',side_effect=AssertionError('No storage')):
   worker.publish_company_read_capability('public','a'*64,'TARGET')
   with self.assertRaises(ValueError):worker.publish_company_read_capability('other','a'*64,'TARGET')
  self.assertEqual(len(queries),1);self.assertIn("'company-read-worker'",queries[0]);self.assertTrue(queries[0].startswith('INSERT INTO "public"."StoreLifecycleRuntime"'))
  for forbidden in ['CREATE','StoreLifecycleExecution','backup-worker','MWS_STORE_RECOVERY_CAPABILITY_V1']:self.assertNotIn(forbidden,queries[0])
class CompanyReadRouting(unittest.TestCase):
 def test_current_mode_does_not_poll_or_advertise_any_scoped_recovery_job(self):
  source=json.loads((pathlib.Path(worker.__file__).parent/'monthly-inventory-capture-manifest.proposed.json').read_text());target=current_company_manifest(source,'TARGET')
  for phase in ['SOURCE','TARGET']:
   queries=[]
   with tempfile.TemporaryDirectory()as directory:
    path=pathlib.Path(directory)/'manifest.json';path.write_text(worker.compact(target))
    with patch.dict(os.environ,{'DATABASE_URL':'postgresql://isolated.invalid/current_test','MWS_STORE_LIFECYCLE_PROFILE':'BACKOFFICE_COMPANY_CURRENT_CAPTURE_V1','BACKUP_MONITOR_SECRET':'isolated-company-read-worker-secret','RENDER_GIT_COMMIT':'b'*40}),patch.object(readiness,'observe_company_read_state',return_value={'phase':phase,'manifestHash':CURRENT_PHASE_HASHES[phase]}),patch.object(worker,'query',side_effect=lambda sql:queries.append(sql)),patch.object(worker,'s3',side_effect=AssertionError('No storage calls')),patch.object(worker,'publish_capability',side_effect=AssertionError('No legacy recovery capability')):
     result=worker.process_one(path,None)
    self.assertEqual(result['phase'],phase);self.assertIs(result['scopedRecovery'],False);self.assertEqual(len(queries),1);self.assertNotIn('StoreLifecycleExecution',queries[0]);self.assertNotIn('MWS_STORE_RECOVERY',queries[0])
 def test_both_company_phases_reject_scoped_archive_jobs_before_opening_archive(self):
  source=json.loads((pathlib.Path(worker.__file__).parent/'monthly-inventory-capture-manifest.proposed.json').read_text())
  for phase in ['SOURCE','TARGET']:
   with self.assertRaisesRegex(ValueError,'COMPANY read-only'):verify_restore.verify_archive(None,None,current_company_manifest(source,phase),None)
if __name__=='__main__':unittest.main()
