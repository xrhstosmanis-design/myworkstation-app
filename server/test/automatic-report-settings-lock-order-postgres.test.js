import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {saveAutomaticReportSettings} from '../src/services/automatic-report-settings.js';
import {withLifecycleContext} from '../src/services/store-lifecycle-context.js';
import {assertLifecycleMutation} from '../src/services/store-lifecycle-generation.js';

function isolated(){try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(decodeURIComponent(u.pathname))}catch{return false}}
const selected={actorId:'sa',companyId:'c',storeId:'s'};
const ORIGINAL_GENERATION='9007199254740993';
const config={dayStartHour:7,secondShiftStartHour:15,thirdShiftStartHour:23,terminals:[{terminalPos:'MAIN',requiredSlots:[1,2,3]}],cashRule:{mode:'FULL',deliveryTerminalPattern:'DELIVERY',carryOverEnabled:true,posEftposEnabled:true}};
const wire=value=>JSON.parse(JSON.stringify(value));
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve}}
async function bounded(promise,label,ms=6000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`Fixture barrier timed out: ${label}`)),ms)})])}finally{clearTimeout(timer)}}
function sqlKind(sql){
 if(sql.includes('"StoreLifecycleFence"')&&/FOR\s+SHARE\s+NOWAIT/i.test(sql))return'lifecycle-lock';
 if(/FOR\s+NO\s+KEY\s+UPDATE\s+NOWAIT/i.test(sql))return'store-lock';
 if(/^\s*(?:INSERT INTO|UPDATE)\s+"AutomaticReportSettings"/i.test(sql))return'settings-write';
 if(sql.includes('FROM "CashControlStoreRule"'))return'rule-read';
 if(sql.includes('FROM "AutomaticReportSettings"'))return'settings-read';
 return'other';
}
// Wrap actual Prisma only to observe order and pause after identified reads.
// No source rows, authorization outcome or production lock is emulated here.
function observed(client,{afterStoreLock=null,afterScopeStore=null}={}){
 const trace={transactions:0,events:[],scopeCalls:0,storeRows:[]};
 return{trace,db:{$transaction:fn=>{trace.transactions++;return client.$transaction(async tx=>fn(new Proxy(tx,{get(target,key){
  if(key==='$queryRaw'||key==='$queryRawUnsafe')return async(...args)=>{
   const sql=Array.isArray(args[0])?args[0].join('?'):String(args[0]?.sql||args[0]);
   assert.doesNotMatch(sql,/\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|SCHEMA|INDEX)/i,'save must not bootstrap schema');
   const type=sqlKind(sql);trace.events.push(type);const result=await target[key](...args);
   if(type==='store-lock'){trace.storeRows.push(wire(result));if(afterStoreLock)await afterStoreLock({tx:target,rows:result,trace})}return result;
  };
  if(key==='store')return new Proxy(target.store,{get(delegate,operation){const method=delegate[operation];return typeof method==='function'?async(...args)=>{const result=await method.apply(delegate,args);if(operation==='findFirst'){trace.scopeCalls++;if(afterScopeStore)await afterScopeStore({tx:target,row:result,trace})}return result}:method}});
  const value=target[key];return typeof value==='function'?value.bind(target):value;
 }})),{isolationLevel:'ReadCommitted',maxWait:5000,timeout:15000})}}};
}
function ordered(trace,{write=true}={}){
 const lifecycle=trace.events.indexOf('lifecycle-lock'),store=trace.events.indexOf('store-lock');assert.ok(lifecycle>=0&&store>lifecycle,trace.events.join(','));
 if(write){const rule=trace.events.indexOf('rule-read'),changed=trace.events.indexOf('settings-write'),readback=trace.events.indexOf('settings-read');assert.ok(rule>store&&changed>rule&&readback>changed,trace.events.join(','));}
 assert.equal(trace.transactions,1,'save must not retry a busy transaction');
}
const write=(db,scope,expectedVersion,context)=>withLifecycleContext(context,()=>saveAutomaticReportSettings(db,scope,{expectedVersion,configuration:wire(config)}));

