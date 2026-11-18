import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {companyInstallationStorageIdentity,signCompanyInstallationBackupRequest,validateCompanyInstallationBackupRequest,validateCompanyInstallationBackupProof} from '../src/services/backoffice-company-installation-proof.js';
import {verifyBackofficeCompanyCompatibility} from '../src/services/backoffice-company-compatibility.js';
const REQUEST='MWS_BACKOFFICE_COMPANY_INSTALL_BACKUP_REQUEST_V1',PROOF='MWS_BACKOFFICE_COMPANY_INSTALL_BACKUP_PROOF_V1';
const storage={bucket:'fixture-private',region:'fixture-region',endpoint:'https://fixture.invalid'};
const secret='isolated-installation-proof-fixture-secret',now=Date.parse('2026-11-18T12:00:00.000Z'),hash=value=>createHash('sha256').update(value).digest('hex');
const refuse=fn=>assert.throws(fn,{code:'COMPANY_INSTALL_BACKUP_REFUSED'});
const signed=(protocol,value,key)=>{const text=JSON.stringify(value);return {[key]:text,mac:createHmac('sha256',secret).update(protocol+'\n'+text).digest('hex')}};
function fixture(profile='CAPTURE'){
 const variant=verifyBackofficeCompanyCompatibility().variants.find(v=>v.profile===profile);
 const input={protocol:REQUEST,requestId:'12345678-1234-4567-89ab-123456789abc',sourceRevision:'a'.repeat(40),workerRevision:'b'.repeat(40),profile,sourcePlanHash:variant.sourcePlanHash,targetPlanHash:variant.proposedPlanHash,schema:'public',observerSha256:hash(readFileSync(new URL('../../ops/backup/lifecycle/company-installation-observe.sql',import.meta.url))),sourceObservationSha256:'c'.repeat(64),sourceOwnershipSha256:'d'.repeat(64),fullDataDigest:'e'.repeat(64),storageIdentity:companyInstallationStorageIdentity(storage),issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+600000).toISOString()};
 const requestEnvelope=signCompanyInstallationBackupRequest(input,{secret,now,storage});
 const proof={protocol:PROOF,requestSha256:hash(requestEnvelope.requestJson),sourceObservationSha256:input.sourceObservationSha256,sourceOwnershipSha256:input.sourceOwnershipSha256,storageIdentity:input.storageIdentity,restoredObservationSha256:input.sourceObservationSha256,fullDataDigest:input.fullDataDigest,artifactSha256:'f'.repeat(64),sizeBytes:1234,objectKey:'myworkstation/company-installation/'+input.requestId+'/12345678-1234-4567-89ab-123456789abc.dump',objectVersion:'immutable-fixture-version',workerRevision:input.workerRevision,verifiedAt:new Date(now).toISOString()};
 return {input,requestEnvelope,proof,options:{secret,requestEnvelope,now,storage}};
}

test('separate company installation request/proof binds exact prepared BASE and CAPTURE pairs without granting execution',()=>{
 for(const profile of ['BASE','CAPTURE']){
  const f=fixture(profile),request=validateCompanyInstallationBackupRequest(f.requestEnvelope,{secret,now,storage}),proof=validateCompanyInstallationBackupProof(signed(PROOF,f.proof,'proofJson'),f.options);
  assert.deepEqual(request,f.input);assert.equal(Object.isFrozen(request),true);assert.equal(Object.isFrozen(proof),true);assert.deepEqual(proof.request,f.input);
  for(const key of ['executionEnabled','executionAuthorized','productionActivated','mode','state'])assert.equal(Object.hasOwn(proof,key),false);
 }
});

