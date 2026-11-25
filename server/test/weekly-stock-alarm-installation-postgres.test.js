import {ensureEfoodLabOrderSchema} from '../src/integrations/efood/lab-order-postgres.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWeeklyStockAlarmInstallation} from '../src/services/weekly-stock-alarm-installation.js';
import {createExpectedReceiptInstallation} from '../src/services/supplier-expected-receipts-installation.js';
import {createAutomaticReportEventInstallation as createEvents} from '../src/services/automatic-report-event-installation.js';
import {reportChatCompatibilityDDL} from '../src/services/automatic-report-chat-compatibility.js';
import {inspectWeeklyAlarmCatalogue} from '../src/services/weekly-stock-alarm-catalogue.js';
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

async function v3Fixture(){
 const h=await helpers(),f=await h.fixture();
 try{
  await f.service.install(h.actor,{...h.scope,packet:(await f.service.inspect(h.actor,h.scope)).packet});
  await f.db.$executeRawUnsafe(`INSERT INTO "User"("id","email","passwordHash","fullName","companyId","role","updatedAt") VALUES ('synthetic-admin','synthetic@example.invalid','SYNTHETIC','SYNTHETIC','fixture-company','SUPER_ADMIN',NOW())`);
  await f.db.$executeRawUnsafe(`INSERT INTO "UserSession"("id","userId","expiresAt") VALUES ('weekly-session','synthetic-admin',NOW()+INTERVAL '1 hour')`);
  const actor={...h.actor,sessionId:'weekly-session',sessionVersion:0,tokenType:'BACKOFFICE_USER'};
  await h.addCurrentReportSources(f.db);for(const sql of reportChatCompatibilityDDL())await f.db.$executeRawUnsafe(sql);await h.seedChat(f.db);
  const v3=createEvents(f.db,{sourceRevision:h.revision,enabled:true,profile:'CAPTURE_REPORTS_ONLY_V3'});
  await v3.install(h.actor,{...h.scope,packet:(await v3.inspect(h.actor,h.scope)).packet,explicitAuthorization:true});
  return {h,f,actor};
 }catch(error){await f.close();throw error}
}
test('weekly alarm actual V3 installation preserves legacy rows, validates catalogue and composes with No14',{skip:!isolated(),timeout:60000},async()=>{
 const {h,f,actor}=await v3Fixture();
 try{
  const business=async()=>(await f.rows()).filter(r=>!r.table_name.startsWith('StoreLifecycle')&&!r.table_name.startsWith('WeeklyStockAlarm'));
  const before=await business(),fences=await f.db.$queryRawUnsafe('SELECT "storeId","companyId","generation","maintenance","retired","operationId" FROM "StoreLifecycleFence" ORDER BY "storeId"');
  const disabled=createWeeklyStockAlarmInstallation(f.db,{sourceRevision:h.revision});const inspection=await disabled.inspect(actor,h.scope);assert.equal(inspection.eligible,false);assert.throws(()=>disabled.install(actor,{...h.scope,packet:inspection.packet,explicitAuthorization:true}),{code:'WEEKLY_ALARM_INSTALL_DISABLED'});
  const service=createWeeklyStockAlarmInstallation(f.db,{sourceRevision:h.revision,enabled:true}),packet=(await service.inspect(actor,h.scope)).packet;
  await assert.rejects(service.inspect({...actor,sessionId:'missing'},h.scope));assert.throws(()=>service.install(actor,{...h.scope,packet}),{code:'WEEKLY_ALARM_INSTALL_AUTHORIZATION_REQUIRED'});
  await assert.rejects(service.install(actor,{...h.scope,packet:{...packet,catalogueSignature:'0'.repeat(64)},explicitAuthorization:true}),{code:'WEEKLY_ALARM_INSTALL_STATE_CHANGED'});
  const installed=await service.install(actor,{...h.scope,packet,explicitAuthorization:true});assert.equal(installed.installed,true);assert.equal(installed.productionActivated,false);
  await inspectWeeklyAlarmCatalogue(f.db,'public');assert.deepEqual(await business(),before);assert.deepEqual(await f.db.$queryRawUnsafe('SELECT "storeId","companyId","generation","maintenance","retired","operationId" FROM "StoreLifecycleFence" ORDER BY "storeId"'),fences);
  const again=await service.install(actor,{...h.scope,packet:(await service.inspect(actor,h.scope)).packet,explicitAuthorization:true});assert.equal(again.alreadyInstalled,true);
  await f.db.$executeRawUnsafe('DROP INDEX "WeeklyStockAlarmHistory_scope"');await assert.rejects(service.inspect(actor,h.scope),{code:'WEEKLY_ALARM_CATALOGUE_CHANGED'});await f.db.$executeRawUnsafe('CREATE INDEX "WeeklyStockAlarmHistory_scope" ON "WeeklyStockAlarmHistory"("companyId","storeId","createdAt")');
  const no14=createExpectedReceiptInstallation(f.db,{sourceRevision:h.revision,enabled:true,weeklyStockAlarm:true});const p=(await no14.inspect(actor,h.scope)).packet;const result=await no14.install(actor,{...h.scope,packet:p,explicitAuthorization:true});assert.equal(result.installed,true);await inspectWeeklyAlarmCatalogue(f.db,'public');assert.deepEqual(await business(),before);
 }finally{await f.close()}
});


