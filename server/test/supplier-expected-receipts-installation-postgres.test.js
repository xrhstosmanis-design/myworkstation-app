import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createExpectedReceiptInstallation} from '../src/services/supplier-expected-receipts-installation.js';
import {createAutomaticReportEventInstallation as createEvents} from '../src/services/automatic-report-event-installation.js';
import {lockAutomaticReportBoundary} from '../src/services/automatic-report-lock-boundary.js';
import {automaticReportEventLifecycleReady} from '../src/services/automatic-report-event-schema.js';
import {reportChatCompatibilityDDL} from '../src/services/automatic-report-chat-compatibility.js';

// Reuse the actual private V3 fixture without rerunning its old test registrations.
// Assertions, schema DDL and provisioning helpers remain real and unmodified.
async function helpers(){
 const url=new URL('./automatic-report-chat-installation-postgres.test.js',import.meta.url);
 let source=readFileSync(url,'utf8');
 for(const marker of ['async function fixture(){','async function addCurrentReportSources(','async function seedChat(','const revision=','const scope='])assert(source.includes(marker),`V3 fixture contract changed: ${marker}`);
 assert(source.startsWith("import test from 'node:test';"));
 source=source.replace("import test from 'node:test';",'const test=()=>{};');
 source=source.replace(/from '(\.\.?\/[^']+)'/g,(_,path)=>`from '${new URL(path,url).href}'`)
  .replaceAll('import.meta.url',JSON.stringify(url.href))
  .replaceAll("import('@prisma/client')",`import(${JSON.stringify(import.meta.resolve('@prisma/client'))})`);
 source+='\nexport {fixture,addCurrentReportSources,seedChat,actor,scope,revision};';
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['127.0.0.1','localhost','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)&&!u.search&&!u.hash;}catch{return false;}};
const tables=['SupplierExpectedReceiptLine','SupplierExpectedReceiptAllocation','SupplierExpectedReceiptOperation'];
test('No14 actual V3 transition preserves old guards, rows and enrollment generation', {skip:!isolated()},async()=>{
 const h=await helpers(),f=await h.fixture();
 try{
  await f.service.install(h.actor,{...h.scope,packet:(await f.service.inspect(h.actor,h.scope)).packet});
  const sibling={companyId:'fixture-company',storeId:'sibling'};
  await f.service.install(h.actor,{...sibling,packet:(await f.service.inspect(h.actor,sibling)).packet});
  await f.db.$executeRawUnsafe(`INSERT INTO "User"("id","email","passwordHash","fullName","companyId","role","updatedAt") VALUES ('synthetic-admin','synthetic@example.invalid','SYNTHETIC','SYNTHETIC','fixture-company','SUPER_ADMIN',NOW())`);
  await f.db.$executeRawUnsafe(`INSERT INTO "UserSession"("id","userId","expiresAt") VALUES ('no14-session','synthetic-admin',NOW()+INTERVAL '1 hour')`);
  const actor={...h.actor,sessionId:'no14-session',sessionVersion:0,tokenType:'BACKOFFICE_USER'};
  await assert.rejects(createExpectedReceiptInstallation(f.db,{sourceRevision:h.revision,enabled:true}).inspect(actor,h.scope),'CAPTURE source cannot satisfy exact V3 preflight');
  await h.addCurrentReportSources(f.db);
  for(const sql of reportChatCompatibilityDDL())await f.db.$executeRawUnsafe(sql);
  await h.seedChat(f.db);
  const v3=createEvents(f.db,{sourceRevision:h.revision,enabled:true,profile:'CAPTURE_REPORTS_ONLY_V3'});
  await v3.install(h.actor,{...h.scope,packet:(await v3.inspect(h.actor,h.scope)).packet,explicitAuthorization:true});
  const service=createExpectedReceiptInstallation(f.db,{sourceRevision:h.revision,enabled:true});
  const packet=(await service.inspect(actor,h.scope)).packet;
  await assert.rejects(async()=>service.inspect({...actor,sessionId:'missing'},h.scope),{code:'EXPECTED_RECEIPT_INSTALL_ACTOR_CHANGED'});
  await assert.rejects(async()=>service.inspect({...actor,sessionVersion:1},h.scope),{code:'EXPECTED_RECEIPT_INSTALL_ACTOR_CHANGED'});
  await assert.rejects(async()=>service.inspect({...actor,supportContext:{}},h.scope));
  await assert.rejects(async()=>service.inspect(actor,{companyId:'foreign-company',storeId:'foreign'}),{code:'EXPECTED_RECEIPT_INSTALL_ENROLLMENT_REQUIRED'});
  assert.throws(()=>service.install(actor,{...h.scope,packet:{...packet,sourceRevision:'b'.repeat(40)},explicitAuthorization:true}));
  await assert.rejects(async()=>service.install(actor,{...h.scope,packet:{...packet,controlsSignature:'0'.repeat(64)},explicitAuthorization:true}),{code:'EXPECTED_RECEIPT_INSTALL_STATE_CHANGED'});
  const disabled=createExpectedReceiptInstallation(f.db,{sourceRevision:h.revision,enabled:false});
  const beforeDisabled={rows:await f.rows(),catalogue:await f.catalogue()};
  const unavailable=await disabled.inspect(actor,h.scope);
  assert.equal(unavailable.eligible,false);assert.deepEqual(unavailable.reasons,['EXPECTED_RECEIPT_INSTALL_DISABLED']);
  assert.throws(()=>disabled.install(actor,{...h.scope,packet,explicitAuthorization:true}),{code:'EXPECTED_RECEIPT_INSTALL_DISABLED'});
  assert.deepEqual({rows:await f.rows(),catalogue:await f.catalogue()},beforeDisabled,'disabled inspect/action leave actual DB unchanged');
  const oldNo7Packet=(await v3.inspect(h.actor,h.scope)).packet;
  const unchanged={rows:await f.rows(),catalogue:await f.catalogue()};
  for(const stage of ['first-create','second-create','after-fence']){
   let creates=0,updated=false;
   const faultDb={$transaction:(callback,options)=>f.db.$transaction(tx=>callback(new Proxy(tx,{get(target,key){
    if(!['$executeRawUnsafe','$queryRawUnsafe'].includes(key))return Reflect.get(target,key);
    return async(sql,...args)=>{
     if(['first-create','second-create'].includes(stage)&&/^CREATE TABLE/.test(sql)&&++creates===(stage==='first-create'?1:2))throw Error('synthetic second DDL failure');
     if(stage==='after-fence'&&updated&&sql==='SELECT current_schema() AS schema')throw Error('synthetic final inspection failure');
     const value=await target[key](sql,...args);
     if(/^UPDATE .*StoreLifecycleFence/.test(sql))updated=true;
     return value;
    };
   }})),options)};
   const faulty=createExpectedReceiptInstallation(faultDb,{sourceRevision:h.revision,enabled:true});
   await assert.rejects(faulty.install(actor,{...h.scope,packet,explicitAuthorization:true}),/synthetic/);
   assert.deepEqual({rows:await f.rows(),catalogue:await f.catalogue()},unchanged,stage+' rolls back actual DDL and fences');
  }

  for(const [label,sql] of [
   ['partial schema','CREATE TABLE "SupplierExpectedReceiptOperation" ("id" text)'],
   ['mixed known fences',`UPDATE "StoreLifecycleFence" SET "planHash"='${service.describe().targetPlanHash}' WHERE "storeId"='sibling'`],
   ['unknown fence',`UPDATE "StoreLifecycleFence" SET "planHash"='${'0'.repeat(64)}' WHERE "storeId"='target'`],
  ]){
   const invalidDb={$transaction:(callback,options)=>f.db.$transaction(async tx=>{await tx.$executeRawUnsafe(sql);return callback(tx);},options)};
   await assert.rejects(createExpectedReceiptInstallation(invalidDb,{sourceRevision:h.revision,enabled:true}).install(actor,{...h.scope,packet,explicitAuthorization:true}),label);
   assert.deepEqual({rows:await f.rows(),catalogue:await f.catalogue()},unchanged,label+' refusal rolls back injected corrupt fixture');
  }
  const admissionBefore=await f.db.$transaction(tx=>lockAutomaticReportBoundary(tx,h.scope));
  assert.equal(automaticReportEventLifecycleReady({MWS_STORE_LIFECYCLE_PROFILE:'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V2'}),true);
  const before=await f.catalogue();
  const rowsBefore=await f.rows();
  const fences=await f.db.$queryRawUnsafe('SELECT * FROM "StoreLifecycleFence" ORDER BY "storeId"');
  assert.equal(fences.length,2,'multiple enrolled stores must transition uniformly');
  const result=await service.install(actor,{...h.scope,packet,explicitAuthorization:true});
  assert.equal(result.transitionedEnrollments,2);assert.equal(result.installed,true);assert.equal(result.productionActivated,false);
  const after=await f.catalogue();
  const stripFence=rows=>rows.map(item=>item.table_name==='StoreLifecycleFence'?{...item,row:JSON.stringify((({planHash,...rest})=>rest)(JSON.parse(item.row)))}:item);
  assert.deepEqual(stripFence(await f.rows()),stripFence(rowsBefore));
  assert.deepEqual(await f.db.$transaction(tx=>lockAutomaticReportBoundary(tx,h.scope)),admissionBefore);
  assert.equal(automaticReportEventLifecycleReady({MWS_STORE_LIFECYCLE_PROFILE:'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V2'}),true);
  const clean=groups=>groups.map(group=>group.filter(row=>!tables.some(name=>(row.name??row.table_name??row.tablename??'')===name||(row.table_name??'').startsWith(name+'_'))));
  assert.deepEqual(clean(after),clean(before),'all existing catalog objects, including old trigger/function bytes, preserved');
  const next=await f.db.$queryRawUnsafe('SELECT * FROM "StoreLifecycleFence" ORDER BY "storeId"');
  assert.deepEqual(next.map(({planHash,...row})=>row),fences.map(({planHash,...row})=>row));
  assert(next.every(row=>row.planHash===service.describe().targetPlanHash));
  for(const name of tables)assert.deepEqual(await f.db.$queryRawUnsafe(`SELECT * FROM "${name}"`),[]);
  let mutations=0;
  const readProofDb={$transaction:(callback,options)=>f.db.$transaction(tx=>callback(new Proxy(tx,{get(target,key){
   if(!['$executeRawUnsafe','$queryRawUnsafe'].includes(key))return Reflect.get(target,key);
   return async(sql,...args)=>{if(/^\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sql))mutations++;return target[key](sql,...args);};
  }})),options)};
  const replay=await createExpectedReceiptInstallation(readProofDb,{sourceRevision:h.revision,enabled:true}).install(actor,{...h.scope,packet,explicitAuthorization:true});
  assert.equal(mutations,0,'target reconciliation performs no DML or DDL');

  assert.equal(replay.alreadyInstalled,true);assert.equal(replay.verifiedCurrentTarget,true);assert.equal(replay.originalOperationReceipt,false);
  assert.deepEqual(await f.catalogue(),after);
  await assert.rejects(v3.install(h.actor,{...h.scope,packet:oldNo7Packet,explicitAuthorization:true}),'old No7 source packet is not silently reinterpreted');
  const unloggedDb={$transaction:(callback,options)=>f.db.$transaction(async tx=>{await tx.$executeRawUnsafe('ALTER TABLE "SupplierExpectedReceiptOperation" SET UNLOGGED');return callback(tx);},options)};
  await assert.rejects(createExpectedReceiptInstallation(unloggedDb,{sourceRevision:h.revision,enabled:true}).install(actor,{...h.scope,packet,explicitAuthorization:true}),{code:'EXPECTED_RECEIPT_CATALOGUE_CHANGED'});
  assert.deepEqual(await f.catalogue(),after,'UNLOGGED mutation rolled back and cannot reconcile as installed');
 }finally{await f.close();}
});
