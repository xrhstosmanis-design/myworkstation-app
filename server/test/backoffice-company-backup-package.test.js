import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {mkdtemp,mkdir,copyFile,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {selectedStoreLifecycleManifest} from '../src/services/store-lifecycle-manifest.js';
const root=new URL('../../',import.meta.url),packetPath='ops/backup/lifecycle/backoffice-company-compatibility.proposed.json';
const profiles=['BASE','MONTHLY_INVENTORY_CAPTURE_V1','AUTOMATIC_EVENT_REPORTS_V1','MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_V1','BACKOFFICE_COMPANY_BASE_V1','BACKOFFICE_COMPANY_CAPTURE_V1','BACKOFFICE_COMPANY_CURRENT_CAPTURE_V1'];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const env={BACKUP_MONITOR_SECRET:'isolated-package-proof-signing-secret',RENDER_GIT_COMMIT:'a'.repeat(40),AWS_REGION:'fixture-region',S3_BUCKET_NAME:'fixture-private',S3_ENDPOINT_URL:'https://fixture.invalid',PYTHONDONTWRITEBYTECODE:'1'};
const probe=`import sys,json,hashlib,pathlib,importlib.util,datetime,os
sys.path.insert(0,sys.argv[1])
import worker,company_source_root
from verify_restore import compact
expected=json.load(sys.stdin)
root=company_source_root.source_root()
packet=json.loads(company_source_root.source_file('${packetPath}').read_text())
assert packet['sourceHashes']==expected['sourceHashes']
assert len(packet['sourceHashes'])==45
for name,digest in packet['sourceHashes'].items(): assert hashlib.sha256(company_source_root.source_file(name).read_bytes()).hexdigest()==digest,name
actual={p:hashlib.sha256(compact(worker.selected_manifest_document({'MWS_STORE_LIFECYCLE_PROFILE':p})).encode()).hexdigest() for p in expected['profiles']}
assert actual==expected['profiles']
assert hashlib.sha256(compact(worker.selected_manifest_document({})).encode()).hexdigest()==expected['profiles']['BASE']
spec=importlib.util.spec_from_file_location('packaged_company_producer',pathlib.Path(sys.argv[1])/'company-installation-backup.py')
producer=importlib.util.module_from_spec(spec);spec.loader.exec_module(producer)
assert producer.ROOT==root
assert callable(producer.auditor_module().compare)
for profile in ['BASE','CAPTURE','CURRENT_CAPTURE']:
 variant=next(v for v in packet['variants'] if v['profile']==profile)
 now=producer.utc_now()
 request={'protocol':producer.REQUEST,'requestId':'12345678-1234-4567-89ab-123456789abc','sourceRevision':'a'*40,'workerRevision':'a'*40,'profile':profile,'sourcePlanHash':hashlib.sha256(compact(json.loads(company_source_root.source_file(variant['sourceManifest']).read_text())).encode()).hexdigest(),'targetPlanHash':variant['proposedPlanHash'],'schema':'public','observerSha256':producer.file_sha(producer.OBSERVER),'sourceObservationSha256':'0'*64,'sourceOwnershipSha256':'0'*64,'fullDataDigest':'0'*64,'storageIdentity':producer.storage_identity(),'issuedAt':producer.canonical_stamp(now-datetime.timedelta(seconds=1)),'expiresAt':producer.canonical_stamp(now+datetime.timedelta(minutes=1))}
 if profile=='CURRENT_CAPTURE':
  request['sourcePlanHash']=variant['sourceManifestHash'];request={key:value for item in request.items() for key,value in ([item,('sourceFencePlanHash',variant['sourceFencePlanHash'])] if item[0]=='sourcePlanHash' else [item])}
 text=compact(request);assert producer.parse_request({'requestJson':text,'mac':producer.signature(producer.REQUEST,text)})==request
assert not os.environ.get('DATABASE_URL'),'Package probe must not be given database credentials'
`;
const rejectProbe=String.raw`
def refused(call,match=None):
 try: call()
 except (ValueError,FileNotFoundError) as error:
  if match: assert match in str(error),str(error)
  return
 raise AssertionError('Unsafe relocated source path or tampered runtime copy was admitted')
for path in ['../escape','/etc/passwd','ops//backup/lifecycle/manifest.json','ops/./backup/lifecycle/manifest.json']:
 refused(lambda path=path:company_source_root.source_file(path))
original=os.environ['MWS_COMPANY_SOURCE_ROOT'];os.environ['MWS_COMPANY_SOURCE_ROOT']='relative';refused(company_source_root.source_root);os.environ['MWS_COMPANY_SOURCE_ROOT']=original
outside=root.parent/'outside-source-test.txt';outside.write_text('outside');link=root/'escape-test.txt';link.symlink_to(outside)
try: refused(lambda:company_source_root.source_file('escape-test.txt'))
finally: link.unlink();outside.unlink()
for path in [pathlib.Path(producer.__file__),producer.OBSERVER,pathlib.Path(company_source_root.__file__),pathlib.Path(sys.argv[1])/'backoffice_company_profile.py']:
 original_bytes=path.read_bytes();path.write_bytes(original_bytes+b'\n# altered-runtime-copy\n')
 try:
  if path.name=='backoffice_company_profile.py': refused(lambda:worker.selected_manifest_document({'MWS_STORE_LIFECYCLE_PROFILE':'BACKOFFICE_COMPANY_BASE_V1'}),'differs')
  else: refused(lambda:producer.parse_request({}),'differs')
 finally: path.write_bytes(original_bytes)
print('RELOCATED_COMPANY_PACKAGE_PASS')
`;
async function expected(){const packet=JSON.parse(await readFile(new URL(packetPath,root),'utf8'));return {sourceHashes:packet.sourceHashes,profiles:Object.fromEntries(profiles.map(profile=>[profile,hash(selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:profile}))]))}}
function verify(result){assert.equal(result.status,0,(result.stderr||result.stdout||String(result.error)).slice(-8000));return result.stdout}

