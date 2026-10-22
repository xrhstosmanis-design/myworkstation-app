import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {saveStoreMetadata} from '../src/services/store-metadata-mutation.js';
import {withLifecycleContext} from '../src/services/store-lifecycle-context.js';
import {automaticReportDispatchDDL} from '../src/services/automatic-report-dispatch-schema.js';
function isolated(value=process.env.DATABASE_URL,mode=process.env.NODE_ENV){
 try{
  const u=new URL(value),database=decodeURIComponent(u.pathname);
  if(mode!=='test'||!['postgres:','postgresql:'].includes(u.protocol)||!['localhost','127.0.0.1','postgres'].includes(u.hostname)||u.hash||!/^\/(?:test(?:[_-][a-z0-9_-]+)?|[a-z0-9_-]+[_-]test(?:[_-][a-z0-9_-]+)?)$/i.test(database))return false;
  const seen=new Set();
  for(const[key,entry]of u.searchParams){
   if(seen.has(key))return false;seen.add(key);
   if(key==='schema'){if(!/^[a-z_][a-z0-9_]{0,62}$/i.test(entry))return false;continue}
   const allowed={connection_limit:[1,1000],pool_timeout:[0,600],statement_cache_size:[0,100000]},bounds=Object.hasOwn(allowed,key)?allowed[key]:null;
   if(!bounds||!/^\d{1,6}$/.test(entry)||Number(entry)<bounds[0]||Number(entry)>bounds[1])return false;
  }
  return true;
 }catch{return false}
}

