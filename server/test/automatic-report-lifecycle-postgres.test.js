import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,readFile,writeFile,chmod,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {automaticReportDispatchDDL} from '../src/services/automatic-report-dispatch-schema.js';
import {createLifecycleExecutionCore,lifecycleExecutionSnapshotHash} from '../src/services/store-lifecycle-executor.js';
import {persistLifecycleRecoveryStream,verifyLifecycleRecoveryStream,readLifecycleRecoveryStream,digestLifecycleRows} from '../src/services/store-lifecycle-recovery-stream.js';
import {createDeliverySlot,claimDelivery,startDelivery,completeDelivery} from '../src/services/automatic-report-delivery-lifecycle.js';
import {readActivation,activationAllows,ACTIVATION_SERVICE_ID} from '../src/services/automatic-report-activation.js';

// Bounded seven-table integration, NOT the full 259-table production profile.
const names=['AutomaticReportDispatchPolicy','AutomaticReportAutomationGrant','AutomaticReportRecipient','AutomaticReportRecipientConsent','AutomaticReportPayload','AutomaticReportDeliverySlot'];
const revision='1'.repeat(40),generation='9007199254740993',NOW='2026-10-22T12:00:00.000Z';
const actor={id:'fixture-admin',isSuperAdmin:true},scope={companyId:'company',storeId:'target'};
const root=fileURLToPath(new URL('../../',import.meta.url));
const q=value=>'"'+value.replaceAll('"','""')+'"';
const sha=value=>createHash('sha256').update(value).digest('hex');
function isolated(value=process.env.DATABASE_URL,mode=process.env.NODE_ENV){
 try{
  const u=new URL(value);if(mode!=='test'||!['postgres:','postgresql:'].includes(u.protocol)||!['localhost','127.0.0.1','postgres'].includes(u.hostname)||u.hash||!/^\/(?:test(?:[_-][a-z0-9_-]+)?|[a-z0-9_-]+[_-]test(?:[_-][a-z0-9_-]+)?)$/i.test(decodeURIComponent(u.pathname)))return false;
  const seen=new Set();for(const [key,entry] of u.searchParams){if(seen.has(key))return false;seen.add(key);if(key==='schema'){if(!/^[a-z_][a-z0-9_]{0,62}$/i.test(entry))return false;continue}const limits={connection_limit:[1,1000],pool_timeout:[0,600],statement_cache_size:[0,100000]},bounds=Object.hasOwn(limits,key)?limits[key]:null;if(!bounds||!/^\d{1,6}$/.test(entry)||Number(entry)<bounds[0]||Number(entry)>bounds[1])return false;}return true;
 }catch{return false;}
}
test('dispatch lifecycle fixture is isolated, and native execution is mandatory in CI',()=>{
 for(const value of ['postgresql://u:p@remote/lifecycle_test','postgresql://u:p@localhost/live','postgresql://u:p@localhost/lifecycle_test?host=remote','postgresql://u:p@localhost/lifecycle_test?options=x','postgresql://u:p@localhost/lifecycle_test?schema=a&schema=b','postgresql://u:p@localhost/lifecycle_test?__proto__=1'])assert.equal(isolated(value,'test'),false);
 assert.equal(isolated('postgresql://u:p@localhost/myworkstation_test','test'),true);
 if(process.env.CI)assert.ok(isolated(),'CI must execute the bounded native lifecycle regression');
});

