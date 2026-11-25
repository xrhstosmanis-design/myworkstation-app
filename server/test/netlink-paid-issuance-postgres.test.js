import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};

test('native paid issuance SQL/HTTP: mixed basket, encryption, receipt gate, once-only dispatch and scoped recovery',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='netlink_paid_'+randomUUID().replaceAll('-','');
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 const oldKey=process.env.INTEGRATION_CREDENTIALS_KEY,oldEnabled=process.env.NETLINK_ENABLE_EXECUTE;
 process.env.INTEGRATION_CREDENTIALS_KEY='synthetic-paid-issuance-test-key';process.env.NETLINK_ENABLE_EXECUTE='true';
 let server;let calls=0;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "Product"("id" text PRIMARY KEY,"companyId" text,"name" text,"sku" text,"vatRate" numeric,"trackStock" boolean,"salePrice" numeric,"active" boolean)',
   'CREATE TABLE "StoreProduct"("productId" text,"storeId" text,"salePrice" numeric,"active" boolean)',
   'CREATE TABLE "Sale"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"clientTransactionId" text,"status" text,"fiscalStatus" text,"total" numeric,"discount" numeric DEFAULT 0,"occurredAt" timestamp DEFAULT now())',
   'CREATE TABLE "SaleLine"("id" text PRIMARY KEY,"saleId" text,"productId" text,"quantity" numeric,"unitPrice" numeric,"discount" numeric DEFAULT 0,"lineTotal" numeric)',
   'CREATE TABLE "Payment"("saleId" text,"method" text,"amount" numeric)',
   'CREATE TABLE "RbsCapDriverV1Request"("companyId" text,"storeId" text,"saleId" text,"clientTransactionId" text,"status" text,"paymentMethod" text,"operatorOutcome" text,"checkoutJson" jsonb)',
   'CREATE TABLE "FiscalDocument"("id" text,"saleId" text,"status" text,"fiscalNumber" text,"issuedAt" timestamp)',
   'CREATE TABLE "StoreOperatorAudit"("id" text,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb)'
  ])await db.$executeRawUnsafe(sql);
  for(const name of ['20260825130500_netlink_prepaid_storage','20260826210000_netlink_fiscal_receipt_gate','20261125130000_netlink_paid_issuance','20261125154500_netlink_numeric_request_id']){const sql=await readFile(new URL(`../prisma/migrations/${name}/migration.sql`,import.meta.url),'utf8');for(const statement of sql.replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean))await db.$executeRawUnsafe(statement)}
  const {ensureNetlinkPaidIssuanceSchema}=await import('../src/integrations/netlink/paid-issuance-schema.js');
  await ensureNetlinkPaidIssuanceSchema(db);await ensureNetlinkPaidIssuanceSchema(db);
  await db.$executeRaw`INSERT INTO "Product" VALUES('value','company','Card accounting','VALUE',0,false,0,true),('fee','company','Service accounting','FEE',24,false,.5,true)`;
  await db.$executeRaw`INSERT INTO "StoreProduct" VALUES('value','store',0,true),('fee','store',.5,true)`;
  await db.$executeRaw`INSERT INTO "NetlinkStoreConfig"("storeId","companyId","saleProductId","serviceFeeProductId") VALUES('store','company','value','fee')`;
  const provider=()=>({menu:async()=>({groups:[{products:[{productId:'card10',title:'Synthetic card 10€',flow:'execute'}]}]}),execute:async(productId,body)=>{calls++;await new Promise(resolve=>setTimeout(resolve,25));return {data:{requestId:body.requestId,transactionId:'synthetic-tx-'+body.requestId,amount:10,lines:['PRIVATE-SYNTHETIC-PIN']}}}});
  const express=(await import('express')).default,{createPaidNetlinkRouter}=await import('../src/routes/netlink-paid-issuance.js');
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={id:req.headers['x-test-user']||'operator',role:'EMPLOYEE',companyId:'company'};next()});
  app.use(createPaidNetlinkRouter({db,provider,storeFor:async(req,id)=>{if(id!=='store')throw Object.assign(Error('scope'),{status:403})}}));
  app.use((error,req,res,next)=>res.status(error.status||(error.name==='ZodError'?400:500)).json({error:error.message,code:error.code}));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=async(path,body,user='operator',method='POST')=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json','x-test-user':user},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,cache:r.headers.get('cache-control'),body:await r.json()}};
  const checkoutId=randomUUID(),ids=[randomUUID(),randomUUID()];
  const cards=[];for(const requestId of ids){const r=await request('/issuance-intents',{storeId:'store',requestId,checkoutId,productId:'card10'});assert.equal(r.status,201);assert.equal(r.body.items.length,2);cards.push(r.body)}
  const snapshot=cards.flatMap(c=>c.items.map(i=>({productId:i.id,overrideReason:i.overrideReason}))).concat([{productId:'goods',quantity:2}]);
  assert.equal((await request(`/issuance-intents/${ids[0]}/issue`,{storeId:'store'})).status,409);assert.equal(calls,0);
  assert.equal((await request(`/issuance-checkouts/${checkoutId}/cash-received`,{storeId:'store',received:true,amount:27,requestIds:ids})).status,200);
  await db.$executeRaw`INSERT INTO "Sale"("id","companyId","storeId","clientTransactionId","status","fiscalStatus","total") VALUES('paid-sale','company','store',${checkoutId},'COMPLETED','ISSUED',27)`;
  await db.$executeRaw`INSERT INTO "SaleLine" VALUES('v','paid-sale','value',2,10,0,20),('f','paid-sale','fee',2,.5,0,1),('g','paid-sale','goods',2,3,0,6)`;
  await db.$executeRaw`INSERT INTO "Payment" VALUES('paid-sale','CASH',27)`;
  await db.$executeRaw`INSERT INTO "RbsCapDriverV1Request" VALUES('company','store','paid-sale',${checkoutId},'SALE_COMMITTED','CASH',NULL,${JSON.stringify({items:snapshot})}::jsonb)`;
  // A native command being committed is insufficient without actual fiscal proof.
  assert.equal((await request(`/issuance-intents/${ids[0]}/issue`,{storeId:'store'})).body.code,'NETLINK_FISCAL_RECEIPT_REQUIRED');assert.equal(calls,0);
  await db.$executeRaw`INSERT INTO "FiscalDocument" VALUES('fiscal','paid-sale','ISSUED','SYNTHETIC/1/42',NOW())`;
  assert.equal((await request(`/issuance-intents/${ids[0]}/issue`,{storeId:'store'},'other-operator')).status,403);
  const concurrent=await Promise.all([request(`/issuance-intents/${ids[0]}/issue`,{storeId:'store'}),request(`/issuance-intents/${ids[0]}/issue`,{storeId:'store'})]);
  assert.ok(concurrent.some(r=>r.body.status==='COMPLETED'));assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(concurrent),/PRIVATE-SYNTHETIC-PIN/);
  assert.equal((await request(`/issuance-intents/${ids[1]}/issue`,{storeId:'store'})).body.status,'COMPLETED');assert.equal(calls,2);
  const replay=await request(`/issuance-intents/${ids[0]}/issue`,{storeId:'store'});assert.equal(replay.body.idempotentReplay,true);assert.equal(calls,2);
  const printed=await request(`/issuance-intents/${ids[0]}/receipt`,{storeId:'store'});assert.equal(printed.status,200);assert.equal(printed.cache,'no-store');assert.deepEqual(printed.body.lines,['PRIVATE-SYNTHETIC-PIN']);assert.equal(calls,2);
  assert.equal((await request(`/issuance-intents/${ids[0]}/receipt`,{storeId:'store'},'other-operator')).status,403);
  assert.equal((await request(`/issuance-intents/${ids[0]}/receipt`,{storeId:'other'})).status,403);
  const listed=await request('/issuance-intents?storeId=store',null,'operator','GET');assert.equal(listed.body.items.length,2);assert.equal(new Set(listed.body.items.map(row=>row.providerRequestId)).size,2);assert.ok(listed.body.items.every(row=>/^[1-9][0-9]{0,9}$/.test(row.providerRequestId)&&Number(row.providerRequestId)<=2147483647));assert.doesNotMatch(JSON.stringify(listed),/PRIVATE-SYNTHETIC-PIN|issuanceIntentEnc|issuanceResultEnc/);
  const rows=await db.$queryRaw`SELECT "issuanceIntentEnc","issuanceResultEnc" FROM "NetlinkTransaction"`;assert.equal(rows.length,2);assert.doesNotMatch(JSON.stringify(rows),/PRIVATE-SYNTHETIC-PIN/);
  const audit=await db.$queryRaw`SELECT * FROM "StoreOperatorAudit"`;assert.equal(audit.length,1);assert.doesNotMatch(JSON.stringify(audit),/PRIVATE-SYNTHETIC-PIN/);
  assert.equal((await request('/issuance-intents',{storeId:'store',requestId:randomUUID(),checkoutId,productId:'card10'})).body.code,'NETLINK_SALE_ALREADY_EXISTS');
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();
  oldKey===undefined?delete process.env.INTEGRATION_CREDENTIALS_KEY:process.env.INTEGRATION_CREDENTIALS_KEY=oldKey;oldEnabled===undefined?delete process.env.NETLINK_ENABLE_EXECUTE:process.env.NETLINK_ENABLE_EXECUTE=oldEnabled;
 }
});