test('metadata native fixture guard requires isolated configuration in CI',()=>{assert.equal(isolated('postgresql://u:p@localhost/production','test'),false);assert.equal(isolated('postgresql://u:p@localhost/module_test?host=remote','test'),false);assert.equal(isolated('postgresql://u:p@localhost/module_test?schema=public','test'),true);if(process.env.CI)assert.ok(isolated(),'CI must run native metadata fixture')});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('metadata barrier timeout')),6000))])}finally{clearTimeout(timer)}}
test('native metadata writer fences legacy and partial storage, rollback and original lifecycle epoch',{skip:!isolated(),timeout:120000},async t=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='metadata_'+randomBytes(12).toString('hex');let created=false,a,b;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;const u=new URL(process.env.DATABASE_URL);u.searchParams.set('schema',schema);a=new PrismaClient({datasourceUrl:u.href});b=new PrismaClient({datasourceUrl:u.href});
  await a.$executeRawUnsafe('CREATE TABLE "Store"("id" text PRIMARY KEY,"companyId" text NOT NULL,"name" text NOT NULL,"city" text,"address" text,"responsibleEmail" text,"cashCloseEmailEnabled" boolean NOT NULL DEFAULT true,"active" boolean NOT NULL DEFAULT true)');
  await a.$executeRawUnsafe('CREATE TABLE "StoreLifecycleFence"("storeId" text PRIMARY KEY,"companyId" text,"generation" bigint,"maintenance" boolean,"retired" boolean)');
  await a.$executeRawUnsafe('CREATE TABLE "CashShiftSession"("id" text PRIMARY KEY,"variance" numeric)');
  await a.$executeRaw`INSERT INTO "Store"("id","companyId","name","responsibleEmail","active") VALUES('s','c','Selected','old@example.com',false),('other','foreign','Control','control@example.com',true)`;
  await a.$executeRaw`INSERT INTO "StoreLifecycleFence" VALUES('s','c',9007199254740993,false,false)`;
  await a.$executeRaw`INSERT INTO "CashShiftSession" VALUES('control',12.34)`;
  const scope={companyId:'c',storeId:'s',actorId:'actor'},input={name:'Updated',responsibleEmail:'new@example.com'},context={s:'9007199254740993'};
  const save=(db=a,body=input)=>withLifecycleContext(context,()=>saveStoreMetadata(db,scope,body));
  const snapshot=async()=>({stores:await b.$queryRaw`SELECT * FROM "Store" ORDER BY "id"`,cash:await b.$queryRaw`SELECT "id","variance"::text AS variance FROM "CashShiftSession"`});
  await t.test('reader SHARE denies writer and KEY SHARE remains compatible; inactive legacy update allowed',async()=>{
   const before=await snapshot();await b.$transaction(async tx=>{await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"='s' FOR SHARE`;await assert.rejects(save(),e=>e.code==='STORE_METADATA_BUSY');assert.deepEqual(await snapshot(),before)});
   await b.$transaction(async tx=>{await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"='s' FOR KEY SHARE`;await save()});const after=await snapshot();assert.equal(after.stores[1].name,'Updated');assert.deepEqual(after.cash,before.cash);assert.deepEqual(after.stores[0],before.stores[0]);
  });
  await t.test('writer NO KEY UPDATE denies reverse reader SHARE with explicit deferred barrier',async()=>{
   const locked=deferred(),release=deferred();const db={$transaction:fn=>a.$transaction(tx=>fn(new Proxy(tx,{get(target,key){if(key==='$queryRaw')return async(...args)=>{const result=await target.$queryRaw(...args);if(args[0].join('').includes('FOR NO KEY UPDATE')){locked.resolve();await bounded(release.promise)}return result};const v=target[key];return typeof v==='function'?v.bind(target):v}})),{timeout:15000})};
   const work=save(db,{name:'Reverse'});try{await bounded(locked.promise);await assert.rejects(b.$queryRaw`SELECT "id" FROM "Store" WHERE "id"='s' FOR SHARE NOWAIT`,e=>e.code==='55P03'||e.meta?.code==='55P03')}finally{release.resolve();await bounded(work)}
  });
  await t.test('stale epoch and foreign scope refuse before writing',async()=>{const before=await snapshot();await assert.rejects(withLifecycleContext({s:'9007199254740992'},()=>saveStoreMetadata(a,scope,input)),e=>e.code==='STORE_LIFECYCLE_STALE_GENERATION');await assert.rejects(withLifecycleContext(context,()=>saveStoreMetadata(a,{...scope,companyId:'foreign'},input)),e=>e.code==='STORE_LIFECYCLE_SCOPE_INVALID');assert.deepEqual(await snapshot(),before)});
  await t.test('metadata update rollback preserves all control rows',async()=>{const before=await snapshot(),failure=Error('rollback');const db={$transaction:fn=>a.$transaction(async tx=>{await fn(tx);throw failure})};await assert.rejects(save(db),e=>e===failure);assert.deepEqual(await snapshot(),before)});
  await t.test('partial table presence fails closed without metadata mutation',async()=>{await a.$executeRawUnsafe('CREATE TABLE "AutomaticReportRecipient"("id" text)');const before=await snapshot();await assert.rejects(save(),e=>e.code==='REPORT_RECIPIENT_STORAGE_UNAVAILABLE');assert.deepEqual(await snapshot(),before)});

  await t.test('all-six present revokes authorization atomically even policy OFF, preserves slot evidence and rolls back together',async()=>{
   await a.$executeRawUnsafe('DROP TABLE "AutomaticReportRecipient"');for(const ddl of automaticReportDispatchDDL)await a.$executeRawUnsafe(ddl);
   await a.$executeRawUnsafe(`INSERT INTO "AutomaticReportDispatchPolicy"("companyId","storeId","revision","lifecycleGeneration","updatedBy","updatedAt") VALUES('c','s',1,9007199254740993,'actor',NOW()),('foreign','other',9,0,'control',NOW())`);
   await a.$executeRawUnsafe(`INSERT INTO "AutomaticReportAutomationGrant"("companyId","storeId","active","principalId","principalSessionVersion","lifecycleGeneration","activationEpoch","activationFingerprint","notBefore","createdAt","grantedBy","grantedAt","updatedBy","updatedAt") VALUES('c','s',true,'actor',0,9007199254740993,'epoch',repeat('a',64),NOW(),NOW(),'actor',NOW(),'actor',NOW())`);
   await a.$executeRawUnsafe(`INSERT INTO "AutomaticReportRecipient"("recipientId","companyId","storeId","email","verifiedAt","verifiedBy","challengeHash","challengeNonce","createdBy","createdAt","updatedBy","updatedAt") VALUES('recipient','c','s','old@example.com',NOW(),'actor',repeat('b',64),repeat('c',32),'actor',NOW(),'actor',NOW()),('control','foreign','other','control@example.com',NOW(),'actor',NULL,NULL,'actor',NOW(),'actor',NOW())`);
   await a.$executeRawUnsafe(`INSERT INTO "AutomaticReportRecipientConsent"("companyId","storeId","recipientId","recipientVersion","active","lifecycleGeneration","consentedBy","consentedAt","proofHash","updatedBy","updatedAt") VALUES('c','s','recipient',1,true,9007199254740993,'actor',NOW(),repeat('d',64),'actor',NOW())`);
   await a.$executeRawUnsafe(`INSERT INTO "AutomaticReportDeliverySlot" VALUES(repeat('e',64),'c','s',1,'ACCEPTED',NULL,'{"synthetic":"accepted evidence"}'::jsonb)`);
   const auth=async()=>({policy:await b.$queryRaw`SELECT "companyId","storeId","dispatchEnabled","revision"::text AS "revision","lifecycleGeneration"::text AS "lifecycleGeneration","updatedBy","updatedAt" FROM "AutomaticReportDispatchPolicy" ORDER BY "storeId"`,grant:await b.$queryRaw`SELECT "active","revision"::text AS revision FROM "AutomaticReportAutomationGrant"`,recipient:await b.$queryRaw`SELECT "recipientId","email","version"::text AS version,"verifiedAt","challengeHash","challengeNonce" FROM "AutomaticReportRecipient" ORDER BY "recipientId"`,consent:await b.$queryRaw`SELECT "active","revision"::text AS revision FROM "AutomaticReportRecipientConsent"`,slots:await b.$queryRaw`SELECT "slotId","status","record" FROM "AutomaticReportDeliverySlot"`});
   const before=await auth(),beforeStore=await snapshot(),failure=Error('after invalidation rollback');
   const rollback={$transaction:fn=>a.$transaction(async tx=>{await fn(tx);throw failure})};await assert.rejects(save(rollback,{name:'Atomic',responsibleEmail:'replacement@example.com'}),e=>e===failure);assert.deepEqual(await auth(),before);assert.deepEqual(await snapshot(),beforeStore);
   await save(a,{name:'Atomic',responsibleEmail:'replacement@example.com'});const after=await auth();assert.equal(after.grant[0].active,false);assert.equal(after.consent[0].active,false);assert.ok(BigInt(after.consent[0].revision)>BigInt(before.consent[0].revision));const changed=after.recipient.find(r=>r.recipientId==='recipient');assert.equal(changed.verifiedAt,null);assert.equal(changed.challengeHash,null);assert.equal(changed.challengeNonce,null);assert.ok(BigInt(changed.version)>1n);assert.deepEqual(after.recipient.find(r=>r.recipientId==='control'),before.recipient.find(r=>r.recipientId==='control'));assert.deepEqual(after.slots,before.slots);assert.deepEqual((await snapshot()).cash,beforeStore.cash);
   const unchanged=await auth();await save(a,{name:'Only metadata',responsibleEmail:'REPLACEMENT@example.com; replacement@example.com'});assert.deepEqual(await auth(),unchanged);
  });
 }finally{await a?.$disconnect();await b?.$disconnect();if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}
});