function activation(changes={}){return readActivation({RENDER_SERVICE_ID:ACTIVATION_SERVICE_ID,AUTOMATIC_REPORT_ACTIVATION_CONTROL:JSON.stringify({v:1,serviceId:ACTIVATION_SERVICE_ID,epoch:'11111111-1111-4111-8111-111111111111',issuedAt:'2026-10-19T00:00:00.000Z',notBefore:'2026-10-20T04:00:00.000Z',enabled:true,...changes})});}
function accepted(companyId,storeId,recipient,payloadFingerprint){
 const input={companyId,storeId,reportType:'CASH',frequency:'DAILY',periodFrom:'2026-10-20T04:00:00.000Z',periodTo:'2026-10-21T04:00:00.000Z',recipient,snapshot:{settingsVersion:1,recipientVersion:1,consentRevision:1,lifecycleGeneration:generation,sourceFingerprint:'a'.repeat(64),payloadFingerprint,policyFingerprint:'c'.repeat(64),principalId:'foreign-actor-never-an-owner',financialFinality:'PROVISIONAL',financialReconciliationComplete:false}};
 const current={...input,checkedAt:NOW,companyActive:true,storeActive:true,licenseActive:true,moduleActive:true,principalAuthorized:true,recipientVerified:true,consentActive:true,dispatchEnabled:true,sourceReady:true,policyAllowsProvisional:true,maintenanceBlocked:false};
 let record=createDeliverySlot(input,{now:NOW,current});record=claimDelivery(record,{expectedVersion:record.version,token:'fixture-token',now:NOW,leaseMs:60000});record=startDelivery(record,{expectedVersion:record.version,token:'fixture-token',now:NOW,current});return completeDelivery(record,{expectedVersion:record.version,token:'fixture-token',now:NOW,outcome:'ACCEPTED',messageId:'<synthetic-already-accepted>'});
}

