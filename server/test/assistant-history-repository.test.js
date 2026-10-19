import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createAssistantHistoryRepository} from '../src/services/assistant-history-repository.js';
import {emptyHistoryArchive,HISTORY_TTL_MS} from '../src/services/assistant-history-contract.js';
const base=()=>({userId:'owner',mode:'owner',companyId:'company',storeId:'store',generation:'2',sessionId:'session',sessionVersion:3,capabilities:['cash_details']});
const archive=()=>({schemaVersion:1,threads:[{id:randomUUID(),title:'Ταμεία',messages:[{id:randomUUID(),role:'assistant',content:'Ιστορική απάντηση',createdAt:'2026-10-19T09:00:00.000Z',requiredCapabilities:['cash_details']}]}]});
function fixture(){
 let principal=base(),time=new Date('2026-10-19T09:00:00Z'),tail=Promise.resolve(),hook=null,authHook=null,commitHook=null;const rows=new Map(),calls=[];
 const db={$transaction:async fn=>{const prior=tail;let unlock;tail=new Promise(r=>unlock=r);await prior;const copy=structuredClone(rows);try{const result=await fn({$queryRaw:async(strings,...args)=>{
  const sql=strings.join('?');calls.push({sql,args:structuredClone(args)});assert.ok(!/CREATE|ALTER|DROP|DELETE|TRUNCATE/.test(sql));
  let result;
  if(sql.startsWith('SELECT 1'))result=[{locked:1}];
  else if(sql.startsWith('SELECT "revision"'))result=rows.has(args[0])?[structuredClone(rows.get(args[0]))]:[];
  else if(sql.startsWith('INSERT')){const[key,revision,payload,requestId,digest,expiresAt]=args;if(rows.has(key))result=[];else{rows.set(key,{revision,payload:JSON.parse(payload),requestId,digest,expiresAt});result=[{revision}];}}
  else if(sql.startsWith('UPDATE')){const[revision,payload,requestId,digest,expiresAt,key,expected]=args;if(rows.get(key)?.revision!==expected)result=[];else{rows.set(key,{revision,payload:JSON.parse(payload),requestId,digest,expiresAt});result=[{revision}];}}
  else assert.fail('Unexpected SQL');
  if(hook){const h=hook;hook=null;await h(sql);}return result;
 }});if(commitHook){const h=commitHook;commitHook=null;await h();}return result;}catch(e){rows.clear();for(const[k,v]of copy)rows.set(k,v);throw e;}finally{unlock();}}};
 const repo=createAssistantHistoryRepository({db,authorize:async()=>{if(authHook)await authHook();return structuredClone(principal)},now:()=>time});
 return {repo,rows,calls,principal:v=>{principal={...principal,...v}},clock:v=>{time=new Date(v)},afterQuery:fn=>hook=fn,onAuth:fn=>authHook=fn,afterCommit:fn=>commitHook=fn,time:()=>time};
}
const mutation=(expectedRevision=0,a=archive(),requestId=randomUUID())=>({expectedRevision,archive:a,requestId});
const code=(p,c)=>assert.rejects(p,e=>e.code===c);
test('repository requires explicit dependencies; no default production DB or authorization',()=>{
 assert.throws(()=>createAssistantHistoryRepository({}));assert.throws(()=>createAssistantHistoryRepository({db:{$transaction:()=>{}},authorize:null}));
});
test('scoped archive returns historical text, fixed expiry and fresh post-storage authorization',async()=>{
 const f=fixture(),m=mutation(),saved=await f.repo.save({},m);assert.equal(saved.revision,1);assert.equal(saved.historical,true);assert.equal(saved.expired,false);assert.equal(saved.expiresAt,new Date(f.time().getTime()+HISTORY_TTL_MS).toISOString());
 assert.deepEqual((await f.repo.read({})).archive,m.archive);f.clock('2026-10-20T09:00:00Z');const next=await f.repo.save({},mutation(1,m.archive));assert.equal(next.expiresAt,saved.expiresAt);
 assert.equal(f.rows.size,1);assert.ok(f.calls.some(c=>c.sql.startsWith('INSERT')));assert.ok(f.calls.every(c=>!c.sql.includes('Ιστορική απάντηση')));
});
test('scope isolation covers actor, mode, company, store and lifecycle while same-user new login can read after fresh checks',async()=>{
 const f=fixture(),a=archive();await f.repo.save({},mutation(0,a));
 for(const delta of [{userId:'other'},{mode:'platform'},{companyId:'other'},{storeId:'other'},{generation:'3'}]){f.principal({...base(),...delta});assert.deepEqual((await f.repo.read({})).archive,emptyHistoryArchive());}
 f.principal({...base(),sessionId:'next',sessionVersion:4});assert.deepEqual((await f.repo.read({})).archive,a);
});
test('same request retry is idempotent; changed payload or expected revision with same request identity conflicts',async()=>{
 const f=fixture(),m=mutation(),first=await f.repo.save({},m);assert.deepEqual(await f.repo.save({},m),first);assert.equal(f.calls.filter(c=>c.sql.startsWith('INSERT')||c.sql.startsWith('UPDATE')).length,1);
 await code(f.repo.save({},{...m,archive:emptyHistoryArchive()}),'ASSISTANT_HISTORY_CONFLICT');await code(f.repo.save({},{...m,expectedRevision:1}),'ASSISTANT_HISTORY_CONFLICT');
});
test('concurrent stale writers have exactly one winner, and deleted threads cannot reappear through an old retry',async()=>{
 const f=fixture(),m=mutation();const out=await Promise.allSettled([f.repo.save({},m),f.repo.save({},mutation())]);assert.equal(out.filter(r=>r.status==='fulfilled').length,1);assert.equal(out.find(r=>r.status==='rejected').reason.status,409);
 await f.repo.save({},mutation(1,emptyHistoryArchive()));await code(f.repo.save({},m),'ASSISTANT_HISTORY_CONFLICT');assert.deepEqual((await f.repo.read({})).archive,emptyHistoryArchive());
});
test('fixed 30-day visibility expires exactly; explicit empty reset advances revision and fences old request retries',async()=>{
 const f=fixture(),m=mutation(),saved=await f.repo.save({},m);f.clock(new Date(new Date(saved.expiresAt).getTime()-1));assert.equal((await f.repo.read({})).archive.threads.length,1);
 f.clock(saved.expiresAt);const old=await f.repo.read({});assert.equal(old.expired,true);assert.deepEqual(old.archive,emptyHistoryArchive());await code(f.repo.save({},m),'ASSISTANT_HISTORY_EXPIRED');
 await assert.rejects(f.repo.reset({},mutation(1,archive())));
 const reset=mutation(1,emptyHistoryArchive());const fresh=await f.repo.reset({},reset);assert.equal(fresh.revision,2);assert.equal(fresh.expired,false);assert.deepEqual(await f.repo.reset({},reset),fresh);
 await code(f.repo.save({},m),'ASSISTANT_HISTORY_CONFLICT');assert.deepEqual((await f.repo.read({})).archive,emptyHistoryArchive());
});
test('current capability loss blocks private text and restores access only after a new successful native check',async()=>{
 const f=fixture();await f.repo.save({},mutation());f.principal({capabilities:[]});await code(f.repo.read({}),'ASSISTANT_HISTORY_ACCESS_DENIED');await code(f.repo.save({},mutation(1)),'ASSISTANT_HISTORY_ACCESS_DENIED');
 f.principal(base());assert.equal((await f.repo.read({})).archive.threads.length,1);
});
test('revocation or context change during awaited storage returns no private archive and rolls back any write',async t=>{
 for(const operation of ['read','save'])for(const boundary of ['lock','select','write']){
  if(operation==='read'&&boundary==='write')continue;
  await t.test(`${operation}:${boundary}`,async()=>{
   const f=fixture();await f.repo.save({},mutation());const before=structuredClone([...f.rows]);
   const install=()=>f.afterQuery(async sql=>{const hit=boundary==='lock'?sql.startsWith('SELECT 1'):boundary==='select'?sql.startsWith('SELECT "revision"'):sql.startsWith('UPDATE');if(hit)f.principal({sessionVersion:4});else install();});install();
   await code(operation==='read'?f.repo.read({}):f.repo.save({},mutation(1)),'ASSISTANT_HISTORY_CONTEXT_CHANGED');assert.deepEqual([...f.rows],before);
  });
 }
});
test('storage failure, malformed private archive and denied initial authorization do not return a historical result',async()=>{
 const f=fixture();await f.repo.save({},mutation());const row=[...f.rows.values()][0];row.payload.exportTicket='PRIVATE';await assert.rejects(f.repo.read({}));
 const denied=createAssistantHistoryRepository({db:{$transaction:()=>assert.fail('No storage before authorization')},authorize:async()=>{throw Object.assign(new Error('denied'),{status:401})}});await assert.rejects(denied.read({}),e=>e.status===401);
});
test('commit await rechecks native identity and expiry before returning private content',async()=>{
 for(const phase of ['identity','expiry']){
  const f=fixture(),saved=await f.repo.save({},mutation());
  f.afterCommit(async()=>phase==='identity'?f.principal({sessionId:'other'}):f.clock(saved.expiresAt));
  await code(f.repo.read({}),phase==='identity'?'ASSISTANT_HISTORY_CONTEXT_CHANGED':'ASSISTANT_HISTORY_EXPIRED');
 }
});
test('business-domain access is granular even when another business tool remains available',async()=>{
 const f=fixture(),a=archive();a.threads[0].messages[0].requiredCapabilities=['business_records:BANK_MOVEMENTS'];
 f.principal({capabilities:['business_records:BANK_MOVEMENTS','business_records:PAYMENTS']});await f.repo.save({},mutation(0,a));
 f.principal({capabilities:['business_records:PAYMENTS']});await code(f.repo.read({}),'ASSISTANT_HISTORY_ACCESS_DENIED');
});
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native history repository executes parameterized PostgreSQL with BIGINT revision, concurrent stale-write refusal, expiry and rollback',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='assistant_history_'+randomUUID().replaceAll('-','');
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 let principal=base(),time=new Date('2026-10-19T09:00:00Z');
 const repo=createAssistantHistoryRepository({db,authorize:async()=>structuredClone(principal),now:()=>time});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await db.$executeRawUnsafe('CREATE TABLE "AssistantHistoryArchive" ("scopeKey" text PRIMARY KEY,"revision" bigint NOT NULL,"payload" jsonb NOT NULL,"requestId" text NOT NULL,"digest" text NOT NULL,"expiresAt" timestamptz NOT NULL)');
  await db.$executeRawUnsafe('CREATE TABLE "StoreLifecycleFence" ("storeId" text PRIMARY KEY,"companyId" text NOT NULL,"generation" bigint NOT NULL,"maintenance" boolean NOT NULL,"retired" boolean NOT NULL)');
  await db.$executeRaw`INSERT INTO "StoreLifecycleFence" VALUES ('store','company',9223372036854775807,false,false)`;
  const {readLifecycleGeneration}=await import('../src/services/store-lifecycle-generation.js');
  const observed=await readLifecycleGeneration(db,{companyId:'company',storeId:'store'});
  assert.equal(observed.generation,'9223372036854775807');principal={...base(),generation:observed.generation};
  const m=mutation(),saved=await repo.save({},m);assert.equal(saved.revision,1);assert.deepEqual(await repo.save({},m),saved);
  assert.deepEqual((await repo.read({})).archive,saved.archive);
  const competing=await Promise.allSettled([repo.save({},mutation(1)),repo.save({},mutation(1))]);assert.equal(competing.filter(x=>x.status==='fulfilled').length,1);assert.equal(competing.find(x=>x.status==='rejected').reason.status,409);
  const before=await db.$queryRaw`SELECT "scopeKey","revision","payload","requestId","digest","expiresAt" FROM "AssistantHistoryArchive"`;
  let revoke=false;
  const gated={$transaction:fn=>db.$transaction(tx=>fn({$queryRaw:async(strings,...args)=>{const rows=await tx.$queryRaw(strings,...args);if(strings[0].startsWith('UPDATE'))revoke=true;return rows;}}))};
  const guarded=createAssistantHistoryRepository({db:gated,authorize:async()=>({...principal,sessionVersion:revoke?4:3}),now:()=>time});
  await code(guarded.save({},mutation(2)),'ASSISTANT_HISTORY_CONTEXT_CHANGED');
  assert.deepEqual(await db.$queryRaw`SELECT "scopeKey","revision","payload","requestId","digest","expiresAt" FROM "AssistantHistoryArchive"`,before);
  principal={...base(),storeId:'foreign',generation:observed.generation};assert.deepEqual((await repo.read({})).archive,emptyHistoryArchive());principal={...base(),generation:observed.generation};
  time=new Date(saved.expiresAt);assert.equal((await repo.read({})).expired,true);await code(repo.save({},mutation(2)),'ASSISTANT_HISTORY_EXPIRED');
  assert.equal((await repo.reset({},mutation(2,emptyHistoryArchive()))).revision,3);await code(repo.save({},m),'ASSISTANT_HISTORY_CONFLICT');
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();}
});
test('adjacent lifecycle int64 scopes beyond JS safe integer never read or overwrite one another',async()=>{
 const f=fixture(),a=archive(),b=archive();b.threads[0].title='Δεύτερη κατάσταση';
 f.principal({generation:'9007199254740992'});await f.repo.save({},mutation(0,a));
 f.principal({generation:'9007199254740993'});assert.deepEqual((await f.repo.read({})).archive,emptyHistoryArchive());await f.repo.save({},mutation(0,b));
 assert.equal(f.rows.size,2);assert.deepEqual((await f.repo.read({})).archive,b);
 f.principal({generation:'9007199254740992'});assert.deepEqual((await f.repo.read({})).archive,a);
});
test('an exact int64 generation change during storage withdraws historical text',async()=>{
 const f=fixture();f.principal({generation:'9007199254740992'});await f.repo.save({},mutation());
 const install=()=>f.afterQuery(async sql=>{if(sql.startsWith('SELECT "revision"'))f.principal({generation:'9007199254740993'});else install();});install();
 await code(f.repo.read({}),'ASSISTANT_HISTORY_CONTEXT_CHANGED');
});