test('request reader rejects tampering, unknown authority, stale/future clocks and arbitrary app-worker plans before backup',()=>{
 const f=fixture();
 assert.equal(companyInstallationStorageIdentity({...storage,endpoint:storage.endpoint+'/'}),companyInstallationStorageIdentity(storage));
 refuse(()=>validateCompanyInstallationBackupRequest(f.requestEnvelope,{secret,now,storage:{...storage,bucket:'different-private'}}));
 for(const change of [r=>r.protocol='MWS_STORE_RECOVERY_JOB_V1',r=>r.requestId='not-a-uuid',r=>r.requestId=r.requestId.replace('-4567-','-1567-'),r=>r.sourceRevision='A'.repeat(40),r=>r.workerRevision='bad',r=>r.profile='AUTOMATIC_EVENT_REPORTS_V1',r=>r.sourcePlanHash='0'.repeat(64),r=>r.targetPlanHash='0'.repeat(64),r=>r.schema='foreign',r=>r.observerSha256='0'.repeat(64),r=>r.sourceObservationSha256='bad',r=>r.sourceOwnershipSha256='bad',r=>r.fullDataDigest='bad',r=>r.storageIdentity='0'.repeat(64),r=>r.expiresAt=new Date(now).toISOString(),r=>r.expiresAt=new Date(now+1800000).toISOString(),r=>r.issuedAt=new Date(now+31000).toISOString(),r=>r.executionAuthorized=true,r=>r.verifiedBackup=true]){
  const input=structuredClone(f.input);change(input);refuse(()=>signCompanyInstallationBackupRequest(input,{secret,now,storage}));refuse(()=>validateCompanyInstallationBackupRequest(signed(REQUEST,input,'requestJson'),{secret,now,storage}));
 }
 refuse(()=>validateCompanyInstallationBackupRequest({...f.requestEnvelope,mac:'0'.repeat(64)},{secret,now,storage}));refuse(()=>validateCompanyInstallationBackupRequest(f.requestEnvelope,{secret:'wrong-isolated-installation-secret',now}));refuse(()=>validateCompanyInstallationBackupRequest({...f.requestEnvelope,requestJson:f.requestEnvelope.requestJson+' '},{secret,now,storage}));
 let getter=false;const accessor={...f.input};Object.defineProperty(accessor,'schema',{enumerable:true,get(){getter=true;return 'public'}});refuse(()=>signCompanyInstallationBackupRequest(accessor,{secret,now,storage}));assert.equal(getter,false);
 refuse(()=>signCompanyInstallationBackupRequest({...f.input,[Symbol('extra')]:'scope'},{secret,now,storage}));refuse(()=>validateCompanyInstallationBackupRequest(f.requestEnvelope,{secret,now:NaN}));
});

test('proof reader rejects correctly signed substitutions of every restore/storage/request binding and expired receipts',()=>{
 const f=fixture();
 for(const change of [p=>p.protocol='MWS_STORE_RECOVERY_PROOF_V1',p=>p.requestSha256='0'.repeat(64),p=>p.sourceObservationSha256='0'.repeat(64),p=>p.sourceOwnershipSha256='0'.repeat(64),p=>p.restoredObservationSha256='0'.repeat(64),p=>p.fullDataDigest='0'.repeat(64),p=>p.storageIdentity='0'.repeat(64),p=>p.artifactSha256='ETAG-not-SHA256',p=>p.sizeBytes=0,p=>p.sizeBytes='1234',p=>p.sizeBytes=1024**4+1,p=>p.sizeBytes=1.5,p=>p.objectVersion='null',p=>p.objectVersion='',p=>p.objectVersion='version\n',p=>p.objectVersion='x'.repeat(513),p=>p.objectKey=p.objectKey.replace(f.input.requestId,'87654321-1234-4567-89ab-123456789abc'),p=>p.objectKey='myworkstation/lifecycle/'+f.input.requestId+'/source.dump',p=>p.objectKey=p.objectKey.replace('.dump','.json'),p=>p.workerRevision='a'.repeat(40),p=>p.verifiedAt=new Date(now-2000).toISOString(),p=>p.verifiedAt=new Date(now+31000).toISOString(),p=>p.verifiedAt=f.input.expiresAt,p=>p.fullRestoreAudit={dataMatches:true},p=>p.verifiedBackup=true,p=>p.state='PREPARED']){
  const proof=structuredClone(f.proof);change(proof);refuse(()=>validateCompanyInstallationBackupProof(signed(PROOF,proof,'proofJson'),f.options));
 }
 const valid=signed(PROOF,f.proof,'proofJson');refuse(()=>validateCompanyInstallationBackupProof({...valid,mac:'0'.repeat(64)},f.options));
 const later=now+601000;refuse(()=>validateCompanyInstallationBackupProof(valid,{...f.options,now:later}));
 const other=fixture('BASE');refuse(()=>validateCompanyInstallationBackupProof(valid,{...f.options,requestEnvelope:other.requestEnvelope}));
});

test('explicit Python backup producer refuses failed privacy/version/readback/restore/source boundaries before signing',()=>{
 const result=spawnSync('python3',[new URL('./company-installation-backup-producer.py',import.meta.url).pathname],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},timeout:30000,maxBuffer:16000});
 assert.equal(result.status,0,(result.stderr||result.stdout).slice(-8000));assert.match(result.stderr,/Ran 6 tests/);
});