test('weekly admission covers existing security catalogue and No14-first or No14-after-security order',{skip:!isolated(),timeout:60000},async()=>{
 for(const transition of ['V3_SECURITY','NO14_FIRST']){
  const {h,f,actor}=await v3Fixture();
  try{
   if(transition==='NO14_FIRST'){
    const no14=createExpectedReceiptInstallation(f.db,{sourceRevision:h.revision,enabled:true});await no14.install(actor,{...h.scope,packet:(await no14.inspect(actor,h.scope)).packet,explicitAuthorization:true});
   }
   const sourceProfile='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_'+(transition==='NO14_FIRST'?'NO14_V1':'V3');
   const weekly=createWeeklyStockAlarmInstallation(f.db,{sourceRevision:h.revision,enabled:true,sourceProfile,admitExistingSecurity:transition==='V3_SECURITY',admitExistingLab:transition==='V3_SECURITY'});
   if(transition==='V3_SECURITY'){
    await assert.rejects(weekly.inspect(actor,h.scope),{code:'WEEKLY_ALARM_EXISTING_LAB_CHANGED'});
    await ensureEfoodLabOrderSchema(f.db);await f.db.$executeRawUnsafe('ALTER TABLE "CashShiftSession" ADD COLUMN "closeReconciliationStatus" TEXT, ALTER COLUMN "eftposTotal" DROP NOT NULL, ALTER COLUMN "cardVariance" DROP NOT NULL, ALTER COLUMN "expectedOpeningOperational" DROP NOT NULL, ALTER COLUMN "openingVariance" DROP NOT NULL');await f.db.$executeRawUnsafe('ALTER TABLE "StoreIntegrationCredential" ADD COLUMN "receiveFromDate" DATE');await f.db.$executeRawUnsafe(`INSERT INTO "EfoodLabOrderRun" VALUES ('synthetic-integration','00000000-0000-4000-8000-000000000001',10,'{}'::jsonb)`);
    await assert.rejects(weekly.inspect(actor,h.scope),{code:'REPORT_SECURITY_CATALOGUE_CHANGED'});
    await f.db.$executeRawUnsafe('CREATE TABLE "StoreChatAccessRevocation" ("companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"userId" TEXT NOT NULL,PRIMARY KEY("companyId","storeId","userId"))');
   }
   const business=async()=>(await f.rows()).filter(r=>!r.table_name.startsWith('StoreLifecycle')&&!r.table_name.startsWith('WeeklyStockAlarm'));const before=await business();
   await weekly.install(actor,{...h.scope,packet:(await weekly.inspect(actor,h.scope)).packet,explicitAuthorization:true});
   if(transition==='V3_SECURITY'){
    const no14=createExpectedReceiptInstallation(f.db,{sourceRevision:h.revision,enabled:true,weeklyStockAlarm:true,sourceProfile:'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V4',existingLab:true});await no14.install(actor,{...h.scope,packet:(await no14.inspect(actor,h.scope)).packet,explicitAuthorization:true});
   }
   await inspectWeeklyAlarmCatalogue(f.db,'public');assert.deepEqual(await business(),before);
  }finally{await f.close()}
 }
});
