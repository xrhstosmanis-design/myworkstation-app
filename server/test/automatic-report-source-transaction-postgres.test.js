import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {previewSavedAutomaticCashReport} from '../src/services/automatic-report-settings.js';
import {readAutomaticCashPreview,readAutomaticDailyCashPreview,readAutomaticCashPreviewInTransaction} from '../src/services/automatic-report-source.js';
import {buildAutomaticCashPayload} from '../src/services/automatic-report-cash-payload.js';

const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
const scope={actorId:'sa',companyId:'c',storeId:'s'};
const day='2020-01-15',now=new Date('2020-01-16T08:00:00+02:00');
const initialAt=new Date('2020-01-16T05:10:00.000Z'),changedAt=new Date('2020-01-16T05:15:00.000Z');
const configuration=terminalPos=>({dayStartHour:7,secondShiftStartHour:15,thirdShiftStartHour:23,terminals:[{terminalPos,requiredSlots:[1,2,3]}],cashRule:{mode:'FULL',deliveryTerminalPattern:'DELIVERY',carryOverEnabled:true,posEftposEnabled:true}});
const wire=value=>JSON.parse(JSON.stringify(value));
const definitions={
 User:'"id" text primary key,"role" text',
 Store:'"id" text primary key,"companyId" text,"name" text,"active" boolean',
 CashControlStoreRule:'"storeId" text primary key,"companyId" text,"mode" text,"deliveryTerminalPattern" text,"carryOverEnabled" boolean,"posEftposEnabled" boolean,"updatedAt" timestamptz',
 CashShiftSession:'"id" text primary key,"companyId" text,"storeId" text,"terminalPos" text,"status" text,"openedBy" text,"openedByName" text,"openedAt" timestamptz,"closedAt" timestamptz,"variance" numeric(14,2),"updatedAt" timestamptz',
 AutomaticReportSettings:'"storeId" text primary key,"companyId" text,"configurationJson" jsonb,"version" integer,"updatedBy" text,"updatedAt" timestamptz'
};

// The facade wraps actual Prisma transaction clients. It never emulates a query
// or supplies source rows. Root-client reads and nested transactions are errors;
// every real model/SQL read also observes PostgreSQL's snapshot/isolation mode.
function instrument(db,{afterSettings=null,requireReadOnly=true}={}){
 const trace={transactions:0,observations:[],commands:[],settingsReads:0};
 async function observe(tx,label){
  const [state]=await tx.$queryRawUnsafe("SELECT current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS readonly,txid_current_snapshot()::text AS snapshot");
  assert.equal(state.isolation,'repeatable read',label);if(requireReadOnly)assert.equal(state.readonly,'on',label);
  trace.observations.push({label,snapshot:state.snapshot,readonly:state.readonly});
 }
 function wrap(tx){
  return new Proxy(tx,{get(target,key){
   if(key==='$transaction')return()=>{throw new Error('Nested transaction attempted by transaction-aware preview')};
   if(key==='$executeRawUnsafe')return async(...args)=>{trace.commands.push(String(args[0]));return target.$executeRawUnsafe(...args)};
   if(key==='$queryRaw')return async(...args)=>{
    const sql=Array.isArray(args[0])?args[0].join('?'):String(args[0]?.sql||args[0]);
    const result=await target.$queryRaw(...args);await observe(target,sql);
    if(/SELECT\s+"configurationJson"\s*,\s*"version"\s*,\s*"updatedAt"\s+FROM\s+"AutomaticReportSettings"/i.test(sql)){
     trace.settingsReads++;if(afterSettings)await afterSettings({result,tx:target,trace});
    }
    return result;
   };
   if(key==='user'||key==='store')return new Proxy(target[key],{get(delegate,method){const value=delegate[method];return typeof value==='function'?async(...args)=>{const result=await value.apply(delegate,args);await observe(target,`${String(key)}.${String(method)}`);return result}:value}});
   const value=target[key];return typeof value==='function'?value.bind(target):value;
  }});
 }
 const facade=new Proxy({$transaction:async(callback,options)=>{
  trace.transactions++;assert.equal(options?.isolationLevel,'RepeatableRead');
  return db.$transaction(tx=>callback(wrap(tx)),options);
 }},{get(target,key){if(key==='$transaction')return target.$transaction;throw new Error(`Preview attempted root-client access: ${String(key)}`)}});
 return {db:facade,trace,wrap};
}

