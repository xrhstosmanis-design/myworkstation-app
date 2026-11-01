import {createInvoiceCostScope} from '../src/services/ai-customer-cost-runtime.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {createAiOwnerWalletRepository} from '../src/services/ai-owner-wallet-repository.js';
import {createCustomerCostMeter} from '../src/services/ai-customer-cost-meter.js';
import {walletActivityFromRequest} from '../src/services/ai-wallet-activity.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname);}catch{return false;}};
test('native customer cost HTTP/PG: real scope/session denial, concurrent funds, atomic rollback, replay and durable ambiguous hold',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='customer_cost_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});let server,calls=0;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   `CREATE TABLE "Company"("id" text PRIMARY KEY,"name" text,"active" boolean)`,
   `CREATE TABLE "Store"("id" text PRIMARY KEY,"name" text,"companyId" text,"active" boolean)`,
   `CREATE TABLE "User"("id" text PRIMARY KEY,"email" text,"fullName" text,"role" text,"companyId" text)`,
   `CREATE TABLE "OwnerCompanyAccess"("ownerId" text,"companyId" text)`,
   `CREATE TABLE "PurchaseOrder"("id" text PRIMARY KEY,"companyId" text,"storeId" text)`,
   `CREATE TABLE "CostSession"("id" text PRIMARY KEY,"companyId" text,"revoked" boolean)`,
   `CREATE TABLE "BusinessControl"("sales" integer,"cash" integer,"stock" integer)`
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "Company" VALUES ('a','Synthetic A',true),('b','Synthetic B',true)`;
  await db.$executeRaw`INSERT INTO "Store" VALUES ('a-store','A','a',true),('a-closed','Closed','a',false),('b-store','B','b',true)`;
  await db.$executeRaw`INSERT INTO "CostSession" VALUES ('session-a','a',false),('session-b','b',false),('revoked','a',true)`;
  await db.$executeRaw`INSERT INTO "BusinessControl" VALUES (12,20000,31)`;
  await db.$executeRaw`INSERT INTO "PurchaseOrder" VALUES ('order-a','a','a-store'),('order-b','b','b-store'),('closed-order','a','a-closed')`;
  const invoiceScope=createInvoiceCostScope({db,authorizeStore:async(req,storeId)=>{const rows=await db.$queryRaw`SELECT s."id" FROM "Store" s JOIN "Company" c ON c."id"=s."companyId" WHERE s."id"=${storeId} AND s."companyId"=${req.user.companyId} AND s."active" AND c."active"`;if(!rows.length)throw Object.assign(new Error(),{code:'AI_WALLET_SCOPE_DENIED'});return {companyId:req.user.companyId,storeId};}});
  assert.equal((await invoiceScope({user:{companyId:'a'}},{orderId:'order-a'})).storeId,'a-store');
  for(const input of [{orderId:'order-b'},{orderId:'missing'},{orderId:'closed-order'},{orderId:'order-a',storeId:'b-store'}])await assert.rejects(invoiceScope({user:{companyId:'a'}},input),e=>e.code==='AI_WALLET_SCOPE_DENIED');
  const repository=createAiOwnerWalletRepository(db);await repository.ensure();
  for(const company of ['a','b']){await repository.configure(company,{version:0,enabled:true,emailEnabled:false,notificationOwnerId:''},'synthetic-admin');await repository.credit(company,{amountMicros:'1000',receiptReference:'synthetic-cost-funding-'+company},'synthetic-admin');}
  const price={provider:'SERPER_GOOGLE',currency:'EUR',providerUnitCostMicros:'100',basisReference:'Synthetic fixture cost only',validFrom:'2020-01-01T00:00:00.000Z',validUntil:'2099-01-01T00:00:00.000Z'};
  const env={AI_OWNER_WALLET_ENABLED:'true',AI_OWNER_WALLET_EXTERNAL_COST_TARIFFS:JSON.stringify([price])},meter=createCustomerCostMeter({repository,env});
  const app=express();app.use(express.json());app.post('/cost',async(req,res)=>{try{
   const companyId=String(req.body.companyId||''),storeId=String(req.body.storeId||''),scope={companyId,storeId,activity:walletActivityFromRequest({user:{id:'actual-owner',companyId,tokenType:'BACKOFFICE_USER',role:'OWNER'}},{storeId,purpose:'ONLINE_SEARCH'})};
   const verify=async()=>{const rows=await db.$queryRaw`SELECT 1 FROM "CostSession" WHERE "id"=${String(req.headers['x-test-session']||'')} AND "companyId"=${companyId} AND NOT "revoked"`;if(!rows.length)throw Object.assign(new Error(),{code:'AI_WALLET_SESSION_REQUIRED',status:401});};
   const result=await meter.query(scope,'SERPER_GOOGLE',async()=>{calls++;if(req.body.uncertain)throw new Error('reply lost');return {organic:[]};},verify);res.json(result);
  }catch(error){res.status(error.status||409).json({code:error.code});}});
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const request=async(body,session='session-a')=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/cost`,{method:'POST',headers:{'content-type':'application/json','x-test-session':session},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
  const before=(await repository.read('a')).balanceMicros;
  for(const [body,session] of [[{companyId:'a',storeId:'a-store'},'revoked'],[{companyId:'b',storeId:'b-store'},'session-a'],[{companyId:'a',storeId:'b-store'},'session-a'],[{companyId:'a',storeId:'a-closed'},'session-a']])assert.notEqual((await request(body,session)).status,200);
  assert.equal(calls,0);assert.equal((await repository.read('a')).balanceMicros,before);
  env.AI_OWNER_WALLET_EXTERNAL_COST_TARIFFS='[]';assert.equal((await request({companyId:'a',storeId:'a-store'})).body.code,'AI_WALLET_EXTERNAL_TARIFF_REQUIRED');assert.equal(calls,0);env.AI_OWNER_WALLET_EXTERNAL_COST_TARIFFS=JSON.stringify([price]);
  const good=await request({companyId:'a',storeId:'a-store'});assert.equal(good.status,200);assert.equal(calls,1);
  const measured=await repository.read('a');assert.equal(measured.balanceMicros,'850');assert.equal(measured.reservedMicros,'0');const entry=measured.entries.find(e=>e.kind==='USAGE');assert.equal(entry.chargedMicros,'150');assert.equal(entry.activity.actor.id,'actual-owner');assert.equal(entry.feature,'SERPER_GOOGLE');assert.equal((await repository.read('b')).balanceMicros,'1000');
  const saved=(await db.$queryRaw`SELECT * FROM "AiOwnerWalletEntry" WHERE "id"=${entry.id}`)[0];
  assert.equal((await repository.settle('a',entry.id,{amountMicros:150n,usage:saved.usage})).replayed,true);
  await assert.rejects(repository.settle('a',entry.id,{amountMicros:151n,usage:saved.usage}),e=>e.code==='AI_WALLET_SETTLEMENT_CONFLICT');
  // A failed reservation transaction rolls back both entry and hold before IO.
  await db.$executeRawUnsafe(`CREATE FUNCTION reject_cost_hold() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW."reservedMicros">OLD."reservedMicros" THEN RAISE EXCEPTION 'synthetic rollback'; END IF; RETURN NEW; END$$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER cost_hold_failure BEFORE UPDATE ON "AiOwnerWallet" FOR EACH ROW EXECUTE FUNCTION reject_cost_hold()`);
  const count=await db.$queryRaw`SELECT COUNT(*)::int n FROM "AiOwnerWalletEntry" WHERE "companyId"='a'`;
  assert.notEqual((await request({companyId:'a',storeId:'a-store'})).status,200);assert.equal(calls,1);assert.deepEqual(await db.$queryRaw`SELECT COUNT(*)::int n FROM "AiOwnerWalletEntry" WHERE "companyId"='a'`,count);
  await db.$executeRawUnsafe(`DROP TRIGGER cost_hold_failure ON "AiOwnerWallet"`);
  const uncertain=await request({companyId:'a',storeId:'a-store',uncertain:true});assert.equal(uncertain.body.code,'AI_WALLET_USAGE_REVIEW');assert.equal(calls,2);let state=await repository.read('a');assert.equal(state.balanceMicros,'850');assert.equal(state.reservedMicros,'150');assert.equal(state.entries.filter(e=>e.status==='REVIEW').length,1);
  // Seven concurrent requests have only four affordable holds after REVIEW.
  const results=await Promise.all(Array.from({length:7},()=>request({companyId:'a',storeId:'a-store'})));assert.equal(results.filter(r=>r.status===200).length,4);assert.equal(results.filter(r=>r.body.code==='AI_WALLET_INSUFFICIENT').length,3);assert.equal(calls,6);
  state=await repository.read('a');assert.equal(state.balanceMicros,'250');assert.equal(state.reservedMicros,'150');assert.equal(state.availableMicros,'100');assert.equal((await repository.read('b')).balanceMicros,'1000');
  assert.deepEqual(await db.$queryRaw`SELECT * FROM "BusinessControl"`,[{sales:12,cash:20000,stock:31}]);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();}
});
