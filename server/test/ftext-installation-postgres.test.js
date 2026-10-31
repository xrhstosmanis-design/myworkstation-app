import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createFtextInstallationService} from '../src/services/ftext-installation.js';
import {ensureFtextCashSchema,ftextCashLifecycleReviewProposal} from '../src/services/ftext-cash-schema.js';
import {prepareFtextCashRequest,claimFtextCashRequest} from '../src/services/ftext-cash-requests.js';
import {companyModuleState} from '../src/middleware/module-access.js';
import {pollFtextDeviceWork} from '../src/services/ftext-device-work.js';
function isolated(){try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(decodeURIComponent(u.pathname))}catch{return false}}
export async function runFtextRegression(a,b,{subtest=async(_n,f)=>f()}={}){
 const sql=[
 'CREATE TABLE "Company" ("id" TEXT PRIMARY KEY,"name" TEXT,"active" BOOLEAN,"licenseStatus" TEXT,"subscriptionEndsAt" TIMESTAMP)',
 'CREATE TABLE "CompanyModule" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"moduleKey" TEXT,"active" BOOLEAN,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP)',
 'CREATE TABLE "Store" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT,"active" BOOLEAN)',
 'CREATE TABLE "StoreInstallationTerminal" ("companyId" TEXT,"storeId" TEXT,"terminalPos" TEXT,"active" BOOLEAN)',
 'CREATE TABLE "StoreFiscalDevice" ("companyId" TEXT,"storeId" TEXT,"terminalPos" TEXT,"deviceCode" TEXT,"active" BOOLEAN)',
 'CREATE TABLE "CloudDevice" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"deviceKey" TEXT,"name" TEXT,"platform" TEXT,"status" TEXT,"tokenVersion" INTEGER NOT NULL DEFAULT 1,"metadata" JSONB,"pairedAt" TIMESTAMP,"lastSeenAt" TIMESTAMP,"revokedAt" TIMESTAMP,UNIQUE("storeId","deviceKey"))',
 'CREATE TABLE "CloudPairingCode" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"codeHash" TEXT UNIQUE,"expiresAt" TIMESTAMP,"createdBy" TEXT,"usedAt" TIMESTAMP,"createdAt" TIMESTAMP DEFAULT NOW())',
 'CREATE TABLE "CloudAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"actorType" TEXT,"actorId" TEXT,"eventType" TEXT,"details" JSONB,"createdAt" TIMESTAMP DEFAULT NOW())',
 'CREATE TABLE "StoreLifecycleFence" ("storeId" TEXT PRIMARY KEY,"companyId" TEXT,"generation" BIGINT,"maintenance" BOOLEAN,"retired" BOOLEAN)'
 ];for(const statement of sql)await a.$executeRawUnsafe(statement);
 await a.$executeRaw`INSERT INTO "Company" VALUES ('company-A','Fixture A',true,'ACTIVE',NULL),('company-B','Fixture B',true,'ACTIVE',NULL)`;
 await a.$executeRaw`INSERT INTO "CompanyModule" VALUES ('module-A','company-A','CONNECTOR_FTEXT',true,NULL,NULL),('module-B','company-B','CONNECTOR_FTEXT',true,NULL,NULL)`;
 await a.$executeRaw`INSERT INTO "Store" VALUES ('store-A','company-A','Store A',true),('store-B','company-B','Store B',true)`;
 await a.$executeRaw`INSERT INTO "StoreInstallationTerminal" VALUES ('company-A','store-A','POS-01',true),('company-B','store-B','POS-01',true)`;
 await a.$executeRaw`INSERT INTO "StoreFiscalDevice" VALUES ('company-A','store-A','POS-01','FISCAL-A',true),('company-B','store-B','POS-01','FISCAL-B',true)`;
 await a.$executeRaw`INSERT INTO "StoreLifecycleFence" VALUES ('store-A','company-A',0,false,false),('store-B','company-B',0,false,false)`;
 let now=new Date();const secret=()=> 'isolated-fixture-secret-123456789';
 const make=(db=a,key=secret)=>createFtextInstallationService({db,moduleState:(id,t)=>companyModuleState(id,{db:t}),secret:key,clock:()=>now,cashSchemaInstaller:t=>ensureFtextCashSchema(t,{manifest:ftextCashLifecycleReviewProposal()})});
 const service=make(),other=make(b),scope={companyId:'company-A',storeId:'store-A',terminalPos:'POS-01'},control={companyId:'company-B',storeId:'store-B',terminalPos:'POS-01'};
 const input={terminalPos:'POS-01',serialNumber:'TEST12345',workFolder:'C:\\FText',confirmed:true};
 const configured=await service.configure(scope,input,'fixture-admin');await service.configure(control,{...input,serialNumber:'CONTROL123'},'fixture-admin');
 const snapshot=()=>a.$queryRaw`SELECT * FROM "CloudDevice" ORDER BY "id"`;
 const controlBefore=(await snapshot()).find(r=>r.companyId===control.companyId);
 const pairInput=(code,c=configured)=>({code,expectedCompanyId:scope.companyId,expectedStoreId:scope.storeId,terminalPos:scope.terminalPos,settingsHash:c.settingsHash});let token;
 await subtest('cross-tenant and changed package pairing refuse without consuming code; signing failure rolls back',async()=>{
  const pair=await service.createPairing(scope,'fixture-admin'),before=await snapshot();
  await assert.rejects(service.pair({...pairInput(pair.code),expectedStoreId:'store-B'}),e=>e.status===409);
  await assert.rejects(service.pair({...pairInput(pair.code),settingsHash:'f'.repeat(64)}),e=>e.status===409);
  await assert.rejects(make(a,()=> '').pair(pairInput(pair.code)),e=>e.status===503);
  assert.deepEqual(await snapshot(),before);const rows=await a.$queryRaw`SELECT "usedAt" FROM "CloudPairingCode"`;assert.ok(rows.every(r=>r.usedAt===null));
 });
 await subtest('two real clients race the same one-use pairing; exactly one committed token is valid',async()=>{
  const pair=await service.createPairing(scope,'fixture-admin');const results=await Promise.allSettled([service.pair(pairInput(pair.code)),other.pair(pairInput(pair.code))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);token=results.find(r=>r.status==='fulfilled').value.token;assert.equal((await service.ping(token)).storeId,scope.storeId);
 });
 await subtest('durable report replay after lost response remains idempotent after freshness window; altered body refuses',async()=>{
  const body={requestId:'a'.repeat(32),checkedAt:now.toISOString(),ok:true,code:0,serialNumber:input.serialNumber,deviceTime:'fixture clock',fiscalExecution:false};
  assert.equal((await service.report(token,body)).idempotentReplay,false);const before=await a.$queryRaw`SELECT * FROM "CloudAudit" ORDER BY "id"`;now=new Date(now.getTime()+600000);
  assert.equal((await other.report(token,body)).idempotentReplay,true);assert.deepEqual(await a.$queryRaw`SELECT * FROM "CloudAudit" ORDER BY "id"`,before);
  await assert.rejects(service.report(token,{...body,deviceTime:'changed'}),e=>e.status===409);
  await assert.rejects(service.report(token,{...body,requestId:'b'.repeat(32)}),e=>e.status===409);
 });
 await subtest('real license, lifecycle, route and changed configuration revoke access and preserve foreign control',async()=>{
  await b.$executeRaw`UPDATE "CompanyModule" SET "active"=false WHERE "id"='module-A'`;await assert.rejects(service.ping(token),e=>e.status===403);await b.$executeRaw`UPDATE "CompanyModule" SET "active"=true WHERE "id"='module-A'`;
  await b.$executeRaw`UPDATE "StoreLifecycleFence" SET "maintenance"=true WHERE "storeId"='store-A'`;await assert.rejects(service.ping(token),e=>e.status===409);await b.$executeRaw`UPDATE "StoreLifecycleFence" SET "maintenance"=false,"generation"=1 WHERE "storeId"='store-A'`;await assert.rejects(service.ping(token),e=>e.status===409);
  const fresh=await service.configure(scope,input,'fixture-admin');assert.notEqual(fresh.settingsHash,configured.settingsHash);await assert.rejects(service.ping(token),e=>e.status===401);
  const pair=await service.createPairing(scope,'fixture-admin'),paired=await service.pair(pairInput(pair.code,fresh));
  await b.$executeRaw`UPDATE "StoreFiscalDevice" SET "deviceCode"='REPLACED' WHERE "storeId"='store-A'`;await assert.rejects(service.ping(paired.token),e=>e.status===409);
  assert.deepEqual((await snapshot()).find(r=>r.companyId===control.companyId),controlBefore);
 });
 await subtest('cash requires fresh paired STATUS and current license; pending request blocks configuration and revoked dispatch',async()=>{
  now=new Date();await a.$executeRaw`UPDATE "StoreFiscalDevice" SET "deviceCode"='FISCAL-A' WHERE "storeId"='store-A'`;
  const c=await service.configure(scope,{...input,cashEnabled:true,cashDepartments:[{department:4,vatRate:13,vatCode:'2'}]},'fixture-admin');
  const pair=await service.createPairing(scope,'fixture-admin'),paired=await service.pair(pairInput(pair.code,c));
  await assert.rejects(a.$transaction(tx=>service.cashContext(tx,scope)),e=>e.status===409);
  await service.report(paired.token,{requestId:'c'.repeat(32),checkedAt:now.toISOString(),ok:true,code:0,serialNumber:input.serialNumber,deviceTime:'fixture clock',fiscalExecution:false});
  await service.ping(paired.token,{readinessVersion:1});
  await b.$executeRaw`UPDATE "CloudDevice" SET "metadata"=jsonb_set(jsonb_set("metadata",'{ftextLastStatus,checkedAt}','"2000-01-01T00:00:00Z"'::jsonb),'{ftextLastStatus,receivedAt}','"2000-01-01T00:00:00Z"'::jsonb) WHERE "storeId"='store-A'`;
  await service.ping(paired.token); // An old heartbeat must not downgrade the readiness requirement.
  assert.equal((await service.view(scope)).readinessRequired,true);assert.equal((await service.view(scope)).registerReady,false);
  await assert.rejects(a.$transaction(tx=>service.cashContext(tx,scope)),e=>e.status===503&&e.code==='FTEXT_REGISTER_NOT_READY');
  assert.equal((await a.$queryRaw`SELECT * FROM "FtextCashRequest"`).length,0,'Stale STATUS creates no request or fiscal instruction');
  await a.$transaction(tx=>service.cashContext(tx,scope,{requireOnline:false})); // Existing receipt recovery remains available.
  await service.report(paired.token,{requestId:'d'.repeat(32),checkedAt:now.toISOString(),ok:true,code:0,serialNumber:input.serialNumber,deviceTime:'fresh readiness',fiscalExecution:false});
  assert.equal((await service.view(scope)).registerReady,true);
  let pending;await a.$transaction(async tx=>{const current=await service.cashContext(tx,scope);pending=await prepareFtextCashRequest(tx,{...current,sessionId:'fixture-shift',clientTransactionId:'fixture-checkout',requestHash:'fixture-hash',checkout:{paymentMethod:'CASH'},items:[{productId:'product-a',name:'SYNTHETIC',quantity:1,effectiveUnitPrice:1.25,discount:0,lineTotal:1.25,fiscalDepartment:4,vatRate:13,fiscalVatCode:'2'}],summary:{subtotal:1.25,discount:0,total:1.25}})});
  await b.$executeRaw`UPDATE "CloudDevice" SET "metadata"=jsonb_set(jsonb_set("metadata",'{ftextLastStatus,checkedAt}','"2000-01-01T00:00:00Z"'::jsonb),'{ftextLastStatus,receivedAt}','"2000-01-01T00:00:00Z"'::jsonb) WHERE "storeId"='store-A'`;
  assert.equal(await service.authenticated(paired.token,(tx,d,c)=>claimFtextCashRequest(tx,d,c)),null);
  assert.equal((await a.$queryRaw`SELECT "status" FROM "FtextCashRequest" WHERE "id"=${pending.id}`)[0].status,'PREPARED','Readiness expiry must not dispatch a prepared payment');
  await service.report(paired.token,{requestId:'e'.repeat(32),checkedAt:now.toISOString(),ok:true,code:0,serialNumber:input.serialNumber,deviceTime:'fresh dispatch readiness',fiscalExecution:false});
  await assert.rejects(service.configure(scope,{...input,cashEnabled:false},'fixture-admin'),e=>e.status===409);
  await b.$executeRaw`UPDATE "CompanyModule" SET "active"=false WHERE "id"='module-A'`;
  await assert.rejects(service.authenticated(paired.token,(tx,d,c)=>claimFtextCashRequest(tx,d,c)),e=>e.status===403);
  assert.equal((await a.$queryRaw`SELECT "status" FROM "FtextCashRequest" WHERE "id"=${pending.id}`)[0].status,'PREPARED');
  await b.$executeRaw`UPDATE "CompanyModule" SET "active"=true WHERE "id"='module-A'`;
  await b.$executeRaw`UPDATE "StoreLifecycleFence" SET "generation"=2 WHERE "storeId"='store-A'`;
  await assert.rejects(service.authenticated(paired.token,(tx,d,c)=>claimFtextCashRequest(tx,d,c)),e=>e.status===409);
  assert.equal((await a.$queryRaw`SELECT "status" FROM "FtextCashRequest" WHERE "id"=${pending.id}`)[0].status,'PREPARED');
  await b.$executeRaw`UPDATE "StoreLifecycleFence" SET "generation"=1 WHERE "storeId"='store-A'`;
  const combined=(svc,recovering=false)=>svc.ping(paired.token,{readinessVersion:1},(tx,d,c)=>pollFtextDeviceWork(tx,d,c,{recovering}));
  // Real heartbeat+claim transaction: old heartbeat may be renewed but old STATUS
  // cannot; a durable local result must prevent any new dispatch.
  const beforeRecovery=await a.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${pending.id}`;
  assert.deepEqual(await combined(service,true).then(({request,lateReceipt,errorEvidence})=>({request,lateReceipt,errorEvidence})),{request:null,lateReceipt:null,errorEvidence:null});
  assert.deepEqual(await a.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${pending.id}`,beforeRecovery);
  await b.$executeRaw`UPDATE "CloudDevice" SET "metadata"=jsonb_set(jsonb_set("metadata",'{ftextLastStatus,checkedAt}','"2000-01-01T00:00:00Z"'::jsonb),'{ftextLastStatus,receivedAt}','"2000-01-01T00:00:00Z"'::jsonb) WHERE "storeId"='store-A'`;
  assert.equal((await combined(service)).request,null);assert.equal((await a.$queryRaw`SELECT "status" FROM "FtextCashRequest" WHERE "id"=${pending.id}`)[0].status,'PREPARED');
  await service.report(paired.token,{requestId:'f'.repeat(32),checkedAt:new Date(now.getTime()+1).toISOString(),ok:true,code:0,serialNumber:input.serialNumber,deviceTime:'combined poll readiness',fiscalExecution:false});
  const beforeControl=(await snapshot()).find(r=>r.companyId===control.companyId);
  const combinedClaims=await Promise.all([combined(service),combined(other)]);
  assert.equal(combinedClaims.filter(w=>w.request).length,1);assert.equal(combinedClaims.find(w=>w.request).request.id,pending.id);
  assert.ok(combinedClaims.every(w=>w.settingsHash===c.settingsHash&&w.readinessRequired===true));
  assert.equal((await combined(service)).request,null,'Lost combined response cannot renew a one-shot dispatch');
  assert.deepEqual((await snapshot()).find(r=>r.companyId===control.companyId),beforeControl);
  await b.$executeRaw`UPDATE "CompanyModule" SET "active"=false WHERE "id"='module-A'`;await assert.rejects(combined(service),e=>e.status===403);
  await b.$executeRaw`UPDATE "CompanyModule" SET "active"=true WHERE "id"='module-A'`;
  await b.$executeRaw`UPDATE "StoreLifecycleFence" SET "generation"=2 WHERE "storeId"='store-A'`;await assert.rejects(combined(service),e=>e.status===409);
 });

}
test('native ftext installation: tenant/atomic pairing/rollback/real license/lifecycle/replay/control',{skip:!isolated(),timeout:120000},async t=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='ftext_install_'+randomBytes(12).toString('hex'),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const a=new PrismaClient({datasourceUrl:url.toString()}),b=new PrismaClient({datasourceUrl:url.toString()});let created=false;
 try{await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;await runFtextRegression(a,b,{subtest:(n,f)=>t.test(n,f)})}finally{await Promise.all([a.$disconnect(),b.$disconnect()]);try{if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`)}finally{await admin.$disconnect()}}
});
