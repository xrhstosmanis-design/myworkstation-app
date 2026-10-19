import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createAssistantHistoryRepository} from '../src/services/assistant-history-repository.js';
import {emptyHistoryArchive,historyScopeKey} from '../src/services/assistant-history-contract.js';
import {createLifecycleExecutionCore,lifecycleExecutionSnapshotHash} from '../src/services/store-lifecycle-executor.js';
import {STORE_RECOVERY_FORMAT,persistLifecycleRecovery,openLifecycleRecovery} from '../src/services/store-lifecycle-recovery.js';
const sql=readFileSync(new URL('../prisma/assistant-history-archive.sql',import.meta.url),'utf8');
const native=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
const principal=()=>({userId:'actor',mode:'owner',companyId:'company',storeId:'target',generation:'0',sessionId:'session',sessionVersion:1,capabilities:['cash_details']});
const archive=()=>({schemaVersion:1,threads:[{id:randomUUID(),title:'History',messages:[{id:randomUUID(),role:'assistant',content:'PRIVATE HISTORICAL TEXT',createdAt:'2026-10-19T09:00:00.000Z',requiredCapabilities:['cash_details']}]}]});
const mutation=(revision=0,a=archive())=>({requestId:randomUUID(),expectedRevision:revision,archive:a});
const createStore='CREATE TABLE "Store" ("id" text PRIMARY KEY,"companyId" text NOT NULL,"name" text)';
// Isolated review of the proposed row only. Never changes the live manifest/hash.
const manifest={id:'ISOLATED_ASSISTANT_HISTORY_REVIEW_V1',reviewedColumns:['AssistantHistoryArchive.actorId','AssistantHistoryArchive.requestId','AssistantHistoryArchive.payload','AssistantHistoryArchive.scopeKey'],tables:[{name:'Store',owner:{kind:'ROOT'},reset:'KEEP'},{name:'AssistantHistoryArchive',owner:{kind:'DIRECT'},reset:'REMOVE'}]};
test('native history physical scope, fenced reset race, scoped expiry purge and encrypted exact reset recovery',{skip:!native()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='history_lifecycle_'+randomUUID().replaceAll('-','');
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 const directory=await mkdtemp(path.join(tmpdir(),'history-recovery-')),key=randomBytes(32),actor={id:'admin',isSuperAdmin:true},scope={companyId:'company',storeId:'target'};
 let a=principal(),time=new Date('2026-10-19T09:00:00Z'),proofCount=0;
 const repo=createAssistantHistoryRepository({db,authorize:async()=>structuredClone(a),now:()=>time});
 const core=createLifecycleExecutionCore(manifest,{sourceRevision:'a'.repeat(40),persistAndVerifyRecovery:async snapshot=>{
  proofCount++;const options={directory,encryptionKey:key,keyId:'isolated-history-key',expectedScope:snapshot.scope,expectedManifestHash:snapshot.planHash,expectedSourceRevision:'a'.repeat(40)};
  const saved=await persistLifecycleRecovery({...snapshot,format:STORE_RECOVERY_FORMAT,manifestHash:snapshot.planHash,sourceRevision:'a'.repeat(40),createdAt:new Date().toISOString()},options);
  const opened=openLifecycleRecovery(await readFile(saved.artifactPath),options),restore='history_restore_'+randomUUID().replaceAll('-','');
  const restoreUrl=new URL(process.env.DATABASE_URL);restoreUrl.searchParams.set('schema',restore);const restored=new PrismaClient({datasourceUrl:restoreUrl.toString()});
  try{
   await admin.$executeRawUnsafe(`CREATE SCHEMA "${restore}"`);await restored.$executeRawUnsafe(createStore);await restored.$executeRawUnsafe(sql);
   for(const table of opened.tables)for(const row of table.rows)await restored.$executeRawUnsafe(`INSERT INTO "${table.name}" SELECT * FROM json_populate_record(NULL::"${table.name}",$1::json)`,row);
   const tables=[];for(const table of opened.tables){const rows=await restored.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "${table.name}" t ORDER BY row_to_json(t)::text`);tables.push({...table,rows:rows.map(r=>r.row)})}
   const restoredSnapshotHash=lifecycleExecutionSnapshotHash({...snapshot,tables});assert.equal(restoredSnapshotHash,snapshot.snapshotHash);
   assert.equal((await restored.$queryRaw`SELECT "payload" FROM "AssistantHistoryArchive"`).length,2,'Both actors in the selected store are recoverable');
   return {sourceRevision:'a'.repeat(40),manifestHash:snapshot.planHash,...snapshot.scope,snapshotHash:snapshot.snapshotHash,restoredSnapshotHash,artifactSha256:saved.sha256,storageReadbackVerified:true};
  }finally{await restored.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${restore}" CASCADE`)}
 }});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);await db.$executeRawUnsafe(createStore);await db.$executeRawUnsafe(sql);await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "Store" VALUES ('target','company','Target'),('sibling','company','Sibling')`;
  await core.install(db,actor,scope);
  const m=mutation(),saved=await repo.save({},m);
  const row=(await db.$queryRaw`SELECT "scopeKey","actorId","mode","companyId","storeId","generation"::text AS generation FROM "AssistantHistoryArchive"`)[0];assert.deepEqual(row,{scopeKey:historyScopeKey(a),actorId:'actor',mode:'owner',companyId:'company',storeId:'target',generation:'0'});
  await assert.rejects(db.$executeRaw`UPDATE "AssistantHistoryArchive" SET "storeId"='sibling' WHERE "scopeKey"=${row.scopeKey}`);
  await assert.rejects(db.$executeRaw`UPDATE "AssistantHistoryArchive" SET "generation"=1 WHERE "scopeKey"=${row.scopeKey}`);
  // A concurrent exclusive store fence holder causes immediate fail-closed refusal.
  let release,locked;const ready=new Promise(r=>locked=r),gate=new Promise(r=>release=r);
  const holder=db.$transaction(async tx=>{await tx.$queryRaw`SELECT "storeId" FROM "StoreLifecycleFence" WHERE "storeId"='target' FOR UPDATE`;locked();await gate},{timeout:10000});
  await ready;try{await assert.rejects(repo.save({},mutation(1)),e=>e.code==='STORE_LIFECYCLE_MAINTENANCE')}finally{release();await holder}
  assert.equal((await repo.read({})).revision,1);
  // Expiry erases prose on read but keeps the original revision and retry tombstone.
  time=new Date(saved.expiresAt);assert.equal((await repo.read({})).expired,true);
  const expired=(await db.$queryRaw`SELECT "revision","payload","requestId" FROM "AssistantHistoryArchive"`)[0];assert.equal(Number(expired.revision),1);assert.deepEqual(expired.payload,emptyHistoryArchive());assert.equal(expired.requestId,m.requestId);
  await assert.rejects(repo.save({},m),e=>e.code==='ASSISTANT_HISTORY_EXPIRED');
  const reset=mutation(1,emptyHistoryArchive());await repo.reset({},reset);await repo.save({},mutation(2));
  a={...principal(),userId:'second-actor'};await repo.save({},mutation());
  a={...principal(),storeId:'sibling'};await repo.save({},mutation());const control=await db.$queryRaw`SELECT row_to_json(t)::text AS row FROM "AssistantHistoryArchive" t WHERE "storeId"='sibling'`;
  a=principal();const prepared=await core.prepare(db,actor,scope,'RESET');
  await assert.rejects(repo.read({}),e=>e.code==='STORE_LIFECYCLE_MAINTENANCE');
  const result=await core.execute(db,actor,{...scope,operationId:prepared.operationId,snapshotHash:prepared.snapshotHash});assert.equal(result.generation,'1');assert.equal(proofCount,1);
  assert.equal((await db.$queryRaw`SELECT * FROM "AssistantHistoryArchive" WHERE "storeId"='target'`).length,0);
  assert.deepEqual(await db.$queryRaw`SELECT row_to_json(t)::text AS row FROM "AssistantHistoryArchive" t WHERE "storeId"='sibling'`,control);
  assert.equal((await core.execute(db,actor,{...scope,operationId:prepared.operationId,snapshotHash:prepared.snapshotHash})).idempotentReplay,true);assert.equal(proofCount,1);
  // Test-only clearing of maintenance isolates stale-generation refusal; no production reopen claim.
  await db.$executeRaw`UPDATE "StoreLifecycleFence" SET "maintenance"=false WHERE "storeId"='target'`;
  await assert.rejects(repo.save({},m),e=>e.code==='STORE_LIFECYCLE_STALE_GENERATION');a={...principal(),generation:'1'};assert.deepEqual((await repo.read({})).archive,emptyHistoryArchive());
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();await rm(directory,{recursive:true,force:true})}
});
