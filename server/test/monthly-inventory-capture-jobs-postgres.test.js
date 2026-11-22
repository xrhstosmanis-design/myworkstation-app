import {ensureStoreChatInteractions} from '../src/chat-interactions.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {ensureBackofficeStaffSchema} from '../src/backoffice-staff-bootstrap.js';
import {provisionAiWalletRecovery} from '../src/services/ai-owner-wallet-schema.js';
import {provisionFtextRecoverySchema} from '../src/services/ftext-cash-schema.js';
import {createLifecycleInstallationCore} from '../src/services/store-lifecycle-executor.js';
import {createMonthlyInventorySnapshotSchema} from '../src/services/monthly-inventory-snapshot-schema.js';
import {createMonthlyInventoryCaptureSchema,monthlyInventoryCaptureLifecycleManifestProposal} from '../src/services/monthly-inventory-capture-schema.js';
import {monthlyInventorySnapshotPeriod} from '../src/services/monthly-inventory-snapshot-period.js';
import {assertLifecycleMutation} from '../src/services/store-lifecycle-generation.js';
import {captureMonthlyInventorySnapshotForAutomation} from '../src/services/monthly-inventory-snapshot-capture.js';
import {createMonthlyInventoryCaptureJobs} from '../src/services/monthly-inventory-capture-jobs.js';
import {createMonthlyInventorySnapshotRepository} from '../src/services/monthly-inventory-snapshot-repository.js';
import {buildMonthlyInventorySnapshotCandidate,serializeMonthlyInventorySnapshotCandidate} from '../src/services/monthly-inventory-snapshot-payload.js';
import {monthlyCaptureLatestDuePeriod} from '../src/services/monthly-inventory-capture-authorization.js';