function coherent(preview,version,terminal,amounts){
 assert.equal(preview.ready,true);assert.equal(preview.sourceReadiness,'READY');assert.equal(preview.complete,true);assert.equal(preview.settingsVersion,version);assert.equal(preview.sourceCount,3);assert.deepEqual(preview.holds,[]);
 assert.equal(preview.store.id,'s');assert.equal(preview.store.companyId,'c');assert.equal(preview.groups.length,1);assert.equal(preview.groups[0].terminalPos,terminal);assert.equal(preview.groups[0].cashChain,'STORE');
 const rows=new Map(preview.groups[0].rows.map(row=>[row.sessionId,row.variance]));assert.deepEqual([...rows.keys()].sort(),['afternoon','morning','night']);for(const[id,amount]of Object.entries(amounts))assert.equal(rows.get(id),amount);
 assert.equal(preview.groups[0].netVariance,Object.values(amounts).reduce((sum,amount)=>sum+amount,0));
 assert.equal(preview.financialFinality,'PROVISIONAL');assert.equal(preview.financialReconciliationComplete,false);assert.equal(preview.employeeLiabilityAdjusted,false);assert.equal(preview.deliveryStatus,'PREVIEW_ONLY');
 const envelope=buildAutomaticCashPayload({preview:wire(preview),companyId:'c',storeId:'s',settingsVersion:version}),body=JSON.parse(envelope.body);
 assert.equal(envelope.payloadFingerprint,createHash('sha256').update(envelope.body,'utf8').digest('hex'));assert.equal(envelope.sourceFingerprint,preview.sourceFingerprint);assert.equal(body.settingsVersion,version);assert.equal(body.groups[0].terminalPos,terminal);assert.equal(body.groups[0].netVariance,preview.groups[0].netVariance);assert.equal(body.financialFinality,'PROVISIONAL');assert.equal(body.financialReconciliationComplete,false);
 return envelope;
}