test('bounded seven-table native recovery, archive COPY audit, RESET fencing and fresh cutoff',{skip:!isolated(),timeout:300000},async t=>{
 // No exported mutating fixture: the native guard is checked again before DDL.
 assert.ok(isolated());
 const proposed=JSON.parse(await readFile(path.join(root,'ops/backup/lifecycle/automatic-report-manifest.proposed.json'),'utf8'));
 const selectedNames=new Set(['Store',...names]);
 const manifest={id:'TEST_AUTOMATIC_REPORT_LIFECYCLE_7TABLE_V1',resetPolicy:'FRESH_STORE_V1',streaming:true,knownTables:proposed.knownTables.filter(n=>selectedNames.has(n)),knownColumns:Object.fromEntries(Object.entries(proposed.knownColumns).filter(([n])=>selectedNames.has(n))),reviewedColumns:proposed.reviewedColumns.filter(n=>selectedNames.has(n.split('.')[0])),tables:proposed.tables.filter(n=>selectedNames.has(n.name))};
 assert.equal(manifest.knownTables.length,7);assert.equal(manifest.tables.length,7);
 for(const name of names){assert.deepEqual(manifest.tables.find(n=>n.name===name).owner,{kind:'DIRECT'});assert.equal(manifest.tables.find(n=>n.name===name).reset,'REMOVE');}
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='dispatch_lifecycle_'+randomBytes(10).toString('hex'),directory=await mkdtemp(path.join(tmpdir(),'mws-dispatch-lifecycle-'));
 let db,created=false,proofCalls=0,cloneRows=0;
 const storeDDL=`CREATE TABLE "Store" (${manifest.knownColumns.Store.map(([name,type,required])=>`${q(name)} ${type}${required?' NOT NULL':''}${name==='id'?' PRIMARY KEY':''}`).join(',')})`;
 const createSchema=async(name)=>{await admin.$executeRawUnsafe(`CREATE SCHEMA ${q(name)}`);const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',name);const client=new PrismaClient({datasourceUrl:url.href});try{await client.$executeRawUnsafe(storeDDL);for(const ddl of automaticReportDispatchDDL)await client.$executeRawUnsafe(ddl);return client;}catch(error){await client.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA ${q(name)} CASCADE`);throw error;}};
 const snapshot=async()=>{const result={};for(const name of manifest.knownTables)result[name]=await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM ${q(name)} t ORDER BY row_to_json(t)::text`);return result;};
 const recovery=async(snapshotValue,reader)=>{
  proofCalls++;const key=randomBytes(32),options={directory,encryptionKey:key,keyId:'isolated-dispatch-key',expectedScope:snapshotValue.scope,expectedManifestHash:snapshotValue.planHash,expectedSourceRevision:revision,expectedSchemaSignature:snapshotValue.schemaSignature};
  const saved=await persistLifecycleRecoveryStream({...snapshotValue,manifestHash:snapshotValue.planHash},{...options,readRows:reader.readRows});
  const bytes=await readFile(saved.artifactPath),readOptions={...options,expectedSnapshotHash:saved.snapshotHash};
  assert.equal(bytes.includes(Buffer.from('fixture@example.invalid')),false,'encrypted index cannot expose recipient bytes');
  assert.equal((await verifyLifecycleRecoveryStream(bytes,readOptions)).storageReadbackVerified,true);
  const restore='dispatch_clone_'+randomBytes(10).toString('hex');const clone=await createSchema(restore);
  try{
   const chunks=[];for await(const chunk of readLifecycleRecoveryStream(bytes,readOptions))chunks.push(chunk);
   // Exact six-table DDL has an immediate consent->recipient FK.
   for(const name of ['Store',...names])for(const chunk of chunks.filter(c=>c.table===name))for(const row of chunk.rows){await clone.$executeRawUnsafe(`INSERT INTO ${q(name)} SELECT * FROM json_populate_record(NULL::${q(name)},$1::json)`,row);cloneRows++;}
   const tables=[];for(const table of snapshotValue.tables){const values=await clone.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM ${q(table.name)} t`);tables.push({name:table.name,action:table.action,...await digestLifecycleRows(values.map(r=>r.row))});}
   const restoredSnapshotHash=lifecycleExecutionSnapshotHash({...snapshotValue,tables});assert.equal(restoredSnapshotHash,snapshotValue.snapshotHash);
   return {sourceRevision:revision,manifestHash:snapshotValue.planHash,...snapshotValue.scope,snapshotHash:snapshotValue.snapshotHash,restoredSnapshotHash,artifactSha256:saved.sha256,storageReadbackVerified:true};
  }finally{await clone.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA ${q(restore)} CASCADE`);}
 };
 try{
  db=await createSchema(schema);created=true;
  const control=activation();
  for(const [storeId,companyId] of [['target','company'],['sibling','company'],['foreign','other']]){
   const email=storeId+'-fixture@example.invalid',recipientId='recipient-'+storeId,body=Buffer.from(JSON.stringify({scope:{companyId,storeId},fixture:'PRIVATE Ελληνικά \\ JSON',integer:'9007199254740993',financialFinality:'PROVISIONAL'})),fingerprint=sha(body),record=accepted(companyId,storeId,email,fingerprint);
   await db.$executeRaw`INSERT INTO "Store"("id","name","active","companyId","createdAt","updatedAt","responsibleEmail","cashCloseEmailEnabled") VALUES(${storeId},${storeId},true,${companyId},${new Date(NOW)},${new Date(NOW)},${email},true)`;
   await db.$executeRaw`INSERT INTO "AutomaticReportDispatchPolicy"("companyId","storeId","dispatchEnabled","allowsProvisional","allowedFrequencies","lifecycleGeneration","updatedBy","updatedAt") VALUES(${companyId},${storeId},true,true,ARRAY['DAILY'],${BigInt(generation)},'foreign-actor-never-an-owner',${new Date(NOW)})`;
   await db.$executeRaw`INSERT INTO "AutomaticReportAutomationGrant"("companyId","storeId","active","principalId","principalSessionVersion","allowedFrequencies","lifecycleGeneration","activationEpoch","activationFingerprint","notBefore","createdAt","grantedBy","grantedAt","updatedBy","updatedAt") VALUES(${companyId},${storeId},true,'foreign-actor-never-an-owner',1,ARRAY['DAILY'],${BigInt(generation)},${control.epoch},${control.activationFingerprint},${new Date(control.notBefore)},${new Date(control.issuedAt)},'foreign-actor-never-an-owner',${new Date(control.issuedAt)},'foreign-actor-never-an-owner',${new Date(NOW)})`;
   await db.$executeRaw`INSERT INTO "AutomaticReportRecipient"("recipientId","companyId","storeId","email","verifiedAt","verifiedBy","challengeLifecycleGeneration","createdBy","createdAt","updatedBy","updatedAt") VALUES(${recipientId},${companyId},${storeId},${email},${new Date(NOW)},'foreign-actor-never-an-owner',${BigInt(generation)},'foreign-actor-never-an-owner',${new Date(NOW)},'foreign-actor-never-an-owner',${new Date(NOW)})`;
   await db.$executeRaw`INSERT INTO "AutomaticReportRecipientConsent"("companyId","storeId","recipientId","recipientVersion","active","allowedFrequencies","lifecycleGeneration","consentedBy","consentedAt","proofHash","updatedBy","updatedAt") VALUES(${companyId},${storeId},${recipientId},1,true,ARRAY['DAILY'],${BigInt(generation)},'foreign-actor-never-an-owner',${new Date(NOW)},${'b'.repeat(64)},'foreign-actor-never-an-owner',${new Date(NOW)})`;
   await db.$executeRaw`INSERT INTO "AutomaticReportPayload"("payloadId","companyId","storeId","frequency","periodFrom","periodTo","settingsVersion","lifecycleGeneration","sourceFingerprint","payloadFingerprint","contentType","bytes","byteLength","createdAt") VALUES(${fingerprint},${companyId},${storeId},'DAILY',${new Date(record.input.periodFrom)},${new Date(record.input.periodTo)},1,${BigInt(generation)},${'a'.repeat(64)},${fingerprint},'application/json; charset=utf-8',${body},${body.length},${new Date(NOW)})`;
   await db.$executeRaw`INSERT INTO "AutomaticReportDeliverySlot" VALUES(${record.slotId},${companyId},${storeId},${BigInt(record.version)},'ACCEPTED',${record.token},${JSON.stringify(record)}::jsonb)`;
  }
  const core=createLifecycleExecutionCore(manifest,{sourceRevision:revision,persistAndVerifyRecovery:recovery});
  const before=await snapshot();
  await t.test('real role/scope checks deny before preparation; all six classifications pass actual inspection',async()=>{
   await assert.rejects(core.install(db,{id:'owner',role:'OWNER'},scope),e=>e.status===403);await assert.rejects(core.install(db,actor,{...scope,companyId:'other'}),e=>e.status===404);
   await core.install(db,actor,scope);await db.$executeRaw`UPDATE "StoreLifecycleFence" SET "generation"=${BigInt(generation)} WHERE "storeId"='target'`;
   assert.deepEqual(await snapshot(),before);
  });
  const prep=await core.prepare(db,actor,scope,'RESET');
  for(const name of names)assert.deepEqual(prep.counts.find(v=>v.table===name),{table:name,count:1,action:'REMOVE'});
  const queued=(await db.$queryRaw`SELECT "result" FROM "StoreLifecycleExecution" WHERE "id"=${prep.operationId}`)[0].result.recoveryRequest;
  await t.test('actual archive restores privately and verifies full/selective COPY before touching source rows',async()=>{
   const archive=path.join(directory,'fixture.dump'),job=path.join(directory,'job.json'),profile=path.join(directory,'manifest.json');
   await writeFile(job,JSON.stringify(queued),{mode:0o600});await writeFile(profile,JSON.stringify(manifest),{mode:0o600});
   // The guard permits only Prisma query options; libpq does not accept them.
   const dumpURL=new URL(process.env.DATABASE_URL);dumpURL.search='';
   const dump=spawnSync('pg_dump',['--format=custom','--no-owner','--no-privileges','--schema='+schema,'--file='+archive,dumpURL.href],{timeout:60000,encoding:'utf8',maxBuffer:1048576});assert.equal(dump.status,0,'isolated pg_dump must succeed');await chmod(archive,0o600);
   const script="import json,sys;sys.path.insert(0,sys.argv[1]);from verify_restore import verify_archive;print(json.dumps(verify_archive(sys.argv[2],json.load(open(sys.argv[3])),json.load(open(sys.argv[4])),sys.argv[5])))";
   const check=result=>{assert.equal(result.status,0,'private fixture archive verification failed');const proof=JSON.parse(result.stdout);assert.equal(proof.restoredSnapshotHash,prep.snapshotHash);assert.equal(proof.selectiveRestoreVerified,true);assert.equal(proof.controlsUnchanged,true);assert.equal(proof.fullRestoreAudit.dataMatches,true);assert.equal(proof.selectiveRestoreAudit.dataMatches,true);};
   check(spawnSync('python3',['-c',script,path.join(root,'ops/backup/lifecycle'),archive,job,profile,path.join(root,'server/scripts/store-lifecycle-verify-copy.py')],{timeout:120000,encoding:'utf8',maxBuffer:1048576,env:{PATH:process.env.PATH,LANG:'C.UTF-8'}}));
   if(process.env.CI)assert.ok(process.env.MWS_LIFECYCLE_RECOVERY_IMAGE,'CI must exercise the actual PG18 recovery image');
   if(process.env.MWS_LIFECYCLE_RECOVERY_IMAGE)check(spawnSync('docker',['run','--rm','--network=none','--memory=256m','--pids-limit=80','--mount',`type=bind,source=${directory},target=/fixture,readonly`,'--entrypoint','python3',process.env.MWS_LIFECYCLE_RECOVERY_IMAGE,'-c',script,'/backup/lifecycle','/fixture/fixture.dump','/fixture/job.json','/fixture/manifest.json','/backup/lifecycle/store-lifecycle-verify-copy.py'],{timeout:120000,encoding:'utf8',maxBuffer:1048576}));
   assert.deepEqual(await snapshot(),before);
  });
  await t.test('encrypted real clone proof precedes RESET: only six target rows removed, exact controls retained',async()=>{
   const result=await core.execute(db,actor,{...scope,...prep});assert.equal(proofCalls,1);assert.equal(cloneRows,7);assert.equal(result.generation,(BigInt(generation)+1n).toString());
   const after=await snapshot();assert.deepEqual(after.Store,before.Store);
   for(const name of names){assert.equal(result.deleted.find(v=>v.table===name).count,1);assert.deepEqual(after[name],before[name].filter(({row})=>JSON.parse(row).storeId!=='target'));}
   assert.equal((await core.execute(db,actor,{...scope,...prep})).idempotentReplay,true);assert.equal(proofCalls,1);
   await core.reopen(db,actor,{...scope,operationId:prep.operationId});
   await assert.rejects(db.$executeRaw`INSERT INTO "AutomaticReportDispatchPolicy"("companyId","storeId","lifecycleGeneration","updatedBy","updatedAt") VALUES('company','target',0,'old-work',${new Date(NOW)})`,e=>/STORE_LIFECYCLE_STALE_GENERATION/.test(e.message+JSON.stringify(e.meta||{})));
  });
  await t.test('fresh external epoch/cutoff denies restored grants and historical periods after reset',async()=>{
   const fresh=activation({epoch:'22222222-2222-4222-8222-222222222222',issuedAt:NOW,notBefore:'2026-10-22T21:00:00.000Z'});
   const archived={activationEpoch:control.epoch,activationFingerprint:control.activationFingerprint,createdAt:control.issuedAt,periodFrom:'2026-10-20T04:00:00.000Z',now:'2026-10-23T12:00:00.000Z'};
   assert.equal(activationAllows(fresh,archived),false);
   await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('mws.lifecycle_generations',${JSON.stringify({target:(BigInt(generation)+1n).toString()})},true)`;
    await tx.$executeRaw`INSERT INTO "AutomaticReportAutomationGrant"("companyId","storeId","active","principalId","principalSessionVersion","allowedFrequencies","lifecycleGeneration","activationEpoch","activationFingerprint","notBefore","createdAt","grantedBy","grantedAt","updatedBy","updatedAt") VALUES('company','target',true,'fixture-admin',1,ARRAY['DAILY'],${BigInt(generation)+1n},${fresh.epoch},${fresh.activationFingerprint},${new Date(fresh.notBefore)},${new Date(NOW)},'fixture-admin',${new Date(NOW)},'fixture-admin',${new Date(NOW)})`;
   });
   const grant=(await db.$queryRaw`SELECT "activationEpoch","activationFingerprint","createdAt","notBefore","lifecycleGeneration"::text AS generation FROM "AutomaticReportAutomationGrant" WHERE "companyId"='company' AND "storeId"='target'`)[0];
   assert.equal(grant.generation,(BigInt(generation)+1n).toString());
   const enrolled={...archived,activationEpoch:grant.activationEpoch,activationFingerprint:grant.activationFingerprint,createdAt:grant.createdAt.toISOString()};
   assert.equal(activationAllows(fresh,enrolled),false);assert.equal(activationAllows(fresh,{...enrolled,periodFrom:fresh.notBefore}),true);
   assert.ok(enrolled.periodFrom<grant.notBefore.toISOString(),'persisted renewed grant cutoff excludes the historical period');
   assert.equal(activationAllows({...fresh,enabled:false},{...enrolled,periodFrom:fresh.notBefore}),false);
  });
 }finally{try{await db?.$disconnect();if(created)await admin.$executeRawUnsafe(`DROP SCHEMA ${q(schema)} CASCADE`);}finally{await admin.$disconnect();await rm(directory,{recursive:true,force:true});}}
});