export async function runAutomaticReportSettingsLockOrderRegression(a,b,{subtest=async(_name,fn)=>fn()}={}){
 await a.$executeRawUnsafe('CREATE TABLE "User"("id" text primary key,"role" text)');
 await a.$executeRawUnsafe('CREATE TABLE "Store"("id" text primary key,"companyId" text,"name" text,"active" boolean)');
 await a.$executeRawUnsafe('CREATE TABLE "CashControlStoreRule"("storeId" text primary key,"companyId" text,"mode" text,"deliveryTerminalPattern" text,"carryOverEnabled" boolean,"posEftposEnabled" boolean,"updatedAt" timestamptz default now())');
 // Fixture FK deliberately exercises PostgreSQL's parent KEY SHARE behavior;
 // it is not a claim that production settings already have this constraint.
 await a.$executeRawUnsafe('CREATE TABLE "AutomaticReportSettings"("storeId" text primary key REFERENCES "Store"("id"),"companyId" text not null,"configurationJson" jsonb not null,"version" integer not null default 1,"updatedBy" text not null,"updatedAt" timestamptz not null default now())');
 await a.$executeRawUnsafe('CREATE TABLE "StoreLifecycleFence"("storeId" text primary key,"companyId" text,"generation" bigint,"maintenance" boolean,"retired" boolean)');
 await a.$executeRawUnsafe('CREATE TABLE "CashShiftSession"("id" text primary key,"companyId" text,"storeId" text,"variance" numeric(14,2))');
 await a.$executeRaw`INSERT INTO "User" VALUES('sa','SUPER_ADMIN'),('owner','OWNER')`;
 await a.$executeRaw`INSERT INTO "Store" VALUES('s','c','Synthetic LAB',true),('control','control-company','Control',true),('maintenance','c','Maintenance',true),('retired','c','Retired',true),('renamed','c','Ordinary before',true),('legacy','c','Legacy',true)`;
 await a.$executeRaw`INSERT INTO "CashControlStoreRule"("storeId","companyId","mode","deliveryTerminalPattern","carryOverEnabled","posEftposEnabled") VALUES('s','c','FULL','DELIVERY',true,true),('control','control-company','FULL','DELIVERY',true,true)`;
 await a.$executeRaw`INSERT INTO "StoreLifecycleFence" VALUES('s','c',${BigInt(ORIGINAL_GENERATION)},false,false),('control','control-company',7,false,false),('maintenance','c',1,true,false),('retired','c',1,false,true),('renamed','c',1,false,false)`;
 await a.$executeRaw`INSERT INTO "AutomaticReportSettings"("storeId","companyId","configurationJson","version","updatedBy") VALUES('control','control-company',${JSON.stringify(config)}::jsonb,7,'sa')`;
 await a.$executeRaw`INSERT INTO "CashShiftSession" VALUES('source-main','c','s',-12.34),('source-control','control-company','control',123.45)`;
 const tables=['User','Store','CashControlStoreRule','AutomaticReportSettings','StoreLifecycleFence','CashShiftSession'];
 const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,wire(table==='StoreLifecycleFence'?await b.$queryRawUnsafe('SELECT "storeId","companyId","generation"::text AS generation,"maintenance","retired" FROM "StoreLifecycleFence" ORDER BY "storeId"'):await b.$queryRawUnsafe(`SELECT * FROM "${table}" ORDER BY 1`))])));
 const settingsChangedOnly=(before,after,storeId)=>{const strip=value=>({...value,AutomaticReportSettings:value.AutomaticReportSettings.filter(row=>row.storeId!==storeId)});assert.deepEqual(strip(after),strip(before))};
 const checkSaved=(result,snapshotValue,storeId,version)=>{const row=snapshotValue.AutomaticReportSettings.find(row=>row.storeId===storeId);assert.ok(row);assert.equal(row.companyId,'c');assert.equal(row.version,version);assert.equal(row.updatedBy,'sa');assert.deepEqual(row.configurationJson,config);assert.equal(result.store.id,storeId);assert.equal(result.settings.version,version);assert.deepEqual(result.settings.configuration,config);assert.equal(result.settings.updatedAt.toISOString(),row.updatedAt);assert.equal(result.dispatchEnabled,false)};
 let generation=ORIGINAL_GENERATION;
 const context=()=>({s:generation});
 const holding=async(mode,work)=>a.$transaction(async tx=>{await assertLifecycleMutation(tx,selected,generation,{lock:true});await tx.$queryRawUnsafe(`SELECT "id" FROM "Store" WHERE "id"=$1 AND "companyId"=$2 AND "active"=true ${mode}`,'s','c');return work(tx)},{maxWait:5000,timeout:15000});

 await subtest('eligibility SHARE blocks initial insert; compatible KEY SHARE permits the first saved settings row; SHARE also blocks updates',async()=>{
  let before=await snapshot();const absent=observed(b);
  await holding('FOR SHARE',async()=>{await assert.rejects(write(absent.db,selected,0,context()),error=>error.status===409&&error.code==='REPORT_SETTINGS_BUSY');ordered(absent.trace,{write:false});assert.equal(absent.trace.events.includes('settings-write'),false);assert.deepEqual(await snapshot(),before)});
  const compatible=observed(b);let created;
  await holding('FOR KEY SHARE',async()=>{created=await write(compatible.db,selected,0,context())});
  ordered(compatible.trace);let after=await snapshot();checkSaved(created,after,'s',1);settingsChangedOnly(before,after,'s');assert.equal(after.AutomaticReportSettings.length,before.AutomaticReportSettings.length+1);
  before=after;const existing=observed(b);
  await holding('FOR SHARE',async()=>{await assert.rejects(write(existing.db,selected,1,context()),error=>error.status===409&&error.code==='REPORT_SETTINGS_BUSY');ordered(existing.trace,{write:false});assert.equal(existing.trace.events.includes('settings-write'),false);assert.deepEqual(await snapshot(),before)});
 });

 await subtest('a save holding lifecycle then Store NO KEY UPDATE rejects a competing SHARE probe before committing its ordinary CAS',async()=>{
  const before=await snapshot(),locked=deferred(),release=deferred();let task;
  const watched=observed(b,{afterStoreLock:async({tx,rows})=>{assert.equal(rows[0].id,'s');assert.equal(rows[0].companyId,'c');const bound=(await tx.$queryRawUnsafe("SELECT current_setting('mws.lifecycle_generations',true) AS value"))[0].value;assert.deepEqual(JSON.parse(bound),{s:generation});locked.resolve();await bounded(release.promise,'release saved store lock')}});
  try{
   task=write(watched.db,selected,1,context());task.catch(()=>{});await bounded(locked.promise,'save acquired Store NO KEY UPDATE');
   let reachedStore=false;
   await assert.rejects(a.$transaction(async tx=>{await assertLifecycleMutation(tx,selected,generation,{lock:true});reachedStore=true;await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"='s' AND "companyId"='c' AND "active"=true FOR SHARE NOWAIT`},{maxWait:5000,timeout:15000}),error=>error?.meta?.code==='55P03'||error?.code==='55P03');assert.equal(reachedStore,true);
   release.resolve();const result=await task;ordered(watched.trace);const after=await snapshot();checkSaved(result,after,'s',2);settingsChangedOnly(before,after,'s');
  }finally{release.resolve();if(task)await Promise.allSettled([task])}
 });

 await subtest('original missing/stale epochs, maintenance, retirement and an exclusively busy lifecycle fence refuse before Store lock or settings SQL',async()=>{
  const before=await snapshot();
  for(const[scope,epoch,code]of [[selected,{},'STORE_LIFECYCLE_STALE_GENERATION'],[selected,{s:(BigInt(generation)-1n).toString()},'STORE_LIFECYCLE_STALE_GENERATION'],[{...selected,storeId:'maintenance'},{maintenance:'1'},'STORE_LIFECYCLE_MAINTENANCE'],[{...selected,storeId:'retired'},{retired:'1'},'STORE_LIFECYCLE_MAINTENANCE']]){
   const watched=observed(b);await assert.rejects(write(watched.db,scope,scope.storeId==='s'?2:0,epoch),error=>error.status===409&&error.code===code);assert.equal(watched.trace.transactions,1);assert.ok(watched.trace.events.includes('lifecycle-lock'));assert.equal(watched.trace.events.includes('store-lock'),false);assert.equal(watched.trace.events.includes('settings-write'),false);assert.deepEqual(await snapshot(),before);
  }
  await a.$transaction(async tx=>{await tx.$queryRaw`SELECT "storeId" FROM "StoreLifecycleFence" WHERE "storeId"='s' AND "companyId"='c' FOR UPDATE`;const watched=observed(b);await assert.rejects(write(watched.db,selected,2,context()),error=>error.status===409&&error.code==='STORE_LIFECYCLE_MAINTENANCE');assert.equal(watched.trace.events.includes('store-lock'),false);assert.equal(watched.trace.events.includes('settings-write'),false);assert.equal(watched.trace.transactions,1)},{maxWait:5000,timeout:15000});assert.deepEqual(await snapshot(),before);
 });

 await subtest('a generation cutover after preliminary scope read cannot upgrade the original request epoch',async()=>{
  const before=await snapshot(),next=(BigInt(generation)+1n).toString();let cutovers=0;
  const watched=observed(b,{afterScopeStore:async({row})=>{assert.equal(row.id,'s');cutovers++;await a.$executeRaw`UPDATE "StoreLifecycleFence" SET "generation"=${BigInt(next)} WHERE "storeId"='s' AND "companyId"='c'`}});
  await assert.rejects(write(watched.db,selected,2,context()),error=>error.status===409&&error.code==='STORE_LIFECYCLE_STALE_GENERATION');assert.equal(cutovers,1);assert.equal(watched.trace.transactions,1);assert.equal(watched.trace.events.includes('store-lock'),false);assert.equal(watched.trace.events.includes('settings-write'),false);
  const expected=wire(before);expected.StoreLifecycleFence.find(row=>row.storeId==='s').generation=next;assert.deepEqual(await snapshot(),expected);generation=next;
  const valid=observed(b),saved=await write(valid.db,selected,2,context());ordered(valid.trace);const after=await snapshot();checkSaved(saved,after,'s',3);settingsChangedOnly(expected,after,'s');
 });

 await subtest('fresh locked store name controls legacy cash-rule fallback instead of the preliminary stale name',async()=>{
  const scope={...selected,storeId:'renamed'},before=await snapshot();let renames=0;
  const watched=observed(b,{afterScopeStore:async({row})=>{assert.equal(row.name,'Ordinary before');renames++;await a.$executeRaw`UPDATE "Store" SET "name"='ΕΣΤΙΑ' WHERE "id"='renamed' AND "companyId"='c'`}});
  await assert.rejects(write(watched.db,scope,0,{renamed:'1'}),error=>error.status===409&&error.code==='CASH_RULE_CHANGED');assert.equal(renames,1);ordered(watched.trace,{write:false});assert.equal(watched.trace.storeRows[0][0].name,'ΕΣΤΙΑ');assert.equal(watched.trace.events.includes('settings-write'),false);
  const expected=wire(before);expected.Store.find(row=>row.id==='renamed').name='ΕΣΤΙΑ';assert.deepEqual(await snapshot(),expected);
 });

 await subtest('unenrolled legacy generation zero remains compatible without creating a lifecycle row or altering control/source evidence',async()=>{
  const before=await snapshot(),watched=observed(b),scope={...selected,storeId:'legacy'};
  const result=await write(watched.db,scope,0,{});ordered(watched.trace);const after=await snapshot();checkSaved(result,after,'legacy',1);settingsChangedOnly(before,after,'legacy');assert.equal(after.StoreLifecycleFence.some(row=>row.storeId==='legacy'),false);
  // Stable independent control and financial-source values are preserved by
  // every save/refusal above, not merely inferred from one after-only count.
  assert.deepEqual(after.CashShiftSession,before.CashShiftSession);assert.equal(createHash('sha256').update(JSON.stringify(after.CashShiftSession)).digest('hex'),createHash('sha256').update(JSON.stringify(before.CashShiftSession)).digest('hex'));
 });
}

test('native automatic-report settings writer: lifecycle-first store locks, NOWAIT refusal, key-share compatibility and original epoch',{skip:!isolated(),timeout:120000},async t=>{
 const{PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='auto_settings_order_'+randomBytes(12).toString('hex');assert.match(schema,/^auto_settings_order_[a-f0-9]{24}$/);const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const a=new PrismaClient({datasourceUrl:url.toString()}),b=new PrismaClient({datasourceUrl:url.toString()});let created=false;
 try{await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;await runAutomaticReportSettingsLockOrderRegression(a,b,{subtest:(name,fn)=>t.test(name,fn)})}finally{try{await Promise.all([a.$disconnect(),b.$disconnect()])}finally{try{if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`)}finally{await admin.$disconnect()}}}
});
