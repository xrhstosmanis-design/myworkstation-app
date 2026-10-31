import {ensureStoreChatInteractions} from '../src/chat-interactions.mjs';
import {provisionMonthlyInventoryCaptureSchema,validateMonthlyInventoryCaptureSchema,monthlyInventoryCaptureLifecycleManifestProposal,assertMonthlyInventoryCaptureLifecycleCatalogue,monthlyInventoryCaptureRecoveryColumns} from '../src/services/monthly-inventory-capture-schema.js';
import {createMonthlyInventoryCaptureJobs} from '../src/services/monthly-inventory-capture-jobs.js';
import {monthlyInventorySnapshotPeriod} from '../src/services/monthly-inventory-snapshot-period.js';
import {authorizeMonthlyCaptureSourceInTransaction} from '../src/services/monthly-inventory-capture-authorization.js';
import {ensureBackofficeStaffSchema} from '../src/backoffice-staff-bootstrap.js';
import {provisionAiWalletRecovery} from '../src/services/ai-owner-wallet-schema.js';
import {provisionFtextRecoverySchema} from '../src/services/ftext-cash-schema.js';
import {provisionMonthlyInventorySnapshotSchema,validateMonthlyInventorySnapshotSchema,monthlyInventorySnapshotLifecycleManifestProposal,assertMonthlySnapshotLifecycleCatalogue} from '../src/services/monthly-inventory-snapshot-schema.js';
import {buildMonthlyInventorySnapshotCandidate,serializeMonthlyInventorySnapshotCandidate} from '../src/services/monthly-inventory-snapshot-payload.js';
import {createLifecycleExecutionCore,createLifecycleInstallationCore} from '../src/services/store-lifecycle-executor.js';
import {assertLifecycleMutation} from '../src/services/store-lifecycle-generation.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdtemp,writeFile,readFile,rm,chmod} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url)),q=s=>'"'+s.replaceAll('"','""')+'"',literal=s=>"'"+s.replaceAll("'","''")+"'";
const metadata=JSON.parse(readFileSync(new URL('./fixtures/ftext-full-schema-metadata-20261024.json',import.meta.url)));
function isolated(){try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&!u.search&&!u.hash&&/^\/[^/]*test[^/]*$/i.test(decodeURIComponent(u.pathname))}catch{return false}}
test('D5 proposed capture catalogue is exactly the unchanged D4 baseline plus21/20 reviewed REMOVE fields',()=>{
 assertMonthlyInventoryCaptureLifecycleCatalogue();const manifest=monthlyInventoryCaptureLifecycleManifestProposal(),columns=monthlyInventoryCaptureRecoveryColumns();assert.equal(columns.MonthlyInventoryCaptureGrant.length,21);assert.equal(columns.MonthlyInventoryCaptureJob.length,20);
 for(const table of Object.keys(columns)){assert.equal(manifest.tables.find(n=>n.name===table).reset,'REMOVE');assert.ok(columns[table].some(c=>c[0]==='purposeVersion'&&c[1]==='integer'&&c[2]));}
 if(process.env.CI)assert.ok(isolated(),'Actual isolated PostgreSQL required in CI');
});
async function latestFixturePeriod(db){
 const now=(await db.$queryRawUnsafe(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS now`))[0].now;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit'}).formatToParts(new Date(now)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 let month=new Date(Date.UTC(Number(parts.year),Number(parts.month)-2,1)).toISOString().slice(0,7),period=monthlyInventorySnapshotPeriod(month);
 if(period.scheduledFor>now){month=new Date(Date.UTC(Number(parts.year),Number(parts.month)-3,1)).toISOString().slice(0,7);period=monthlyInventorySnapshotPeriod(month)}
 return period;
}
for(const grantRevision of [2,3])
test('native D5 grant revision'+grantRevision+' and old job revision1 survive full/selective private recovery without regaining authority',{skip:!isolated()&&!process.env.CI?'Actual isolated PostgreSQL unavailable locally':false,timeout:600000},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),name='monthly_history_full_'+randomBytes(10).toString('hex')+'_test',directory=await mkdtemp(path.join(tmpdir(),'wallet-full-recovery-'));
 const actor={id:'isolated-admin',isSuperAdmin:true},scope={companyId:'fixture-company',storeId:'target'},manifest=monthlyInventoryCaptureLifecycleManifestProposal(),revision='1'.repeat(40);
 let db,created=false,proof;
 const envKeys=['RENDER_SERVICE_ID','RENDER_GIT_COMMIT','GIT_COMMIT','MWS_MONTHLY_INVENTORY_CAPTURE_CONTROL'],previousEnv=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
 try{
  assert.ok(isolated());await admin.$executeRawUnsafe(`CREATE DATABASE ${q(name)}`);created=true;
  const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;db=new PrismaClient({datasourceUrl:url.href});
  for(const e of metadata.enums)await db.$executeRawUnsafe(`CREATE TYPE ${q(e.name)} AS ENUM (${e.labels.map(literal).join(',')})`);
  await db.$executeRawUnsafe(`CREATE SEQUENCE "CloudChange_sequence_seq" AS bigint START 1 INCREMENT 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE`);
  const tables=[...new Set(metadata.columns.map(c=>c.table))];
  for(const table of tables)await db.$executeRawUnsafe(`CREATE TABLE ${q(table)} (${metadata.columns.filter(c=>c.table===table).map(c=>`${q(c.name)} ${c.type}${c.required?' NOT NULL':''}`).join(',')})`);
  for(const fn of metadata.functions)await db.$executeRawUnsafe(fn);
  for(const c of metadata.columns.filter(c=>c.default!==null))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ALTER COLUMN ${q(c.name)} SET DEFAULT ${c.default}`);
  // PG18 catalogues expose NOT NULL as separate constraints; required column
  // declarations above preserve the same reviewed type/nullability on PG16.
  for(const kind of ['p','u','c'])for(const c of metadata.constraints.filter(c=>c.kind===kind))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
  for(const index of metadata.indexes)await db.$executeRawUnsafe(index);
  for(const c of metadata.constraints.filter(c=>c.kind==='f'))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
  for(const trigger of metadata.triggers){await db.$executeRawUnsafe(trigger.definition);await db.$executeRawUnsafe(`ALTER TABLE ${q(trigger.table)} ${trigger.enabled==='A'?'ENABLE ALWAYS':trigger.enabled==='D'?'DISABLE':'ENABLE'} TRIGGER ${q(trigger.name)}`);}
  await provisionFtextRecoverySchema(db);
  await provisionAiWalletRecovery(db);
  await ensureBackofficeStaffSchema(db);
  await ensureStoreChatInteractions(db);
  await provisionMonthlyInventorySnapshotSchema(db);await provisionMonthlyInventoryCaptureSchema(db,{manifest});assert.deepEqual(await validateMonthlyInventoryCaptureSchema(db),{available:true,lifecycleGuardsInstalled:false});

  await db.$executeRawUnsafe(`INSERT INTO "Company"("id","name","updatedAt") VALUES ('fixture-company','SYNTHETIC',NOW()),('foreign-company','CONTROL',NOW())`);
  await db.$executeRawUnsafe(`INSERT INTO "Store"("id","name","companyId","updatedAt") VALUES ('target','SYNTHETIC','fixture-company',NOW()),('sibling','CONTROL','fixture-company',NOW()),('foreign','CONTROL','foreign-company',NOW())`);
  await db.$executeRawUnsafe(`UPDATE "Company" SET "licenseStatus"='ACTIVE'`);
  await db.$executeRawUnsafe(`INSERT INTO "User"("id","email","passwordHash","fullName","role","companyId","updatedAt","mustChangePassword") VALUES ('grant-owner','synthetic@example.invalid','SYNTHETIC-NOT-A-PASSWORD','SYNTHETIC','OWNER','fixture-company',NOW(),false),('foreign-owner','foreign@example.invalid','SYNTHETIC-NOT-A-PASSWORD','CONTROL','OWNER','foreign-company',NOW(),false)`);
  await db.$executeRawUnsafe(`INSERT INTO "CompanyModule"("id","companyId","moduleKey","active") VALUES ('inventory-module','fixture-company','INVENTORY',true)`);
  const period=await latestFixturePeriod(db),grantedAt=new Date(Date.parse(period.scheduledFor)-86400000).toISOString(),issuedAt=new Date(Date.parse(period.scheduledFor)-172800000).toISOString();
  process.env.RENDER_SERVICE_ID='srv-d9isenfavr4c73bdh52g';process.env.RENDER_GIT_COMMIT=revision;process.env.GIT_COMMIT=revision;process.env.MWS_MONTHLY_INVENTORY_CAPTURE_CONTROL=JSON.stringify({v:1,purpose:'MONTHLY_INVENTORY_CAPTURE',serviceId:process.env.RENDER_SERVICE_ID,epoch:'11111111-1111-4111-8111-111111111111',issuedAt,notBefore:grantedAt,enabled:true});
  const token='a'.repeat(64),tokenHash=createHash('sha256').update(token).digest('hex');
  for(const [store,company,user] of [['target','fixture-company','grant-owner'],['sibling','fixture-company','grant-owner'],['foreign','foreign-company','foreign-owner']]){
   await db.$executeRawUnsafe(`INSERT INTO "MonthlyInventoryCaptureGrant"("id","companyId","storeId","purpose","lifecycleGeneration","active","delegatorUserId","delegatorSessionVersion","activationId","firstIssueMonth","firstScheduledFor","createdByUserId","createdAt","grantedByUserId","grantedAt","updatedByUserId") VALUES ($1,$2,$3,'MONTHLY_INVENTORY_CAPTURE',0,true,$4,0,'original-activation',$5,$6::timestamptz,$4,$7::timestamptz,$4,$7::timestamptz,$4)`,store+'-grant',company,store,user,period.issueMonth,period.scheduledFor,grantedAt);
   if(store==='target')await db.$executeRawUnsafe(`INSERT INTO "MonthlyInventoryCaptureJob"("id","companyId","storeId","purpose","lifecycleGeneration","issueMonth","scheduledFor","grantId","grantRevision","activationId","status","attempt") VALUES ($1,$2,$3,'MONTHLY_INVENTORY_CAPTURE',0,$4,$5::timestamptz,$6,1,'original-activation','PENDING',0)`,store+'-old-job',company,store,period.issueMonth,period.scheduledFor,store+'-grant');
   else await db.$executeRawUnsafe(`INSERT INTO "MonthlyInventoryCaptureJob"("id","companyId","storeId","purpose","lifecycleGeneration","issueMonth","scheduledFor","grantId","grantRevision","activationId","status","attempt","leaseTokenHash","leaseExpiresAt","claimedSourceRevision") VALUES ($1,$2,$3,'MONTHLY_INVENTORY_CAPTURE',0,$4,$5::timestamptz,$6,1,'original-activation','LEASED',1,$7,NOW()+INTERVAL '2 hours',$8)`,store+'-old-job',company,store,period.issueMonth,period.scheduledFor,store+'-grant',tokenHash,revision);
  }
  const started=period.scheduledFor,observed=new Date(Date.parse(started)+123).toISOString();
  for(const [id,companyId,storeId,generation] of [['target-old','fixture-company','target','0'],['sibling-control','fixture-company','sibling','0'],['foreign-control','foreign-company','foreign','0']]){
   const candidate=buildMonthlyInventorySnapshotCandidate({companyId,storeId,lifecycleGeneration:generation,issueMonth:period.issueMonth,sourceObservedAt:observed,sourceRevision:revision,valuationBasis:'CURRENT_OPERATIONAL_V1',coverage:{complete:true,productCount:1,invoiceCount:0,pendingOriginalCount:0},products:[{id:'detached-product',companyId,storeId,name:'Συνθετικό ιστορικό \ " /',sku:'EXACT',unit:'τεμάχιο',quantity:'-9007199254740993.123456789012',retailUnitPrice:'0.000000000001',purchaseUnitCost:null}],invoices:{period:period.issueMonth,items:[]},pendingOriginals:{period:'ALL_MONTHS',items:[]}});
   const text=serializeMonthlyInventorySnapshotCandidate(candidate),bytes=createHash('sha256').update(text).digest('hex');
   await db.$executeRawUnsafe(`INSERT INTO "MonthlyInventorySnapshot"("id","companyId","storeId","lifecycleGeneration","issueMonth","scheduledFor","transactionStartedAt","sourceReadStartedAt","sourceReadFinishedAt","sourceObservedAt","observationStatus","delayMs","sourceRevision","formatVersion","valuationBasis","sourceHash","payloadHash","candidateJsonText","storedBytesSha256","sourceCoverage","capturePrincipal") VALUES ($1,$2,$3,$4::bigint,$15,$5::timestamptz,$6::timestamptz,$6::timestamptz,$7::timestamptz,$7::timestamptz,'LATE',123,$8,1,'CURRENT_OPERATIONAL_V1',$9,$10,$11,$12,$13::jsonb,$14::jsonb)`,id,companyId,storeId,generation,candidate.period.scheduledFor,started,observed,revision,candidate.sourceHash,candidate.payloadHash,text,bytes,JSON.stringify(candidate.coverage),JSON.stringify({type:'BACKOFFICE_USER',userId:'synthetic-user',authorizationBasis:'RECHECKED_IN_FRESH_WRITE_TRANSACTION',sourceBasis:'SUPPLIED_FORMAT_VALIDATED_FACTS'}),period.issueMonth);
  }
  await validateMonthlyInventorySnapshotSchema(db);
  for(const sql of [`DELETE FROM "Store" WHERE "id"='target'`,`UPDATE "Store" SET "id"='renamed' WHERE "id"='target'`,`DELETE FROM "Company" WHERE "id"='fixture-company'`])await assert.rejects(db.$executeRawUnsafe(sql),/mws_snapshot_(store|company)_parent/);
  await db.$executeRawUnsafe(`INSERT INTO "Product"("id","companyId","name") VALUES ('detached-product','fixture-company','SYNTHETIC SHARED PRODUCT'),('foreign-product','foreign-company','CONTROL')`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreProduct"("id","storeId","productId","currentStock") VALUES ('target-stock','target','detached-product',-12.3456),('sibling-stock','sibling','detached-product',7.0001),('foreign-stock','foreign','foreign-product',3.0001)`);
  await db.$executeRawUnsafe(`INSERT INTO "StockMovement"("id","storeId","productId","movementType","quantity") VALUES ('target-movement','target','detached-product','SYNTHETIC',-12.3456),('sibling-movement','sibling','detached-product','SYNTHETIC',7.0001),('foreign-movement','foreign','foreign-product','SYNTHETIC',3.0001)`);
  // Exact target/sibling/foreign Chat controls share external actor users;
  // historical missing/self references do not infer ownership of another store.
  for(const [store,company,user]of [['target','fixture-company','grant-owner'],['sibling','fixture-company','grant-owner'],['foreign','foreign-company','foreign-owner']]){
   await db.$executeRawUnsafe(`INSERT INTO "StoreChatMessage"("id","companyId","storeId","senderId","body","updatedAt","replyToId") VALUES ($1,$2,$3,$4,'SYNTHETIC CHAT',NOW(),$1),($5,$2,$3,$4,'DETACHED HISTORY',NOW(),'unrelated-absent-history')`,store+'-message',company,store,user,store+'-missing');
   await db.$executeRawUnsafe(`INSERT INTO "StoreChatDelivery"("messageId","userId","companyId","storeId") VALUES ($1,$2,$3,$4)`,store+'-message',store+'-delivery-actor',company,store);
   await db.$executeRawUnsafe(`INSERT INTO "StoreChatReaction"("messageId","userId","companyId","storeId","reaction") VALUES ($1,$2,$3,$4,'❤️')`,store+'-message',user,company,store);
  }
  await createLifecycleInstallationCore(manifest,{sourceRevision:revision}).install(db,actor,scope);await validateMonthlyInventorySnapshotSchema(db);assert.deepEqual(await validateMonthlyInventoryCaptureSchema(db),{available:true,lifecycleGuardsInstalled:true});
  // Obtain genuine runtime authority before revocation. The historical row is
  // subsequently archived exactly as a LEASED revision1 job, never relabelled.
  const jobs=createMonthlyInventoryCaptureJobs(db,{sourceRevision:revision}),fixed={type:'SERVICE_DELEGATION',purpose:'MONTHLY_INVENTORY_CAPTURE',executor:'MONTHLY_INVENTORY_CAPTURE_V1'};
  const produced=await jobs.produce({...fixed,grantId:'target-grant'});assert.equal(produced.status,'ALREADY_EXISTS');assert.equal(produced.jobId,'target-old-job');
  const claimed=await jobs.claim({...fixed,jobId:'target-old-job'});assert.equal(claimed.status,'LEASED');assert.equal(claimed.attemptNumber,1);assert.equal(claimed.execution.jobId,'target-old-job');
  await db.$transaction(async tx=>{await assertLifecycleMutation(tx,scope,'0',{lock:true});await tx.$executeRawUnsafe(`UPDATE "MonthlyInventoryCaptureGrant" SET "revision"=2,"active"=false,"revokedAt"=clock_timestamp(),"revokedByUserId"='grant-owner',"updatedAt"=clock_timestamp() WHERE "storeId"='target'`);if(grantRevision===3)await tx.$executeRawUnsafe(`UPDATE "MonthlyInventoryCaptureGrant" SET "revision"=3,"active"=true,"activationId"='new-activation',"grantedAt"=clock_timestamp(),"firstIssueMonth"='2099-11',"firstScheduledFor"='2099-12-01T05:00:00Z',"revokedAt"=NULL,"revokedByUserId"=NULL,"updatedAt"=clock_timestamp() WHERE "storeId"='target'`)});
  const allRows=async()=>{const result={};for(const table of manifest.knownTables)result[table]=await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM ${q(table)} t ORDER BY row_to_json(t)::text`);return result;};
  const before=await allRows();
  for(const sql of [`UPDATE "MonthlyInventorySnapshot" SET "issueMonth"='2026-08'`,'DELETE FROM "MonthlyInventorySnapshot"','TRUNCATE "MonthlyInventorySnapshot"'])await assert.rejects(db.$executeRawUnsafe(sql),/MONTHLY_SNAPSHOT_IMMUTABLE/);
  assert.deepEqual(await allRows(),before);
  const core=createLifecycleExecutionCore(manifest,{sourceRevision:revision,persistAndVerifyRecovery:async(snapshot)=>{assert.ok(proof);assert.equal(proof.restoredSnapshotHash,snapshot.snapshotHash);return {...proof,...snapshot.scope,sourceRevision:revision,manifestHash:snapshot.planHash,snapshotHash:snapshot.snapshotHash,storageReadbackVerified:true,artifactSha256:createHash('sha256').update(await readFile(path.join(directory,'fixture.dump'))).digest('hex')};}});
  await assert.rejects(db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');return authorizeMonthlyCaptureSourceInTransaction(tx,claimed.execution,{sourceRevision:revision,db,attempt:claimed.attempt})},{isolationLevel:'RepeatableRead'}),{code:'MONTHLY_CAPTURE_DELEGATION_STALE'});

  await assert.rejects(core.prepare(db,actor,scope,'DELETE'),/Monthly inventory snapshot history blocks store deletion/);
  // Each existing incoming historical edge independently blocks RESET. The
  // only fixture repair restores the exact identified synthetic reference.
  for(const [table,column,where,original]of [['StoreChatMessage','replyToId',`"id"='sibling-message'`,'sibling-message'],['StoreChatDelivery','messageId',`"storeId"='sibling'`,'sibling-message'],['StoreChatReaction','messageId',`"storeId"='foreign'`,'foreign-message']]){
   await db.$executeRawUnsafe(`UPDATE ${q(table)} SET ${q(column)}='target-message' WHERE ${where}`);
   const held=await allRows(),controls=await db.$queryRawUnsafe(`SELECT row_to_json(f)::text AS row FROM "StoreLifecycleFence" f ORDER BY "storeId"`);
   await assert.rejects(core.prepare(db,actor,scope,'RESET'),/Cross-store dependency/);assert.equal(proof,undefined);assert.deepEqual(await allRows(),held,'HOLD deletes no Chat/history/control rows');assert.deepEqual(await db.$queryRawUnsafe(`SELECT row_to_json(f)::text AS row FROM "StoreLifecycleFence" f ORDER BY "storeId"`),controls);assert.equal((await db.$queryRawUnsafe(`SELECT count(*)::integer AS n FROM "StoreLifecycleExecution"`))[0].n,0);
   await db.$executeRawUnsafe(`UPDATE ${q(table)} SET ${q(column)}=$1 WHERE ${where}`,original);assert.deepEqual(await allRows(),before,'identified synthetic reference restored byte-for-byte');
  }
  const resetBaseline=await allRows();assert.deepEqual(resetBaseline,before,'separate target-only RESET starts from a fresh restored baseline');
  const prep=await core.prepare(db,actor,scope,'RESET');assert.deepEqual(prep.counts.find(c=>c.table==='MonthlyInventorySnapshot'),{table:'MonthlyInventorySnapshot',count:1,action:'KEEP'});
  for(const sql of [`INSERT INTO "StoreChatDelivery"("messageId","userId","companyId","storeId") VALUES ('target-message','race-delivery','fixture-company','sibling')`,`INSERT INTO "StoreChatReaction"("messageId","userId","companyId","storeId","reaction") VALUES ('target-message','race-reaction','foreign-company','foreign','✅')`,`UPDATE "StoreChatMessage" SET "replyToId"='target-message' WHERE "id"='sibling-message'`])await assert.rejects(db.$executeRawUnsafe(sql),/STORE_LIFECYCLE_MAINTENANCE/);
  assert.deepEqual(await allRows(),before,'reference maintenance races cannot alter the archive baseline');
  const request=(await db.$queryRawUnsafe(`SELECT "result" FROM "StoreLifecycleExecution" WHERE "id"=$1`,prep.operationId))[0].result.recoveryRequest;
  const archive=path.join(directory,'fixture.dump');await writeFile(path.join(directory,'job.json'),JSON.stringify(request),{mode:0o600});await writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest),{mode:0o600});
  const dump=spawnSync('pg_dump',['--format=custom','--no-owner','--no-privileges','--file='+archive,url.href],{timeout:60000,encoding:'utf8',maxBuffer:1048576});assert.equal(dump.status,0,'isolated full-schema pg_dump failed');await chmod(archive,0o600);
  // Test-only observation of the restored SQL facts. This changes no restore
  // operation or state; actual SOURCE authority is tested separately above.
  // Host and PG18 copies run the unchanged full/selective restore verifier.
  await writeFile(path.join(directory,'observed-controls.json'),JSON.stringify(Object.fromEntries(['StoreChatMessage','StoreChatDelivery','StoreChatReaction','User','MonthlyInventorySnapshot','MonthlyInventoryCaptureGrant','MonthlyInventoryCaptureJob'].map(table=>[table,before[table].map(r=>r.row)]))),{mode:0o600});
  const script=`import json,sys
sys.path.insert(0,sys.argv[1])
import verify_restore as verifier
original=verifier.PrivatePostgres
observed=[]
class ObservedPostgres(original):
 def __exit__(self,*error):
  try:
   if error[0] is None:
    expected=int(sys.argv[6])
    sql=\"SELECT count(*) FROM \\"MonthlyInventoryCaptureJob\\" j JOIN \\"MonthlyInventoryCaptureGrant\\" g ON g.\\"id\\"=j.\\"grantId\\" WHERE j.\\"id\\"='target-old-job' AND j.\\"grantRevision\\"=1 AND j.\\"activationId\\"='original-activation' AND j.\\"status\\"='LEASED' AND g.\\"revision\\"=\"+str(expected)+\" AND g.\\"active\\"=\"+('true' if expected==3 else 'false')+\" AND g.\\"activationId\\"=\"+(\"'new-activation'\" if expected==3 else \"'original-activation'\")+\";\"
    if self.query(sql).decode().strip()!='1':raise ValueError('Restored old-job facts differ')
    controls=json.load(open(sys.argv[2].rsplit('/',1)[0]+'/observed-controls.json'))
    for table,rows in controls.items():
     quoted='\\"'+table.replace('\\"','\\"\\"')+'\\"'
     restored=self.query("SET TIME ZONE 'UTC'; SELECT row_to_json(t)::text FROM "+quoted+" t ORDER BY row_to_json(t)::text;").decode().splitlines()
     if restored!=rows:raise ValueError('Restored exact Chat/history/user controls differ: '+table)
    observed.append(True)
  finally:super().__exit__(*error)
verifier.PrivatePostgres=ObservedPostgres
proof=verifier.verify_archive(sys.argv[2],json.load(open(sys.argv[3])),json.load(open(sys.argv[4])),sys.argv[5])
if observed!=[True]:raise ValueError('Restored facts observation absent')
proof['restoredOldJobFactsVerified']=True
proof['restoredExactChatControlsVerified']=True
print(json.dumps(proof))`;

  const verify=result=>{assert.equal(result.status,0,'full schema private recovery failed: '+result.stderr);const p=JSON.parse(result.stdout);assert.equal(p.restoredSnapshotHash,prep.snapshotHash);assert.equal(p.selectiveRestoreVerified,true);assert.equal(p.restoredOldJobFactsVerified,true);assert.equal(p.restoredExactChatControlsVerified,true);assert.equal(p.controlsUnchanged,true);assert.equal(p.fullRestoreAudit.dataMatches,true);assert.equal(p.selectiveRestoreAudit.dataMatches,true);return p;};
  proof=verify(spawnSync('python3',['-c',script,path.join(root,'ops/backup/lifecycle'),archive,path.join(directory,'job.json'),path.join(directory,'manifest.json'),path.join(root,'server/scripts/store-lifecycle-verify-copy.py'),String(grantRevision)],{timeout:120000,encoding:'utf8',maxBuffer:1048576,env:{PATH:process.env.PATH,LANG:'C.UTF-8'}}));
  if(process.env.CI)assert.ok(process.env.MWS_LIFECYCLE_RECOVERY_IMAGE,'PG18 recovery image required');
  if(process.env.MWS_LIFECYCLE_RECOVERY_IMAGE)proof=verify(spawnSync('docker',['run','--rm','--network=none','--memory=256m','--pids-limit=80','--mount',`type=bind,source=${directory},target=/fixture,readonly`,'--entrypoint','python3',process.env.MWS_LIFECYCLE_RECOVERY_IMAGE,'-c',script,'/backup/lifecycle','/fixture/fixture.dump','/fixture/job.json','/fixture/manifest.json','/backup/lifecycle/store-lifecycle-verify-copy.py',String(grantRevision)],{timeout:120000,encoding:'utf8',maxBuffer:1048576}));
  assert.deepEqual(await allRows(),before,'private archive verification cannot change source rows');
  const result=await core.execute(db,actor,{...scope,...prep});assert.equal(result.deleted.some(r=>r.table==='MonthlyInventorySnapshot'),false);assert.equal(result.kept.find(r=>r.name==='MonthlyInventorySnapshot').rowCount,1);assert.equal(result.generation,'1');
  assert.equal((await core.execute(db,actor,{...scope,...prep})).idempotentReplay,true);
  await core.reopen(db,actor,{...scope,operationId:prep.operationId});
  const expected=structuredClone(before);for(const table of ['StoreProduct','StockMovement','MonthlyInventoryCaptureGrant','MonthlyInventoryCaptureJob','StoreChatMessage','StoreChatDelivery','StoreChatReaction'])expected[table]=expected[table].filter(r=>JSON.parse(r.row).storeId!=='target');
  assert.deepEqual(await allRows(),expected,'reset removes target business stock but preserves exact detached history, shared Product and sibling/foreign controls');
  await validateMonthlyInventorySnapshotSchema(db);
  // Even a genuinely current generation cannot reattach retired message
  // identities. Missing unrelated historical identities remain allowed.
  for(const sql of [`INSERT INTO "StoreChatDelivery"("messageId","userId","companyId","storeId") VALUES ('target-message','replay-delivery','fixture-company','target')`,`INSERT INTO "StoreChatReaction"("messageId","userId","companyId","storeId","reaction") VALUES ('target-message','replay-reaction','fixture-company','target','👍')`,`INSERT INTO "StoreChatMessage"("id","companyId","storeId","senderId","body","updatedAt","replyToId") VALUES ('replay-reply','fixture-company','target','grant-owner','SYNTHETIC',NOW(),'target-message')`]){
   await assert.rejects(db.$executeRawUnsafe(sql),/STORE_LIFECYCLE_RETIRED_REFERENCE/);
   await assert.rejects(db.$transaction(async tx=>{await assertLifecycleMutation(tx,scope,'1');await tx.$executeRawUnsafe(sql)}),/STORE_LIFECYCLE_RETIRED_REFERENCE/);
  }
  assert.deepEqual(await allRows(),expected,'retired references preserve all exact controls and shared users');
  await db.$transaction(async tx=>{await assertLifecycleMutation(tx,scope,'1');await tx.$executeRawUnsafe(`INSERT INTO "StoreChatDelivery"("messageId","userId","companyId","storeId") VALUES ('different-absent-history','historical-actor','fixture-company','target')`)});
  await db.$transaction(async tx=>{await assertLifecycleMutation(tx,scope,'1');await tx.$executeRawUnsafe(`DELETE FROM "StoreChatDelivery" WHERE "messageId"='different-absent-history' AND "userId"='historical-actor'`)});assert.deepEqual(await allRows(),expected);
  await assert.rejects(db.$transaction(tx=>assertLifecycleMutation(tx,scope,'0')),e=>e.code==='STORE_LIFECYCLE_STALE_GENERATION');
  await assert.rejects(core.prepare(db,actor,scope,'DELETE'),/Monthly inventory snapshot history blocks store deletion/);
 }finally{for(const key of envKeys){if(previousEnv[key]===undefined)delete process.env[key];else process.env[key]=previousEnv[key]}await db?.$disconnect();try{if(created)await admin.$executeRawUnsafe(`DROP DATABASE ${q(name)}`);}finally{await admin.$disconnect();await rm(directory,{recursive:true,force:true});}}
});
