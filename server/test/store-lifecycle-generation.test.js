import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {normalizeLifecycleGeneration,readLifecycleGeneration,assertLifecycleMutation} from '../src/services/store-lifecycle-generation.js';
import {queueOfflineCashSale,readOfflineSaleQueue,syncOfflineSales} from '../../client/src/offline-sale-queue.js';
const scope={companyId:'company',storeId:'target'};
const state=(generation='0')=>({companyId:'company',generation,maintenance:false,retired:false});
const fake=(row,{exists=true}={})=>{const calls=[];return {calls,$queryRawUnsafe:async(sql,...args)=>{calls.push({sql,args});return sql.includes('current_schema')?[{schema:'isolated',fence:exists?'f':null}]:sql.includes('set_config')?[]:row?[row]:[]}}};
test('legacy missing enrollment stays zero, malformed and cross-company state fail closed',async()=>{
 for(const tx of [fake(null,{exists:false}),fake(null),fake(state())])assert.equal((await assertLifecycleMutation(tx,scope,undefined)).generation,'0');
 for(const bad of [0,1,-1,'-1','01','1.0','1e2','9223372036854775808',{},''])assert.throws(()=>normalizeLifecycleGeneration(bad),e=>e.code==='STORE_LIFECYCLE_GENERATION_INVALID');
 assert.equal(normalizeLifecycleGeneration('9223372036854775807'),'9223372036854775807');
 for(const row of [{...state(),companyId:'other'},{...state(),maintenance:null},{...state(),generation:'garbage'}])await assert.rejects(readLifecycleGeneration(fake(row),scope));
 await assert.rejects(readLifecycleGeneration(fake(null),{companyId:'company'}),e=>e.code==='STORE_LIFECYCLE_SCOPE_INVALID');
});
test('old and untagged requests cannot be upgraded; maintenance and retirement reject even current generation',async()=>{
 for(const gen of [undefined,null,'0','2'])await assert.rejects(assertLifecycleMutation(fake(state('1')),scope,gen),e=>e.code==='STORE_LIFECYCLE_STALE_GENERATION');
 for(const flag of ['maintenance','retired'])await assert.rejects(assertLifecycleMutation(fake({...state('1'),[flag]:true}),scope,'1'),e=>e.code==='STORE_LIFECYCLE_MAINTENANCE');
 const tx=fake(state('9007199254740993'));await assertLifecycleMutation(tx,scope,'9007199254740993');
 assert.match(tx.calls[1].sql,/FOR SHARE NOWAIT$/);assert.deepEqual(JSON.parse(tx.calls[2].args[0]),{target:'9007199254740993'});
 const preflight=fake(state('1'));await assertLifecycleMutation(preflight,scope,'1',{lock:false});assert.equal(preflight.calls.length,2);assert.doesNotMatch(preflight.calls[1].sql,/FOR SHARE/);
});
test('offline replay preserves original generations and stale payloads without tagging legacy requests',async()=>{
 const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
 const now=()=>new Date('2026-10-18T20:00:00Z');
 for(const [index,generation] of [undefined,'0','1'].entries())queueOfflineCashSale('target',{total:index+1,request:{items:[{productId:'p'+index}],...(generation===undefined?{}:{lifecycleGeneration:generation})}},{storage,id:randomUUID(),now});
 const original=readOfflineSaleQueue('target',storage).map(row=>row.request);
 const sent=[];const result=await syncOfflineSales({storeId:'target',storage,now,send:async request=>{sent.push(structuredClone(request));await assertLifecycleMutation(fake(state('1')),scope,request.lifecycleGeneration);return {saleId:'new-sale'}}});
 assert.deepEqual(sent,original);assert.equal(result.synced,1);assert.equal(result.pending,2);
 assert.deepEqual(readOfflineSaleQueue('target',storage).map(row=>row.request),original.slice(0,2));
 assert.equal(Object.hasOwn(sent[0],'lifecycleGeneration'),false);
});
const isolated=(()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}})();
test('native generation lock serializes cutover, stale requests write nothing and transaction setting never leaks',{skip:!isolated},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='lifecycle_generation_'+randomUUID().replaceAll('-','');await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  assert.equal((await readLifecycleGeneration(db,scope)).enrolled,false);
  await db.$executeRawUnsafe(`CREATE TABLE "StoreLifecycleFence"("storeId" text PRIMARY KEY,"companyId" text,"generation" bigint,"maintenance" boolean,"retired" boolean)`);
  await db.$executeRawUnsafe(`CREATE TABLE "Business"("storeId" text,"value" text)`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreLifecycleFence" VALUES('target','company',1,false,false),('sibling','company',0,false,false)`);
  for(const supplied of [undefined,'0','2'])await assert.rejects(db.$transaction(async tx=>{await assertLifecycleMutation(tx,scope,supplied);await tx.$executeRawUnsafe(`INSERT INTO "Business" VALUES('target','MUST NOT WRITE')`)}),e=>e.code==='STORE_LIFECYCLE_STALE_GENERATION');
  assert.deepEqual(await db.$queryRawUnsafe(`SELECT * FROM "Business"`),[]);
  await db.$transaction(async tx=>{
   await assertLifecycleMutation(tx,scope,'1');
   assert.equal((await tx.$queryRawUnsafe(`SELECT current_setting('mws.lifecycle_generations',true) AS value`))[0].value,'{"target":"1"}');
   await assert.rejects(db.$transaction(async rival=>{await rival.$executeRawUnsafe(`SET LOCAL lock_timeout='100ms'`);await rival.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "maintenance"=true WHERE "storeId"='target'`)}));
   await tx.$executeRawUnsafe(`INSERT INTO "Business" VALUES('target','NEW GENERATION')`);
  });
  // Empty or absent is valid after the transaction; stale generation 1 must not survive pooling.
  const leftover=(await db.$queryRawUnsafe(`SELECT current_setting('mws.lifecycle_generations',true) AS value`))[0].value;assert.ok(leftover===null||leftover==='');
  await db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "maintenance"=true WHERE "storeId"='target'`);
  await assert.rejects(db.$transaction(tx=>assertLifecycleMutation(tx,scope,'1')),e=>e.code==='STORE_LIFECYCLE_MAINTENANCE');
  assert.equal((await db.$transaction(tx=>assertLifecycleMutation(tx,{...scope,storeId:'sibling'},undefined))).generation,'0');
  await db.$transaction(async holder=>{
   await holder.$queryRawUnsafe(`SELECT * FROM "StoreLifecycleFence" WHERE "storeId"='target' FOR UPDATE`);
   await assert.rejects(db.$transaction(tx=>assertLifecycleMutation(tx,scope,'1')),/προετοιμάζεται|συντήρηση/);
  });
  assert.deepEqual(await db.$queryRawUnsafe(`SELECT * FROM "Business"`),[{storeId:'target',value:'NEW GENERATION'}]);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}
});
