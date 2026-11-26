import {cp1253Bytes} from '../src/rbs-capdriver-v1.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['127.0.0.1','localhost','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native RBS readiness → real cash/card finalizers → SQL/HTTP once-only Netlink issuance',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),name='netlink_rbs_test_'+randomUUID().replaceAll('-','');
 const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;url.searchParams.delete('schema');
 let db,server;const key=process.env.INTEGRATION_CREDENTIALS_KEY,enabled=process.env.NETLINK_ENABLE_EXECUTE,recoveryEnabled=process.env.NETLINK_ENABLE_PAID_RECOVERY;
 try{
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);db=new PrismaClient({datasourceUrl:url.toString()});
  process.env.INTEGRATION_CREDENTIALS_KEY='synthetic-rbs-key';process.env.NETLINK_ENABLE_EXECUTE='true';
  await db.$executeRawUnsafe(`CREATE TABLE "Company"("id" text PRIMARY KEY,"active" boolean)`);
  await db.$executeRawUnsafe(`CREATE TABLE "Store"("id" text PRIMARY KEY,"companyId" text,"active" boolean)`);
  await db.$executeRawUnsafe(`CREATE TABLE "CashShiftSession"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"terminalPos" text,"status" text,"openedAt" timestamptz,"openedBy" text)`);
  await db.$executeRawUnsafe(`CREATE TABLE "RbsCapDriverV1Request"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"terminalPos" text,"clientTransactionId" text,"paymentMethod" text,"total" numeric,"status" text,"saleId" text,"operatorOutcome" text,"operatorId" text,"createdAt" timestamptz,"updatedAt" timestamptz,"checkoutJson" jsonb,"requestHash" text DEFAULT 'hash',"claimedByDeviceId" text,"claimedAt" timestamptz,"dispatchedAt" timestamptz,"commandText" text,"commandHash" text)`);
  await db.$executeRawUnsafe(`CREATE TABLE "Sale"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"clientTransactionId" text UNIQUE,"status" text,"fiscalStatus" text,"customerId" text,"operatorEmployeeId" text,"subtotal" numeric,"discount" numeric,"total" numeric,"source" text,"saleFingerprint" text,"duplicateConfirmed" boolean,"transactionMode" text,"operationChannel" text,"audience" text,"occurredAt" timestamptz DEFAULT NOW())`);
  for(const sql of [
   `CREATE TABLE "SaleLine"("id" text PRIMARY KEY,"saleId" text,"productId" text,"description" text,"quantity" numeric,"unitPrice" numeric,"discount" numeric,"vatRate" numeric,"lineTotal" numeric,"promotionId" text,"promotionType" text,"scannedBarcode" text)`,
   `CREATE TABLE "Payment"("id" text PRIMARY KEY,"saleId" text,"method" text,"amount" numeric)`,
   `CREATE TABLE "StoreTransaction"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric,"description" text,"actorId" text,"actorName" text)`,
   `CREATE TABLE "Product"("id" text PRIMARY KEY,"companyId" text,"active" boolean,"trackStock" boolean)`,
   `CREATE TABLE "StoreProduct"("storeId" text,"productId" text,"active" boolean,"currentStock" numeric,"updatedAt" timestamptz,PRIMARY KEY("storeId","productId"))`,
   `CREATE TABLE "StoreBakingPolicy"("companyId" text,"storeId" text,"productId" text,"mode" text,"sourceProductId" text)`,
   `CREATE TABLE "PreparationRecipeLine"("companyId" text,"productId" text,"automatic" boolean)`,
   `CREATE TABLE "StockMovement"("id" text PRIMARY KEY,"storeId" text,"productId" text,"movementType" text,"quantity" numeric,"unitCost" numeric,"sourceType" text,"sourceId" text,"note" text,"createdByUserId" text,"idempotencyKey" text)`,
   `CREATE UNIQUE INDEX movement_key ON "StockMovement"("storeId","idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRawUnsafe(`ALTER TABLE "Company" ADD COLUMN "name" text, ADD COLUMN "licenseStatus" text, ADD COLUMN "subscriptionEndsAt" timestamptz`);
  await db.$executeRawUnsafe(`CREATE TABLE "CompanyModule"("id" text,"companyId" text,"moduleKey" text,"active" boolean,"startsAt" timestamptz,"endsAt" timestamptz)`);
  await db.$executeRawUnsafe(`INSERT INTO "Company"("id","active","name","licenseStatus") VALUES('company',true,'Synthetic','ACTIVE')`);
  await db.$executeRawUnsafe(`INSERT INTO "Store" VALUES('store','company',true)`);
  await db.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN "name" text,ADD COLUMN "sku" text,ADD COLUMN "vatRate" numeric,ADD COLUMN "salePrice" numeric`);
  await db.$executeRawUnsafe(`ALTER TABLE "StoreProduct" ADD COLUMN "salePrice" numeric`);
  for(const sql of [
   `CREATE TABLE "CloudDevice"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"platform" text,"status" text,"revokedAt" timestamptz,"metadata" jsonb,"lastSeenAt" timestamptz,"deviceKey" text)`,
   `CREATE TABLE "StoreFiscalDevice"("companyId" text,"storeId" text,"terminalPos" text,"deviceCode" text,"active" boolean)`,
   `CREATE TABLE "StoreInstallationTerminal"("companyId" text,"storeId" text,"terminalPos" text,"active" boolean)`
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRawUnsafe(`INSERT INTO "CloudDevice" VALUES('writer','company','store','WINDOWS_RBS_CAPDRIVER_V1','ACTIVE',NULL,'{"rbsCapDriverV1WriterPoll":true,"rbsCapDriverV1TerminalPos":"POS1"}',NOW(),'rbs')`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreFiscalDevice" VALUES('company','store','POS1','FISCAL1',true)`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreInstallationTerminal" VALUES('company','store','POS1',true)`);
  await db.$executeRawUnsafe(`INSERT INTO "CashShiftSession" VALUES('shift','company','store','POS1','OPEN',NOW(),'operator')`);
  await db.$executeRawUnsafe(`INSERT INTO "Product" VALUES('value','company',true,false,'Card','VALUE',0,0),('fee','company',true,false,'Fee','FEE',24,.5),('goods','company',true,true,'Goods','GOODS',13,2)`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreProduct" VALUES('store','value',true,0,NOW(),0),('store','fee',true,0,NOW(),.5),('store','goods',true,10,NOW(),2)`);
  for(const migration of ['20260825130500_netlink_prepaid_storage','20260826210000_netlink_fiscal_receipt_gate','20261125130000_netlink_paid_issuance','20261125154500_netlink_numeric_request_id']){
   const sql=await readFile(new URL(`../prisma/migrations/${migration}/migration.sql`,import.meta.url),'utf8');for(const statement of sql.replace(/--[^\n]*/g,'').split(';').map(x=>x.trim()).filter(Boolean))await db.$executeRawUnsafe(statement);
  }
  const {ensureNetlinkPaidIssuanceSchema}=await import('../src/integrations/netlink/paid-issuance-schema.js');await ensureNetlinkPaidIssuanceSchema(db);
  await db.$executeRawUnsafe(`INSERT INTO "NetlinkStoreConfig"("storeId","companyId","saleProductId","serviceFeeProductId") VALUES('store','company','value','fee')`);
  await db.$executeRawUnsafe(`CREATE TABLE "StoreIntegrationCredential"("companyId" text,"storeId" text,"kind" text,"accountHint" text,"enabled" boolean,"updatedAt" timestamptz DEFAULT NOW())`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreIntegrationCredential"("companyId","storeId","kind","accountHint","enabled") VALUES('company','store','NETLINK','12345',true)`);
  const {prepareNetlinkPaidCheckout}=await import('../src/integrations/netlink/paid-checkout-readiness.js');
  const {finalizeDispatchedCashRequest,finalizeConfirmedCardRequest}=await import('../src/rbs-capdriver-v1-sale-finalize.js');
  const {createPaidNetlinkRouter}=await import('../src/routes/netlink-paid-issuance.js'),express=(await import('express')).default;
  let calls=0,failNext=false;
  const provider=()=>({menu:async()=>({groups:[{products:[{productId:'synthetic5',title:'Synthetic card 5€',flow:'execute'}]}]}),execute:async(id,body)=>{calls++;if(failNext){failNext=false;throw Error('SYNTHETIC NONEXECUTION');}return {data:{requestId:body.requestId,transactionId:'synthetic-'+body.requestId,amount:5,lines:['SYNTHETIC-PIN']}}}});
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={id:'operator',companyId:'company',role:'EMPLOYEE',tokenType:'STORE_OPERATOR',storeId:'store',terminalPos:req.headers['x-test-terminal']||'POS1'};next()});
  app.use(createPaidNetlinkRouter({db,provider,prepareCheckout:prepareNetlinkPaidCheckout,storeFor:async(req,id)=>{if(id!=='store')throw Object.assign(Error('scope'),{status:403})}}));app.use((e,req,res,next)=>res.status(e.status||500).json({code:e.code,error:e.message}));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const post=async(path,body,terminal='POS1')=>{const r=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'POST',headers:{'Content-Type':'application/json','x-test-terminal':terminal},body:JSON.stringify(body)});return {status:r.status,body:await r.json()}};
  const first=randomUUID(),checkoutId=randomUUID();
  assert.equal((await post('/issuance-intents',{storeId:'store',requestId:first,checkoutId,productId:'synthetic5'},'POS2')).body.code,'NETLINK_RECEIPT_CAPABILITY_REQUIRED');
  await db.$executeRawUnsafe(`UPDATE "CloudDevice" SET "lastSeenAt"=NOW()-INTERVAL '1 hour'`);
  assert.equal((await post('/issuance-intents',{storeId:'store',requestId:first,checkoutId,productId:'synthetic5'})).body.code,'NETLINK_RECEIPT_CAPABILITY_REQUIRED');
  for(const method of ['CASH','CARD']){
   await db.$executeRawUnsafe(`UPDATE "CloudDevice" SET "lastSeenAt"=NOW()`);
   const checkout=method==='CASH'?checkoutId:randomUUID(),ids=[method==='CASH'?first:randomUUID(),randomUUID()],cards=[];
   for(const requestId of ids){const r=await post('/issuance-intents',{storeId:'store',requestId,checkoutId:checkout,productId:'synthetic5'});assert.equal(r.status,201,JSON.stringify(r.body));cards.push(r.body);}
   const items=cards.flatMap(c=>c.items.map(i=>({productId:i.id,quantity:1,unitPrice:i.unitPrice??i.salePrice,overrideReason:i.overrideReason}))).concat([{productId:'goods',quantity:1,unitPrice:2}]);
   const resolvedItems=[{productId:'value',quantity:2,unitPrice:5,lineTotal:10},{productId:'fee',quantity:2,unitPrice:.5,lineTotal:1},{productId:'goods',quantity:1,unitPrice:2,lineTotal:2}];
   if(method==='CASH')assert.equal((await post(`/issuance-checkouts/${checkout}/cash-received`,{storeId:'store',received:true,amount:13,requestIds:ids})).status,200);
   const requestId=randomUUID(),command='ΣΥΝΘΕΤΙΚΟ-'+requestId,commandHash=createHash('sha256').update(cp1253Bytes(command+"\r\n")).digest('hex'),json={lifecycleGeneration:'0',actorId:'operator',items,resolvedItems,baseSummary:{subtotal:13,total:13,discount:0}};
   await db.$executeRaw`INSERT INTO "RbsCapDriverV1Request"("id","companyId","storeId","terminalPos","clientTransactionId","paymentMethod","total","status","checkoutJson","requestHash","claimedByDeviceId","claimedAt","dispatchedAt","commandText","commandHash") VALUES(${requestId},'company','store','POS1',${checkout},${method},13,'DISPATCHED',${JSON.stringify(json)}::jsonb,${'hash-'+checkout},'writer',NOW(),NOW(),${command},${commandHash})`;
   assert.equal((await post(`/issuance-intents/${ids[0]}/issue`,{storeId:'store'})).status,409);assert.equal(calls,method==='CASH'?0:2);
   if(method==='CARD'){
    assert.equal((await finalizeConfirmedCardRequest(requestId,{db})).skipped,true);
    await db.$executeRaw`UPDATE "RbsCapDriverV1Request" SET "status"='OPERATOR_CONFIRMED',"operatorOutcome"='YES',"operatorId"='operator' WHERE "id"=${requestId}`;
   }
   const finalizer=method==='CASH'?finalizeDispatchedCashRequest:finalizeConfirmedCardRequest;
   const committed=await finalizer(requestId,{db});assert.ok(committed.saleId);
   const audit=(await db.$queryRaw`SELECT "details" FROM "StoreOperatorAudit" WHERE "details"->>'saleId'=${committed.saleId}`)[0];assert.deepEqual(audit.details.netlinkIntents,ids);assert.ok(audit.details.netlinkManifestHash);
   // Audit corruption must stop the provider even with a native committed sale.
   await db.$executeRaw`UPDATE "StoreOperatorAudit" SET "details"="details"-'netlinkManifestHash' WHERE "details"->>'saleId'=${committed.saleId}`;
   assert.equal((await post(`/issuance-intents/${ids[0]}/issue`,{storeId:'store'})).body.code,'NETLINK_RBS_COMPLETION_REQUIRED');
   await db.$executeRaw`UPDATE "StoreOperatorAudit" SET "details"=${JSON.stringify(audit.details)}::jsonb WHERE "details"->>'saleId'=${committed.saleId}`;
   assert.equal((await post(`/issuance-intents/${ids[0]}/issue`,{storeId:'store'},'POS2')).body.code,'NETLINK_CHECKOUT_TERMINAL');
   const issued=await Promise.all([post(`/issuance-intents/${ids[0]}/issue`,{storeId:'store'}),post(`/issuance-intents/${ids[0]}/issue`,{storeId:'store'})]);assert.ok(issued.some(r=>r.body.status==='COMPLETED'),JSON.stringify(issued));
   if(method==='CASH')assert.equal((await post(`/issuance-intents/${ids[1]}/issue`,{storeId:'store'})).body.status,'COMPLETED');
   else{
    failNext=true;assert.equal((await post(`/issuance-intents/${ids[1]}/issue`,{storeId:'store'})).body.status,'UNKNOWN');
    assert.equal((await post(`/issuance-intents/${ids[1]}/issue`,{storeId:'store'})).body.status,'UNKNOWN');assert.equal(calls,4);
    const row=(await db.$queryRaw`SELECT * FROM "NetlinkTransaction" WHERE "requestId"=${ids[1]}`)[0];
    const {createNetlinkPaidRecovery}=await import('../src/integrations/netlink/paid-recovery.js');const recovery=createNetlinkPaidRecovery({db,provider});
    await recovery.authorize({companyId:'company',storeId:'store'},ids[1],{actorId:'manager',providerReference:'SYNTHETIC CONFIRMED NOT EXECUTED',confirmedAt:new Date().toISOString(),expectedUpdatedAt:row.updatedAt.toISOString(),expectedStationId:'12345'});
    process.env.NETLINK_ENABLE_PAID_RECOVERY='true';
    const recovered=await post(`/issuance-intents/${ids[1]}/recover-paid`,{storeId:'store',fulfillExistingPaidPurchase:true});assert.equal(recovered.body.status,'COMPLETED',JSON.stringify(recovered));
    assert.equal((await post(`/issuance-intents/${ids[1]}/recover-paid`,{storeId:'store',fulfillExistingPaidPurchase:true})).body.status,'COMPLETED');
   }
   assert.equal(calls,method==='CASH'?2:5);
   const rows=await db.$queryRaw`SELECT "fiscalNumber","fiscalEvidence" FROM "NetlinkTransaction" WHERE "checkoutId"=${checkout}`;assert.ok(rows.every(r=>r.fiscalNumber===null&&r.fiscalEvidence.type==='RBS_NATIVE_COMMIT'));
   const delivery=await post(`/issuance-intents/${ids[0]}/receipt`,{storeId:'store'});assert.equal(delivery.status,200);assert.equal((await post(`/issuance-intents/${ids[0]}/receipt`,{storeId:'store'})).status,403);assert.equal((await finalizer(requestId,{db})).skipped,true);
  }
  assert.equal((await db.$queryRawUnsafe(`SELECT COUNT(*)::int n FROM "Sale"`))[0].n,2);
  assert.equal((await db.$queryRawUnsafe(`SELECT COUNT(*)::int n FROM "Payment"`))[0].n,2);
  assert.equal(Number((await db.$queryRawUnsafe(`SELECT "currentStock" FROM "StoreProduct" WHERE "productId"='goods'`))[0].currentStock),8);
  assert.equal(Number((await db.$queryRawUnsafe(`SELECT "currentStock" FROM "StoreProduct" WHERE "productId"='fee'`))[0].currentStock),0);
 }finally{
  if(server)await new Promise(r=>server.close(r));if(db)await db.$disconnect();await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);await admin.$disconnect();
  key===undefined?delete process.env.INTEGRATION_CREDENTIALS_KEY:process.env.INTEGRATION_CREDENTIALS_KEY=key;enabled===undefined?delete process.env.NETLINK_ENABLE_EXECUTE:process.env.NETLINK_ENABLE_EXECUTE=enabled;recoveryEnabled===undefined?delete process.env.NETLINK_ENABLE_PAID_RECOVERY:process.env.NETLINK_ENABLE_PAID_RECOVERY=recoveryEnabled;
 }
});