// Isolated database effects below are fixture setup and one identified writer
// transaction only. The production preview/source/payload functions are real.
export async function runAutomaticReportSourceTransactionRegression(db,other,{subtest=async(_name,fn)=>fn()}={}){
 for(const[name,columns]of Object.entries(definitions))await db.$executeRawUnsafe(`CREATE TABLE "${name}"(${columns})`);
 await db.$executeRaw`INSERT INTO "User" VALUES('sa','SUPER_ADMIN'),('owner','OWNER')`;
 await db.$executeRaw`INSERT INTO "Store" VALUES('s','c','Synthetic LAB',true),('control','c','Control',true),('foreign','x','Foreign',true),('inactive','c','Inactive',false)`;
 await db.$executeRaw`INSERT INTO "CashControlStoreRule" VALUES('s','c','FULL','DELIVERY',true,true,${initialAt}),('control','c','FULL','DELIVERY',true,true,${initialAt})`;
 for(const[id,hour,close,amount]of [['morning','07','2020-01-15T15:00:00+02:00',-10],['afternoon','15','2020-01-15T23:00:00+02:00',8],['night','23','2020-01-16T07:00:00+02:00',0]])await db.$executeRaw`INSERT INTO "CashShiftSession" VALUES(${id},'c','s','MAIN','CLOSED','employee','Recorded opening user',${new Date(`${day}T${hour}:00:00+02:00`)},${new Date(close)},${amount},${initialAt})`;
 await db.$executeRaw`INSERT INTO "CashShiftSession" VALUES('control-session','c','control','CONTROL','CLOSED','control-user','Control user',${new Date('2020-01-15T07:00:00+02:00')},${new Date('2020-01-15T15:00:00+02:00')},66,${initialAt}),('foreign-session','x','s','MAIN','CLOSED','foreign-user','Foreign user',${new Date('2020-01-15T07:00:00+02:00')},${new Date('2020-01-15T15:00:00+02:00')},77,${initialAt})`;
 const oldConfig=configuration('MAIN'),newConfig=configuration('ALT');
 await db.$executeRaw`INSERT INTO "AutomaticReportSettings" VALUES('s','c',${JSON.stringify(oldConfig)}::jsonb,1,'sa',${initialAt}),('control','c',${JSON.stringify(configuration('CONTROL'))}::jsonb,11,'sa',${initialAt})`;
 const snapshot=async()=>Object.fromEntries(await Promise.all(Object.keys(definitions).map(async table=>[table,wire(await db.$queryRawUnsafe(`SELECT * FROM "${table}" ORDER BY 1`))])));
 let oldEnvelope,newEnvelope;

 await subtest('saved settings and source share one actual read-only snapshot across an independent atomic writer commit',async()=>{
  const before=await snapshot();let writerCommits=0;
  const wrapped=instrument(db,{afterSettings:async({result})=>{
   assert.equal(result[0].version,1);assert.equal(writerCommits,0);
   await other.$transaction(async tx=>{
    await tx.$executeRaw`UPDATE "AutomaticReportSettings" SET "configurationJson"=${JSON.stringify(newConfig)}::jsonb,"version"=2,"updatedAt"=${changedAt} WHERE "companyId"='c' AND "storeId"='s' AND "version"=1`;
    await tx.$executeRaw`UPDATE "CashShiftSession" SET "terminalPos"='ALT',"variance"=CASE "id" WHEN 'morning' THEN 4 WHEN 'afternoon' THEN 3 ELSE 0 END,"updatedAt"=${changedAt} WHERE "companyId"='c' AND "storeId"='s'`;
   });writerCommits++;
  }});
  const first=await previewSavedAutomaticCashReport(wrapped.db,scope,{day,expectedVersion:1},now);
  assert.equal(writerCommits,1);assert.equal(wrapped.trace.transactions,1);assert.equal(wrapped.trace.settingsReads,1);assert.ok(wrapped.trace.observations.length>=6);assert.equal(new Set(wrapped.trace.observations.map(row=>row.snapshot)).size,1);assert.ok(wrapped.trace.commands.some(sql=>/^SET TRANSACTION READ ONLY$/i.test(sql)));
  oldEnvelope=coherent(first,1,'MAIN',{morning:-10,afternoon:8,night:0});
  // Only the fixture writer's two explicitly identified mutations are allowed;
  // all users/stores/rules and foreign/control settings/sessions stay identical.
  const expected=wire(before),setting=expected.AutomaticReportSettings.find(row=>row.storeId==='s');setting.configurationJson=wire(newConfig);setting.version=2;setting.updatedAt=changedAt.toISOString();
  for(const row of expected.CashShiftSession)if(row.companyId==='c'&&row.storeId==='s'){row.terminalPos='ALT';row.variance=String(row.id==='morning'?4:row.id==='afternoon'?3:0);row.updatedAt=changedAt.toISOString();}
  assert.deepEqual(await snapshot(),expected);
 });

 await subtest('a later preview observes the coherent new configuration/source while stale expected version rejects before payload creation',async()=>{
  const before=await snapshot(),stale=instrument(db);
  await assert.rejects(previewSavedAutomaticCashReport(stale.db,scope,{day,expectedVersion:1},now),error=>error.status===409&&error.code==='REPORT_SETTINGS_CHANGED');assert.equal(stale.trace.transactions,1);assert.equal(stale.trace.settingsReads,1);
  const fresh=instrument(db),second=await previewSavedAutomaticCashReport(fresh.db,scope,{day,expectedVersion:2},now);newEnvelope=coherent(second,2,'ALT',{morning:4,afternoon:3,night:0});assert.equal(fresh.trace.transactions,1);assert.equal(new Set(fresh.trace.observations.map(row=>row.snapshot)).size,1);
  assert.notEqual(newEnvelope.sourceFingerprint,oldEnvelope.sourceFingerprint);assert.notEqual(newEnvelope.payloadFingerprint,oldEnvelope.payloadFingerprint);assert.deepEqual(await snapshot(),before);
 });

 await subtest('public daily wrapper and caller-owned transaction reader preserve scope, original differences and payload contract without nesting',async()=>{
  const before=await snapshot(),args={...scope,day,frequency:'DAILY',configuration:newConfig,settingsVersion:2,now};
  // Public compatibility wrappers keep their existing RepeatableRead policy;
  // the saved-settings consumer and caller-owned adapter have explicit RO mode.
  const publicReader=instrument(db,{requireReadOnly:false}),daily=await readAutomaticDailyCashPreview(publicReader.db,args);coherent(daily,2,'ALT',{morning:4,afternoon:3,night:0});assert.equal(publicReader.trace.transactions,1);assert.equal(new Set(publicReader.trace.observations.map(row=>row.snapshot)).size,1);
  const generic=instrument(db,{requireReadOnly:false}),ordinary=await readAutomaticCashPreview(generic.db,args);assert.deepEqual(ordinary,daily);assert.equal(generic.trace.transactions,1);
  const caller=instrument(db);let inner;
  await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');inner=await readAutomaticCashPreviewInTransaction(caller.wrap(tx),args)},{isolationLevel:'RepeatableRead',maxWait:5000,timeout:15000});
  assert.equal(caller.trace.transactions,0);assert.deepEqual(caller.trace.commands,[]);assert.deepEqual(inner,daily);assert.ok(caller.trace.observations.length>=4);assert.equal(new Set(caller.trace.observations.map(row=>row.snapshot)).size,1);assert.deepEqual(await snapshot(),before);
  // Separate fixture-owned transaction proves PostgreSQL enforces the mode;
  // never deliberately poison a production preview transaction with a write.
  await assert.rejects(db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');await tx.$executeRaw`UPDATE "CashShiftSession" SET "variance"=999 WHERE "id"='control-session'`},{isolationLevel:'RepeatableRead',maxWait:5000,timeout:15000}),error=>error?.meta?.code==='25006'||error?.code==='25006');
  assert.deepEqual(await snapshot(),before);
 });

 await subtest('transaction-aware source sees its caller own writes without changing transaction mode and rollback leaves no effects',async()=>{
  const before=await snapshot(),rollback=new Error('identified fixture rollback'),caller=instrument(db,{requireReadOnly:false});
  await assert.rejects(db.$transaction(async tx=>{
   await tx.$executeRaw`UPDATE "CashShiftSession" SET "variance"=9 WHERE "companyId"='c' AND "storeId"='s' AND "id"='morning'`;
   const preview=await readAutomaticCashPreviewInTransaction(caller.wrap(tx),{...scope,day,frequency:'DAILY',configuration:newConfig,settingsVersion:2,now});
   coherent(preview,2,'ALT',{morning:9,afternoon:3,night:0});
   assert.equal(caller.trace.transactions,0);assert.deepEqual(caller.trace.commands,[]);assert.ok(caller.trace.observations.every(row=>row.readonly==='off'));
   throw rollback;
  },{isolationLevel:'RepeatableRead',maxWait:5000,timeout:15000}),error=>error===rollback);
  assert.deepEqual(await snapshot(),before);
 });

 await subtest('actor/store rejection and missing settings source remain read-only, without bootstrap or scope leakage',async()=>{
  const before=await snapshot();
  for(const change of [{actorId:'owner'},{actorId:'missing'},{companyId:'x'},{storeId:'foreign'},{storeId:'inactive'}])await assert.rejects(previewSavedAutomaticCashReport(instrument(db).db,{...scope,...change},{day,expectedVersion:2},now),error=>[403,404].includes(error.status));
  assert.deepEqual(await snapshot(),before);
  await db.$executeRawUnsafe('ALTER TABLE "AutomaticReportSettings" RENAME TO "AutomaticReportSettings_held"');
  try{
   const held=wire(await db.$queryRawUnsafe('SELECT * FROM "AutomaticReportSettings_held" ORDER BY 1'));
   await assert.rejects(previewSavedAutomaticCashReport(instrument(db).db,scope,{day,expectedVersion:2},now),error=>error?.meta?.code==='42P01'||error?.code==='42P01');
   assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='AutomaticReportSettings'`)[0].n,0);assert.deepEqual(wire(await db.$queryRawUnsafe('SELECT * FROM "AutomaticReportSettings_held" ORDER BY 1')),held);
  }finally{await db.$executeRawUnsafe('ALTER TABLE "AutomaticReportSettings_held" RENAME TO "AutomaticReportSettings"')}
  assert.deepEqual(await snapshot(),before);
 });
}

test('native automatic cash source transaction: saved configuration/source snapshot, independent writer, stale version and actual payload',{skip:!isolated(),timeout:120000},async t=>{
 const{PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='auto_source_transaction_'+randomUUID().replaceAll('-','');const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()}),other=new PrismaClient({datasourceUrl:url.toString()});
 try{await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);await runAutomaticReportSourceTransactionRegression(db,other,{subtest:(name,fn)=>t.test(name,fn)})}finally{await other.$disconnect();await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