test('relocated company worker source package resolves all forty bound files and rejects escaping or altered runtime copies',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'company-worker-package-')),source=join(directory,'company-source'),runtime=join(directory,'runtime');
 try{
  const values=await expected();
  for(const relative of [...Object.keys(values.sourceHashes),packetPath]){const destination=join(source,relative);await mkdir(dirname(destination),{recursive:true});await copyFile(new URL(relative,root),destination)}
  await cp(new URL('ops/backup/lifecycle/',root),runtime,{recursive:true,filter:path=>!String(path).includes('__pycache__')});
  const result=spawnSync('python3',['-c',probe+rejectProbe,runtime],{encoding:'utf8',input:JSON.stringify(values),env:{...process.env,...env,DATABASE_URL:'',MWS_COMPANY_SOURCE_ROOT:source},timeout:30000,maxBuffer:16000});assert.match(verify(result),/RELOCATED_COMPANY_PACKAGE_PASS/);
 }finally{await rm(directory,{recursive:true,force:true})}
});

test('actual production recovery Docker image imports the company producer and pairs seven profiles with all bound source bytes',{skip:!process.env.MWS_LIFECYCLE_RECOVERY_IMAGE&&!process.env.CI?'Actual production recovery image unavailable locally':false,timeout:90000},async()=>{
 assert.ok(process.env.MWS_LIFECYCLE_RECOVERY_IMAGE,'CI must build the actual ops/backup/Dockerfile image first');
 const args=['run','--rm','-i','--network=none','--memory=256m','--pids-limit=40',...Object.entries(env).flatMap(([key,value])=>['--env',key+'='+value]),'--env','DATABASE_URL=','--entrypoint','python3',process.env.MWS_LIFECYCLE_RECOVERY_IMAGE,'-c',probe+"\nprint('ACTUAL_COMPANY_DOCKER_PACKAGE_PASS')",'/backup/lifecycle'];
 const result=spawnSync('docker',args,{input:JSON.stringify(await expected()),encoding:'utf8',timeout:80000,maxBuffer:16000});assert.match(verify(result),/ACTUAL_COMPANY_DOCKER_PACKAGE_PASS/);
});
