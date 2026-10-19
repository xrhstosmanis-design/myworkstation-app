import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {provisionAssistantHistory} from '../src/services/assistant-history-provision.js';
import {readHistoryRetentionReady} from '../src/services/assistant-history-readiness.js';
import {reviewedFreshStoreManifest} from '../src/services/store-lifecycle-manifest.js';
import {createLifecycleExecutionCore} from '../src/services/store-lifecycle-executor.js';
import {createAssistantHistoryRepository} from '../src/services/assistant-history-repository.js';
import {historyScopeKey,emptyHistoryArchive} from '../src/services/assistant-history-contract.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
const secret='isolated-history-retention-signing-secret';
const run=(file,env)=>new Promise((resolve,reject)=>{const p=spawn('python3',[file],{env,stdio:['ignore','pipe','pipe']});let out='',err='';const timer=setTimeout(()=>{p.kill();reject(Error('isolated cleanup timeout'))},30000);p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',e=>{clearTimeout(timer);reject(e)});p.on('close',code=>{clearTimeout(timer);resolve({code,out,err})})});
test('native provisioning is idempotent and refuses altered schemas; scheduled cleanup erases expired prose with tombstones and signed readiness, deferring real lifecycle/archive locks',{skip:!isolated(),timeout:120000},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='history_activation_'+randomUUID().replaceAll('-','');
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()}),locker=new PrismaClient({datasourceUrl:url.toString()});
 const env={...process.env,DATABASE_URL:url.toString(),ASSISTANT_HISTORY_CLEANUP_ENABLED:'true',BACKUP_MONITOR_SECRET:secret,RENDER_GIT_COMMIT:'f'.repeat(40)};
 const cleanup=async patch=>{const r=await run(new URL('../../ops/backup/history/cleanup.py',import.meta.url).pathname,{...env,...patch});assert.equal(r.code,0,r.out+' '+r.err);assert.equal(r.err,'');return JSON.parse(r.out)};
 const principal=(userId='actor',storeId='target')=>({userId,mode:'owner',companyId:'company',storeId,generation:'0',sessionId:'session',sessionVersion:1,capabilities:[]});
 const insert=async(a,expiresAt)=>db.$executeRaw`INSERT INTO "AssistantHistoryArchive"("scopeKey","revision","payload","requestId","digest","expiresAt","actorId","mode","companyId","storeId","generation") VALUES (${historyScopeKey(a)},1,'{"schemaVersion":1,"threads":["sensitive fixture prose"]}'::jsonb,${randomUUID()},${'a'.repeat(64)},${expiresAt},${a.userId},${a.mode},${a.companyId},${a.storeId},0)`;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  assert.equal((await cleanup()).state,'UNAVAILABLE');
  assert.equal((await cleanup({ASSISTANT_HISTORY_CLEANUP_ENABLED:'false'})).state,'DISABLED');
  const first=await provisionAssistantHistory(db);assert.equal(first.created,true);assert.equal(first.planHash,createHash('sha256').update(JSON.stringify(reviewedFreshStoreManifest())).digest('hex'));
  assert.equal((await provisionAssistantHistory(db)).created,false);
  await db.$executeRawUnsafe('ALTER TABLE "AssistantHistoryArchive" DROP CONSTRAINT "AssistantHistoryArchive_scope_binding"');
  await assert.rejects(provisionAssistantHistory(db),e=>e.code==='ASSISTANT_HISTORY_PROVISION_UNAVAILABLE');
  await db.$executeRawUnsafe('DROP TABLE "AssistantHistoryArchive"');await provisionAssistantHistory(db);
  await db.$executeRawUnsafe('CREATE TABLE "StoreLifecycleRuntime"("id" text PRIMARY KEY,"heartbeatJson" text NOT NULL,"mac" text NOT NULL)');
  assert.equal(await readHistoryRetentionReady(db,{secret}),false);
  const expired=new Date(Date.now()-10000),future=new Date(Date.now()+86400000);
  const a=principal(),b=principal('sibling-actor','sibling');await insert(a,expired);await insert(b,future);
  const before=await db.$queryRaw`SELECT row_to_json(t)::text AS row FROM "AssistantHistoryArchive" t ORDER BY "scopeKey"`;
  const tombstone=(await db.$queryRaw`SELECT "revision","requestId","digest","expiresAt","generation","scopeKey" FROM "AssistantHistoryArchive" WHERE "storeId"='target'`)[0];
  assert.equal((await cleanup()).erased,1);assert.equal(await readHistoryRetentionReady(db,{secret}),true);
  assert.deepEqual((await db.$queryRaw`SELECT "revision","requestId","digest","expiresAt","generation","scopeKey" FROM "AssistantHistoryArchive" WHERE "storeId"='target'`)[0],tombstone);
  assert.deepEqual((await db.$queryRaw`SELECT "payload" FROM "AssistantHistoryArchive" WHERE "storeId"='target'`)[0].payload,emptyHistoryArchive());
  assert.equal((await db.$queryRaw`SELECT row_to_json(t)::text AS row FROM "AssistantHistoryArchive" t WHERE "storeId"='sibling'`)[0].row,before.find(x=>x.row.includes('sibling')).row);
  assert.equal((await cleanup()).erased,0);
  await db.$executeRaw`UPDATE "StoreLifecycleRuntime" SET "mac"=${'0'.repeat(64)} WHERE "id"='assistant-history-cleanup'`;
  assert.equal(await readHistoryRetentionReady(db,{secret}),false);await cleanup();
  await db.$executeRawUnsafe(`INSERT INTO "AssistantHistoryArchive"("scopeKey","revision","payload","requestId","digest","expiresAt","actorId","mode","companyId","storeId","generation") SELECT jsonb_build_array('assistant-history-v1','batch-'||i,'owner','company','target','0')::text,1,'{"schemaVersion":1,"threads":["expired batch"]}'::jsonb,'00000000-0000-4000-8000-000000000000',repeat('a',64),NOW()-INTERVAL '1 day','batch-'||i,'owner','company','target',0 FROM generate_series(1,269) i`);
  assert.equal((await cleanup()).erased,256);assert.equal((await cleanup()).erased,13);

  const repo=createAssistantHistoryRepository({db,authorize:async()=>a});
  await assert.rejects(repo.save({}, {expectedRevision:0,requestId:tombstone.requestId,archive:emptyHistoryArchive()}),e=>e.code==='ASSISTANT_HISTORY_EXPIRED');
  // Reintroducing an expired row (SQL fixture, not an independent pg_restore proof) cannot bypass cleanup.
  await db.$executeRaw`UPDATE "AssistantHistoryArchive" SET "payload"='{"schemaVersion":1,"threads":["restored expired prose"]}'::jsonb WHERE "scopeKey"=${historyScopeKey(a)}`;
  assert.equal((await cleanup()).erased,1);
  // Real current guards, exact shared fence and unchanged stored generation.
  await db.$executeRawUnsafe('CREATE TABLE "Store"("id" text PRIMARY KEY,"companyId" text NOT NULL)');await db.$executeRaw`INSERT INTO "Store" VALUES ('target','company'),('sibling','company')`;
  const manifest={id:'ISOLATED_HISTORY_RETENTION',tables:[{name:'Store',owner:{kind:'ROOT'},reset:'KEEP'},{name:'AssistantHistoryArchive',owner:{kind:'DIRECT'},reset:'REMOVE'}],reviewedColumns:['AssistantHistoryArchive.payload','AssistantHistoryArchive.actorId','AssistantHistoryArchive.requestId']};
  const core=createLifecycleExecutionCore(manifest,{sourceRevision:'a'.repeat(40),persistAndVerifyRecovery:async()=>assert.fail('cleanup must not execute recovery')});
  await core.install(db,{isSuperAdmin:true,id:'admin'},{companyId:'company',storeId:'target'});
  await assert.rejects(provisionAssistantHistory(db),e=>e.code==='ASSISTANT_HISTORY_PROVISION_UNAVAILABLE');
  await db.$executeRaw`UPDATE "AssistantHistoryArchive" SET "payload"='{"schemaVersion":1,"threads":["expired guarded prose"]}'::jsonb WHERE "scopeKey"=${historyScopeKey(a)}`;
  let rowRelease,rowLocked;const rowReady=new Promise(r=>rowLocked=r),rowGate=new Promise(r=>rowRelease=r);
  const rowHolder=locker.$transaction(async tx=>{await tx.$queryRaw`SELECT "scopeKey" FROM "AssistantHistoryArchive" WHERE "scopeKey"=${historyScopeKey(a)} FOR UPDATE`;rowLocked();await rowGate},{timeout:10000});await rowReady;
  try{assert.equal((await cleanup()).erased,0)}finally{rowRelease();await rowHolder}
  assert.equal((await cleanup()).erased,1);
  await db.$executeRaw`UPDATE "AssistantHistoryArchive" SET "payload"='{"schemaVersion":1,"threads":["expired fence fixture"]}'::jsonb WHERE "scopeKey"=${historyScopeKey(a)}`;
  let release,locked;const ready=new Promise(r=>locked=r),gate=new Promise(r=>release=r);
  const holder=locker.$transaction(async tx=>{await tx.$queryRaw`SELECT "storeId" FROM "StoreLifecycleFence" WHERE "storeId"='target' FOR UPDATE`;locked();await gate},{timeout:10000});await ready;
  try{const r=await cleanup();assert.equal(r.erased,0);assert.equal(r.deferredScopes,1)}finally{release();await holder}
  await db.$executeRaw`UPDATE "StoreLifecycleFence" SET "maintenance"=true WHERE "storeId"='target'`;
  assert.equal((await cleanup()).deferredScopes,1);
  await db.$executeRaw`UPDATE "StoreLifecycleFence" SET "maintenance"=false,"generation"=9007199254740993 WHERE "storeId"='target'`;
  assert.equal((await cleanup()).erased,1,'fresh cleanup uses locked current epoch without rewriting original row generation');
  assert.equal((await db.$queryRaw`SELECT "generation"::text AS generation FROM "AssistantHistoryArchive" WHERE "scopeKey"=${historyScopeKey(a)}`)[0].generation,'0');
  assert.equal((await db.$queryRaw`SELECT row_to_json(t)::text AS row FROM "AssistantHistoryArchive" t WHERE "storeId"='sibling'`)[0].row,before.find(x=>x.row.includes('sibling')).row);
 }finally{await locker.$disconnect();await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