const metadata=JSON.parse(readFileSync(new URL('./fixtures/ftext-full-schema-metadata-20261024.json',import.meta.url)));
const q=s=>'"'+s.replaceAll('"','""')+'"',literal=s=>"'"+s.replaceAll("'","''")+"'",revision='a'.repeat(40);
const fixed={type:'SERVICE_DELEGATION',purpose:'MONTHLY_INVENTORY_CAPTURE',executor:'MONTHLY_INVENTORY_CAPTURE_V1'};
const controlKey='MWS_MONTHLY_INVENTORY_CAPTURE_CONTROL';
const control={v:1,purpose:'MONTHLY_INVENTORY_CAPTURE',serviceId:'srv-d9isenfavr4c73bdh52g',epoch:'11111111-1111-4111-8111-111111111111',issuedAt:'2000-01-01T00:00:00.000Z',notBefore:'2000-01-02T00:00:00.000Z',enabled:true};
function isolated(){try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&!u.search&&!u.hash&&/^\/[^/]*test[^/]*$/i.test(decodeURIComponent(u.pathname))}catch{return false}}
function activate(){
 const keys=['RENDER_GIT_COMMIT','GIT_COMMIT','RENDER_SERVICE_ID',controlKey],old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 process.env.RENDER_GIT_COMMIT=revision;process.env.GIT_COMMIT=revision;process.env.RENDER_SERVICE_ID=control.serviceId;process.env[controlKey]=JSON.stringify(control);
 return ()=>{for(const key of keys){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key]}};
}
async function now(db){return (await db.$queryRawUnsafe(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS now`))[0].now}
function dueAt(instant){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit'}).formatToParts(new Date(instant)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 const prior=n=>new Date(Date.UTC(+parts.year,+parts.month-1-n,1)).toISOString().slice(0,7);
 const period=monthlyInventorySnapshotPeriod(prior(1));return period.scheduledFor<=instant?period:monthlyInventorySnapshotPeriod(prior(2));
}
async function fixture(){
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),name='monthly_jobs_'+randomBytes(10).toString('hex')+'_test';let db,other,created=false;
 try{
  assert.ok(isolated());await admin.$executeRawUnsafe(`CREATE DATABASE ${q(name)}`);created=true;
  const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;db=new PrismaClient({datasourceUrl:url.href});other=new PrismaClient({datasourceUrl:url.href});
  for(const e of metadata.enums)await db.$executeRawUnsafe(`CREATE TYPE ${q(e.name)} AS ENUM (${e.labels.map(literal).join(',')})`);
  await db.$executeRawUnsafe(`CREATE SEQUENCE "CloudChange_sequence_seq" AS bigint START 1 INCREMENT 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE`);
  for(const table of new Set(metadata.columns.map(c=>c.table)))await db.$executeRawUnsafe(`CREATE TABLE ${q(table)} (${metadata.columns.filter(c=>c.table===table).map(c=>`${q(c.name)} ${c.type}${c.required?' NOT NULL':''}`).join(',')})`);
  for(const fn of metadata.functions)await db.$executeRawUnsafe(fn);
  for(const c of metadata.columns.filter(c=>c.default!==null))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ALTER COLUMN ${q(c.name)} SET DEFAULT ${c.default}`);
  for(const kind of ['p','u','c'])for(const c of metadata.constraints.filter(c=>c.kind===kind))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
  for(const index of metadata.indexes)await db.$executeRawUnsafe(index);
  for(const c of metadata.constraints.filter(c=>c.kind==='f'))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
  for(const trigger of metadata.triggers){await db.$executeRawUnsafe(trigger.definition);await db.$executeRawUnsafe(`ALTER TABLE ${q(trigger.table)} ${trigger.enabled==='A'?'ENABLE ALWAYS':trigger.enabled==='D'?'DISABLE':'ENABLE'} TRIGGER ${q(trigger.name)}`)}
  await provisionFtextRecoverySchema(db);await provisionAiWalletRecovery(db);await ensureBackofficeStaffSchema(db);
  await ensureStoreChatInteractions(db);
  await db.$executeRawUnsafe(`INSERT INTO "Company"("id","name","updatedAt") VALUES ('company','SYNTHETIC',NOW()),('foreign-company','CONTROL',NOW())`);
  await db.$executeRawUnsafe(`UPDATE "Company" SET "licenseStatus"='ACTIVE'`);
  await db.$executeRawUnsafe(`INSERT INTO "User"("id","email","passwordHash","fullName","role","companyId","mustChangePassword","updatedAt") VALUES ('owner','jobs@example.invalid','NO_LOGIN','SYNTHETIC','OWNER','company',false,NOW())`);
  await db.$executeRawUnsafe(`INSERT INTO "UserSession"("id","userId","expiresAt") VALUES ('owner-session','owner',NOW()+INTERVAL '1 hour')`);
  await db.$executeRawUnsafe(`INSERT INTO "CompanyModule"("id","companyId","moduleKey","active","updatedAt") VALUES ('inventory','company','INVENTORY',true,NOW())`);
  const stores=['concurrent','expired','crash','off-write','missing-snapshot','revoked','transient','retry-limit','old-slot','wait-current','foreign-control'];
  for(const id of stores)await db.$executeRawUnsafe(`INSERT INTO "Store"("id","name","companyId","updatedAt") VALUES ($1,'SYNTHETIC','company',NOW())`,id);
  await db.$executeRawUnsafe(`INSERT INTO "Store"("id","name","companyId","updatedAt") VALUES ('foreign','CONTROL','foreign-company',NOW())`);
  await db.$transaction(async tx=>{await createMonthlyInventorySnapshotSchema(tx);await createMonthlyInventoryCaptureSchema(tx)});
  const due=dueAt(await now(db)),core=createLifecycleInstallationCore(monthlyInventoryCaptureLifecycleManifestProposal(),{sourceRevision:revision});
  for(const id of stores){
   await core.install(db,{id:'synthetic-installer',isSuperAdmin:true},{companyId:'company',storeId:id});
   await db.$executeRawUnsafe(`INSERT INTO "MonthlyInventoryCaptureGrant"("id","companyId","storeId","purpose","lifecycleGeneration","active","delegatorUserId","delegatorSessionVersion","activationId","firstIssueMonth","firstScheduledFor","createdByUserId","createdAt","grantedByUserId","grantedAt","updatedByUserId") VALUES ($1,'company',$2,'MONTHLY_INVENTORY_CAPTURE',0,true,'owner',0,$3,'2000-01','2000-02-01T05:00:00.000Z','owner','2000-01-01T00:00:00.000Z','owner','2000-01-01T00:00:00.000Z','owner')`,'grant-'+id,id,'activation-'+id);
  }
  const manager=createMonthlyInventoryCaptureJobs(db,{sourceRevision:revision});
  async function mutate(storeId,perform){return db.$transaction(async tx=>{await assertLifecycleMutation(tx,{companyId:'company',storeId},'0');return perform(tx)})}
  async function leased(storeId,client=db,sourceRevision=revision){const jobs=createMonthlyInventoryCaptureJobs(client,{sourceRevision}),produced=await jobs.produce({...fixed,grantId:'grant-'+storeId}),claim=await jobs.claim({...fixed,jobId:produced.jobId});return {...claim,jobs,db:client,storeId};}
  return {db,other,due,core,manager,mutate,leased,async close(){await other.$disconnect();await db.$disconnect();await admin.$executeRawUnsafe(`DROP DATABASE ${q(name)}`);await admin.$disconnect()}};
 }catch(error){await other?.$disconnect();await db?.$disconnect();if(created)await admin.$executeRawUnsafe(`DROP DATABASE ${q(name)}`);await admin.$disconnect();throw error}
}
async function jobRow(f,id){return (await f.db.$queryRawUnsafe(`SELECT row_to_json(j)::text AS row FROM "MonthlyInventoryCaptureJob" j WHERE "id"=$1`,id))[0]?.row}
async function snapshots(f,storeId){return f.db.$queryRawUnsafe(`SELECT "candidateJsonText","sourceHash","payloadHash","storedBytesSha256","capturePrincipal","sourceCoverage" FROM "MonthlyInventorySnapshot" WHERE "storeId"=$1 ORDER BY "id"`,storeId)}
function intercepted(db,afterQuery){return {$transaction:(perform,options)=>db.$transaction(tx=>perform(new Proxy(tx,{get(target,key){if(key==='$queryRawUnsafe')return async(sql,...args)=>{const rows=await target.$queryRawUnsafe(sql,...args);await afterQuery(sql,target,rows);return rows};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})),options),$queryRawUnsafe:db.$queryRawUnsafe.bind(db)}}

test('native monthly jobs use one immutable slot, exclusive leases and verified snapshot settlement without business postings',{skip:!isolated()&&!process.env.CI?'Actual isolated PostgreSQL unavailable locally':false,timeout:600000},async t=>{
 assert.ok(isolated(),'Actual isolated PostgreSQL is mandatory in CI');const restore=activate();let f;
 try{
  f=await fixture();
  const controlBefore=await f.db.$queryRawUnsafe(`SELECT row_to_json(g)::text AS row FROM "MonthlyInventoryCaptureGrant" g WHERE "storeId"='foreign-control'`);
  await t.test('two producers retain one immutable latest-due job and two claimers get exactly one lease',async()=>{
   const input={...fixed,grantId:'grant-concurrent'},produced=await Promise.all([f.manager.produce(input),f.manager.produce(input)]);
   assert.equal(new Set(produced.map(r=>r.jobId)).size,1);assert.deepEqual(produced.map(r=>r.status).sort(),['ALREADY_EXISTS','CREATED']);
   assert.equal(produced[0].job.issueMonth,f.due.issueMonth);
   const claims=await Promise.allSettled([f.manager.claim({...fixed,jobId:produced[0].jobId}),createMonthlyInventoryCaptureJobs(f.other,{sourceRevision:revision}).claim({...fixed,jobId:produced[0].jobId})]);
   assert.equal(claims.filter(r=>r.status==='fulfilled').length,1);assert.equal(claims.filter(r=>r.status==='rejected').length,1);
   const lease=claims.find(r=>r.status==='fulfilled').value;
   assert.equal(lease.attemptNumber,1);assert.match(lease.execution.leaseToken,/^[a-f0-9]{64}$/);assert.deepEqual(lease.attempt,{});assert.ok(Object.isFrozen(lease.attempt));
   const [row]=await f.db.$queryRawUnsafe(`SELECT "leaseTokenHash","claimedSourceRevision",EXTRACT(EPOCH FROM ("leaseExpiresAt"-"updatedAt"))::text AS seconds FROM "MonthlyInventoryCaptureJob" WHERE "id"=$1`,lease.jobId);
   assert.notEqual(row.leaseTokenHash,lease.execution.leaseToken);assert.equal(row.claimedSourceRevision,revision);assert.equal(Number(row.seconds),120);
  });
  await t.test('an expired executor cannot finish or touch a replacement token and origin never changes',async()=>{
   const first=await f.leased('expired');await f.mutate('expired',tx=>tx.$executeRawUnsafe(`UPDATE "MonthlyInventoryCaptureJob" SET "leaseExpiresAt"=clock_timestamp()-INTERVAL '1 second' WHERE "id"=$1`,first.jobId));
   await assert.rejects(first.jobs.settleSuccess(first.execution,first.attempt));
   const replacement=await first.jobs.claim({...fixed,jobId:first.jobId}),before=await jobRow(f,first.jobId);
   assert.equal(replacement.attemptNumber,2);assert.notEqual(replacement.execution.leaseToken,first.execution.leaseToken);
   await assert.rejects(first.jobs.settleSuccess(first.execution,first.attempt));assert.equal(await jobRow(f,first.jobId),before);
   assert.equal(JSON.parse(before).grantRevision,1);assert.equal(JSON.parse(before).activationId,'activation-expired');
  });
  await t.test('a committed snapshot survives a worker crash and a new revision replays original bytes without reading stock',async()=>{
   const first=await f.leased('crash'),captured=await captureMonthlyInventorySnapshotForAutomation(f.db,first.execution,first.attempt);
   assert.equal(captured.status,'STORED');const original=await snapshots(f,'crash');assert.equal(original.length,1);
   await f.mutate('crash',tx=>tx.$executeRawUnsafe(`UPDATE "MonthlyInventoryCaptureJob" SET "leaseExpiresAt"=clock_timestamp()-INTERVAL '1 second' WHERE "id"=$1`,first.jobId));
   const nextRevision='c'.repeat(40);process.env.RENDER_GIT_COMMIT=nextRevision;process.env.GIT_COMMIT=nextRevision;
   try{
    const jobs=createMonthlyInventoryCaptureJobs(f.db,{sourceRevision:nextRevision}),next=await jobs.claim({...fixed,jobId:first.jobId});assert.equal(next.attemptNumber,2);
    await f.db.$executeRawUnsafe(`ALTER TABLE "Product" RENAME TO "SyntheticHiddenProduct"`);
    try{
     const replay=await captureMonthlyInventorySnapshotForAutomation(f.db,next.execution,next.attempt);assert.equal(replay.sourceReadPerformed,false);assert.equal(replay.status,'ALREADY_CAPTURED');
     const result=await jobs.settleSuccess(next.execution,next.attempt);assert.equal(result.status,'SUCCEEDED');assert.equal(result.receipt.candidateJsonText,original[0].candidateJsonText);
     assert.deepEqual(await snapshots(f,'crash'),original);assert.deepEqual(await jobs.runGrant('grant-crash'),{status:'ALREADY_SETTLED',attempted:0,jobId:first.jobId});
    }finally{await f.db.$executeRawUnsafe(`ALTER TABLE "SyntheticHiddenProduct" RENAME TO "Product"`)}
   }finally{process.env.RENDER_GIT_COMMIT=revision;process.env.GIT_COMMIT=revision}
  });
  await t.test('OFF observed after actual INSERT rolls back the snapshot and an old attempt cannot revive',async()=>{
   let changed=false;const client=intercepted(f.db,async sql=>{if(!changed&&sql.includes('INSERT INTO "MonthlyInventorySnapshot"')){changed=true;process.env[controlKey]=JSON.stringify({...control,enabled:false})}}),lease=await f.leased('off-write',client),before=await jobRow(f,lease.jobId);
   try{await assert.rejects(captureMonthlyInventorySnapshotForAutomation(client,lease.execution,lease.attempt));assert.equal(changed,true);assert.equal((await snapshots(f,'off-write')).length,0);assert.equal(await jobRow(f,lease.jobId),before)}finally{process.env[controlKey]=JSON.stringify(control)}
   await assert.rejects(captureMonthlyInventorySnapshotForAutomation(client,lease.execution,lease.attempt));assert.equal((await snapshots(f,'off-write')).length,0);
  });
  await t.test('actual unique-index wait and readback are followed by the final DB clock and latest-period check',async()=>{
   // Composed proof: real SQL wait/commit and unmodified actual clock response;
   // the exact monthly rollover classification is the separate pure test.
   const events=[],client=intercepted(f.db,async(sql,tx,rows)=>{
    if(sql.includes('INSERT INTO "MonthlyInventorySnapshot"'))events.push({type:'INSERT_RETURNED'});
    if(rows[0]?.readAt&&Object.hasOwn(rows[0],'jobGeneration'))events.push({type:'FINAL_CLOCK',readAt:rows[0].readAt});
   }),lease=await f.leased('wait-current',client),instant=await now(f.db);
   const candidate=buildMonthlyInventorySnapshotCandidate({companyId:'company',storeId:lease.storeId,lifecycleGeneration:'0',issueMonth:f.due.issueMonth,sourceObservedAt:instant,sourceRevision:revision,valuationBasis:'CURRENT_OPERATIONAL_V1',coverage:{complete:true,productCount:0,invoiceCount:0,pendingOriginalCount:0},products:[],invoices:{period:f.due.issueMonth,items:[]},pendingOriginals:{period:'ALL_MONTHS',items:[]}});
   const facts={candidateJsonText:serializeMonthlyInventorySnapshotCandidate(candidate),transactionStartedAt:instant,sourceReadStartedAt:instant,sourceReadFinishedAt:instant};
   let enter,release;const entered=new Promise(resolve=>{enter=resolve}),held=new Promise(resolve=>{release=resolve});
   const personalDb={$transaction:(perform,options)=>f.other.$transaction(async tx=>{const result=await perform(tx);enter(result);await held;return result},options)};
   const actor={id:'owner',companyId:'company',role:'OWNER',platformRole:'OWNER',isSuperAdmin:false,tokenType:'BACKOFFICE_USER',sessionId:'owner-session',sessionVersion:0};
   const personal=createMonthlyInventorySnapshotRepository(personalDb).store(actor,facts).then(value=>({value}),error=>({error}));let typed,problem;
   try{
    const winner=await Promise.race([entered,personal.then(r=>{if(r.error)throw r.error;return r.value})]);assert.equal(winner.status,'STORED');events.length=0;
    typed=createMonthlyInventorySnapshotRepository(client,{sourceRevision:revision,attempt:lease.attempt}).storeAutomation(lease.execution,facts).then(value=>({value}),error=>({error}));
    let blocked=false;const deadline=Date.now()+2000;
    while(Date.now()<deadline){const [row]=await f.db.$queryRawUnsafe(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%INSERT INTO "MonthlyInventorySnapshot"%') AS blocked`);if(row.blocked){blocked=true;break}await new Promise(resolve=>setTimeout(resolve,20))}
    assert.equal(blocked,true,'typed writer must actually wait on the original unique slot');
   }catch(error){problem=error}finally{release()}
   const first=await personal,result=typed?await typed:null;if(problem)throw problem;if(first.error)throw first.error;if(result?.error)throw result.error;
   assert.equal(result.value.status,'ALREADY_CAPTURED');assert.equal(result.value.candidateJsonText,first.value.candidateJsonText);
   const insert=events.findIndex(e=>e.type==='INSERT_RETURNED'),last=events.at(-1);assert.ok(insert>=0);assert.equal(last.type,'FINAL_CLOCK');assert.ok(events.length-1>insert);
   assert.equal(result.value.issueMonth,monthlyCaptureLatestDuePeriod(last.readAt).issueMonth);assert.equal((await snapshots(f,lease.storeId)).length,1);
  });
  await t.test('a supplied success cannot settle a missing snapshot and revoked authority leaves the original job unchanged',async()=>{
   const missing=await f.leased('missing-snapshot'),before=await jobRow(f,missing.jobId);
   await assert.rejects(missing.jobs.settleSuccess(missing.execution,missing.attempt),{code:'MONTHLY_CAPTURE_SNAPSHOT_UNAVAILABLE'});assert.equal(await jobRow(f,missing.jobId),before);
   await assert.rejects(missing.jobs.settleSuccess(missing.execution,missing.attempt,{status:'SUCCEEDED'}),{code:'MONTHLY_CAPTURE_INPUT_INVALID'});
   const revoked=await f.leased('revoked');await captureMonthlyInventorySnapshotForAutomation(f.db,revoked.execution,revoked.attempt);const stored=await snapshots(f,'revoked');
   await f.mutate('revoked',tx=>tx.$executeRawUnsafe(`UPDATE "MonthlyInventoryCaptureGrant" SET "revision"="revision"+1,"active"=false,"revokedByUserId"='owner',"revokedAt"=clock_timestamp(),"updatedByUserId"='owner',"updatedAt"=clock_timestamp() WHERE "id"='grant-revoked'`));
   const stale=await jobRow(f,revoked.jobId);await assert.rejects(revoked.jobs.settleSuccess(revoked.execution,revoked.attempt));assert.equal(await jobRow(f,revoked.jobId),stale);assert.deepEqual(await snapshots(f,'revoked'),stored);
  });
  await t.test('real PostgreSQL source cancellation schedules a bounded retry rather than accepting caller failure evidence',async()=>{
   let delayed=false;const client={$transaction:(perform,options)=>f.db.$transaction(tx=>perform(new Proxy(tx,{get(target,key){if(key==='$queryRawUnsafe')return async(sql,...args)=>{if(!delayed&&sql.startsWith('WITH source AS MATERIALIZED')){delayed=true;await target.$queryRawUnsafe('SELECT 1 AS delayed FROM pg_sleep(9)')}return target.$queryRawUnsafe(sql,...args)};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})),options),$queryRawUnsafe:f.db.$queryRawUnsafe.bind(f.db)};
   const result=await createMonthlyInventoryCaptureJobs(client,{sourceRevision:revision}).runGrant('grant-transient');assert.equal(delayed,true);assert.equal(result.status,'FAILED');assert.equal(result.attempted,1);
   const row=JSON.parse(await jobRow(f,result.jobId));assert.equal(row.attempt,1);assert.equal(row.status,'FAILED');assert.equal(row.leaseTokenHash,null);assert.equal(row.leaseExpiresAt,null);assert.equal(row.claimedSourceRevision,null);assert.equal(row.holdReason,null);
   assert.equal((new Date(row.nextAttemptAt)-new Date(row.updatedAt))/1000,60);assert.equal((await snapshots(f,'transient')).length,0);
   const before=await jobRow(f,result.jobId);await assert.rejects(f.manager.claim({...fixed,jobId:result.jobId}),{code:'MONTHLY_CAPTURE_RETRY_NOT_DUE'});assert.equal(await jobRow(f,result.jobId),before);
  });
  await t.test('attempt59 boundary reaches terminal60 without any60-call replay and no further lease can be claimed',async()=>{
   const produced=await f.manager.produce({...fixed,grantId:'grant-retry-limit'});
   await f.mutate('retry-limit',tx=>tx.$executeRawUnsafe(`UPDATE "MonthlyInventoryCaptureJob" SET "status"='FAILED',"attempt"=59,"nextAttemptAt"=clock_timestamp()-INTERVAL '1 second',"updatedAt"=clock_timestamp() WHERE "id"=$1`,produced.jobId));
   await f.db.$executeRawUnsafe(`ALTER TABLE "Product" RENAME TO "SyntheticHiddenProduct"`);
   try{const result=await f.manager.runGrant('grant-retry-limit');assert.equal(result.status,'FAILED');assert.equal(result.reason,'RETRY_LIMIT')}finally{await f.db.$executeRawUnsafe(`ALTER TABLE "SyntheticHiddenProduct" RENAME TO "Product"`)}
   const row=JSON.parse(await jobRow(f,produced.jobId));assert.equal(row.attempt,60);assert.equal(row.status,'FAILED');assert.equal(row.holdReason,'RETRY_LIMIT');assert.equal(row.nextAttemptAt,null);assert.equal(row.leaseTokenHash,null);
   const before=await jobRow(f,produced.jobId);await assert.rejects(f.manager.claim({...fixed,jobId:produced.jobId}),{code:'MONTHLY_CAPTURE_RETRY_LIMIT'});assert.equal(await jobRow(f,produced.jobId),before);
  });
  await t.test('an older live month blocks a second store lease, but older jobs never become catch-up captures',async()=>{
   const produced=await f.manager.produce({...fixed,grantId:'grant-old-slot'}),date=new Date(f.due.issueMonth+'-01T00:00:00.000Z');date.setUTCMonth(date.getUTCMonth()-1);const old=monthlyInventorySnapshotPeriod(date.toISOString().slice(0,7));
   await f.mutate('old-slot',tx=>tx.$executeRawUnsafe(`INSERT INTO "MonthlyInventoryCaptureJob"("id","companyId","storeId","purpose","lifecycleGeneration","issueMonth","scheduledFor","grantId","grantRevision","activationId","status","attempt","leaseTokenHash","leaseExpiresAt","claimedSourceRevision") VALUES ('old-live','company','old-slot','MONTHLY_INVENTORY_CAPTURE',0,$1,$2::timestamptz,'grant-old-slot',1,'activation-old-slot','LEASED',1,$3,clock_timestamp()+INTERVAL '1 minute',$4)`,old.issueMonth,old.scheduledFor,'b'.repeat(64),revision));
   const before=await jobRow(f,produced.jobId);await assert.rejects(f.manager.claim({...fixed,jobId:produced.jobId}),{code:'MONTHLY_CAPTURE_STORE_ALREADY_LEASED'});assert.equal(await jobRow(f,produced.jobId),before);
   await f.mutate('old-slot',tx=>tx.$executeRawUnsafe(`UPDATE "MonthlyInventoryCaptureJob" SET "leaseExpiresAt"=clock_timestamp()-INTERVAL '1 second' WHERE "id"='old-live'`));
   const oldBefore=await jobRow(f,'old-live');await assert.rejects(f.manager.claim({...fixed,jobId:'old-live'}),{code:'MONTHLY_CAPTURE_NOT_LATEST_DUE'});assert.equal(await jobRow(f,'old-live'),oldBefore);
   assert.equal((await f.manager.claim({...fixed,jobId:produced.jobId})).status,'LEASED');assert.equal((await snapshots(f,'old-slot')).length,0);
  });
  await t.test('actual bounded keyset scans advance across grants without producing or changing jobs',async()=>{
   const before=await f.db.$queryRawUnsafe(`SELECT row_to_json(j)::text AS row FROM "MonthlyInventoryCaptureJob" j ORDER BY "id"`);
   const first=await f.manager.scanEligibleGrants({after:null,limit:3});assert.equal(first.length,3);
   const tail=first.at(-1),second=await f.manager.scanEligibleGrants({after:{companyId:tail.companyId,storeId:tail.storeId,id:tail.id},limit:3});assert.equal(second.length,3);
   assert.equal(new Set([...first,...second].map(r=>r.id)).size,6);assert.ok(Object.isFrozen(first));
   assert.deepEqual(await f.db.$queryRawUnsafe(`SELECT row_to_json(j)::text AS row FROM "MonthlyInventoryCaptureJob" j ORDER BY "id"`),before);
  });
  assert.deepEqual(await f.db.$queryRawUnsafe(`SELECT row_to_json(g)::text AS row FROM "MonthlyInventoryCaptureGrant" g WHERE "storeId"='foreign-control'`),controlBefore);
  for(const table of ['StoreTransaction','StockMovement','CashShiftSession','Sale','Payment'])assert.equal((await f.db.$queryRawUnsafe(`SELECT count(*)::int AS count FROM ${q(table)}`))[0].count,0,'monthly snapshots must not post '+table);
 }finally{try{await f?.close()}finally{restore()}}
});
