import {assertWholesaleEntitlement} from '../src/lib/wholesale-entitlement.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {Prisma,PrismaClient} from '@prisma/client';
import {createWholesaleSellerRouter} from '../src/routes/wholesale-sellers.js';
import {createWholesaleSellerAdminRouter} from '../src/routes/wholesale-seller-admin.js';
import {ensureWholesaleSellerSchema} from '../src/wholesale-seller-bootstrap.js';
import {assertCustomerDemoRuntimeClosed} from '../src/customer-demo-runtime.js';
import {assertWholesaleManager,buildWholesaleQuote,wholesaleError} from '../src/lib/wholesale-pricing.js';
import {createWholesaleOrder} from '../src/lib/wholesale-orders.js';

function isolated(){try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&u.pathname==='/myworkstation_test'}catch{return false}}
async function http(db){
  // Actual signed JWT/session middleware, with only its database dependency
  // injected into this fixture. No production auth state or business data used.
  const source=(await readFile(new URL('../src/middleware/auth.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export async function auth','async function auth');
  const auth=new Function('jwt','crypto','prisma','assertCustomerDemoRuntimeClosed','authorizeChatOperator',source+'\nreturn auth;')(jwt,crypto,db,assertCustomerDemoRuntimeClosed,async()=>null);
  const app=express();app.use(express.json());
  app.use('/api/wholesale/seller-admin',auth,createWholesaleSellerAdminRouter({db,ensureSchema:()=>ensureWholesaleSellerSchema(db)}));
  app.use('/api/wholesale/sellers',auth,createWholesaleSellerRouter({db,ensureSchema:()=>ensureWholesaleSellerSchema(db)}));
  const managementSource=(await readFile(new URL('../src/routes/wholesale-b2b.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export default .*;\n/gm,'');
  const management=new Function('crypto','Router','z','prisma','ensureWholesaleSchema','Prisma','assertWholesaleManager','buildWholesaleQuote','wholesaleError','createWholesaleOrder','assertWholesaleEntitlement',managementSource+'\nreturn router;')(crypto,express.Router,z,db,()=>ensureWholesaleSellerSchema(db),Prisma,assertWholesaleManager,buildWholesaleQuote,wholesaleError,createWholesaleOrder,assertWholesaleEntitlement);
  app.use('/api/wholesale',auth,management);
  app.use((error,req,res,next)=>res.status(500).json({error:'Isolated service unavailable'}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
  const token=(user='seller-a',claims={})=>jwt.sign({id:user,companyId:user==='seller-b'?'company-b':'company-a',role:user==='owner-a'?'OWNER':'EMPLOYEE',platformRole:user==='owner-a'?'OWNER':'EMPLOYEE',tokenType:'BACKOFFICE_USER',sessionId:'session-'+user,sessionVersion:0,...claims},process.env.JWT_SECRET,{expiresIn:'1h'});
  return {token,async request(path,method='GET',body,user='seller-a',headers={}){
    const r=await fetch(`http://127.0.0.1:${server.address().port}`+path,{method,headers:{'content-type':'application/json',authorization:'Bearer '+token(user),'x-wholesale-seller':user,'x-wholesale-company':user==='seller-b'?'company-b':'company-a',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:r.status,data:await r.json(),headers:r.headers};
  },close:()=>new Promise(resolve=>{server.close(resolve);server.closeIdleConnections()})};
}

test('native PostgreSQL field sales uses current signed sessions, assignments and shared nonfiscal order core',{skip:!isolated()},async t=>{
  const schema='wholesale_seller_'+crypto.randomBytes(8).toString('hex'),admin=new PrismaClient(),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
  const db=new PrismaClient({datasourceUrl:url.toString()}),previousSecret=process.env.JWT_SECRET;let api;
  if(!previousSecret)process.env.JWT_SECRET='isolated-seller-native-only';
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for(const sql of [
      'CREATE TABLE "Company" ("id" TEXT PRIMARY KEY,"name" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"licenseStatus" TEXT NOT NULL DEFAULT \'ACTIVE\',"subscriptionStartsAt" TIMESTAMPTZ,"subscriptionEndsAt" TIMESTAMPTZ)',
      'CREATE TABLE "CompanyModule" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id"),"moduleKey" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"startsAt" TIMESTAMPTZ,"endsAt" TIMESTAMPTZ,UNIQUE("companyId","moduleKey"))',
      'CREATE TABLE "Store" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id"),"name" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true)',
      'CREATE TABLE "Product" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id"),"name" TEXT NOT NULL,"sku" TEXT,"unit" TEXT NOT NULL DEFAULT \'PIECE\',"vatRate" NUMERIC(6,3) NOT NULL DEFAULT 24,"active" BOOLEAN NOT NULL DEFAULT true)',
      'CREATE TABLE "StoreProduct" ("id" TEXT PRIMARY KEY,"storeId" TEXT NOT NULL REFERENCES "Store"("id"),"productId" TEXT NOT NULL REFERENCES "Product"("id"),"active" BOOLEAN NOT NULL DEFAULT true,UNIQUE("storeId","productId"))',
      'CREATE TABLE "Sale" ("id" TEXT PRIMARY KEY,"amount" NUMERIC)',
      'CREATE TABLE "StockMovement" ("id" TEXT PRIMARY KEY,"quantity" NUMERIC)',
      'CREATE TABLE "StoreTransaction" ("id" TEXT PRIMARY KEY,"amount" NUMERIC)'
    ])await db.$executeRawUnsafe(sql);
    await db.$executeRaw`INSERT INTO "Company" ("id","name") VALUES ('company-a','Company A'),('company-b','Company B')`;
    await db.$executeRaw`INSERT INTO "CompanyModule" ("id","companyId","moduleKey") VALUES ('module-a','company-a','WHOLESALE_B2B'),('module-b','company-b','WHOLESALE_B2B'),('core-a','company-a','CORE'),('core-b','company-b','CORE')`;
    await db.$executeRaw`INSERT INTO "Store" ("id","companyId","name") VALUES ('store-a','company-a','A'),('store-a2','company-a','A2'),('store-b','company-b','B')`;
    await db.$executeRaw`INSERT INTO "Product" ("id","companyId","name","sku","vatRate") VALUES ('product-a','company-a','Alpha','A',24),('product-zero','company-a','Zero','Z',0),('product-private','company-a','PRIVATE PRODUCT','PRIVATE',24),('product-b','company-b','FOREIGN SECRET','FOREIGN',24)`;
    await db.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId") VALUES ('spa','store-a','product-a'),('spz','store-a','product-zero'),('spp','store-a','product-private'),('spb','store-b','product-b')`;
    await db.$executeRaw`INSERT INTO "Sale" VALUES ('control-sale',77.33)`;
    await db.$executeRaw`INSERT INTO "StockMovement" VALUES ('control-stock',42)`;
    await db.$executeRaw`INSERT INTO "StoreTransaction" VALUES ('control-money',100.25)`;
    await db.$executeRawUnsafe('CREATE TABLE "User" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id"),"email" TEXT NOT NULL,"fullName" TEXT NOT NULL,"role" TEXT NOT NULL,"sessionVersion" INTEGER NOT NULL DEFAULT 0,"mustChangePassword" BOOLEAN NOT NULL DEFAULT false)');
    await db.$executeRawUnsafe('CREATE TABLE "UserSession" ("id" TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "User"("id"),"expiresAt" TIMESTAMPTZ NOT NULL,"revokedAt" TIMESTAMPTZ,"lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"deviceName" TEXT,"userAgent" TEXT,"ipAddress" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    await db.$executeRaw`INSERT INTO "User" ("id","companyId","email","fullName","role") VALUES ('owner-a','company-a','owner@isolated.invalid','Manager','OWNER'),('seller-a','company-a','seller@isolated.invalid','Seller A','EMPLOYEE'),('seller-a2','company-a','second@isolated.invalid','Seller Two','EMPLOYEE'),('seller-b','company-b','foreign@isolated.invalid','Foreign Seller','EMPLOYEE')`;
    await db.$executeRaw`INSERT INTO "UserSession" ("id","userId","expiresAt") SELECT 'session-'||"id","id",NOW()+INTERVAL '2 hours' FROM "User"`;
    await ensureWholesaleSellerSchema(db);await ensureWholesaleSellerSchema(db);
    await db.$executeRaw`INSERT INTO "WholesaleCustomer" ("id","companyId","name") VALUES ('customer-a','company-a','Customer A'),('customer-a2','company-a','Customer A2'),('customer-b','company-b','Customer B')`;
    await db.$executeRaw`INSERT INTO "WholesalePriceList" ("id","companyId","code","name") VALUES ('list-a','company-a','A','A'),('list-a2','company-a','A2','A2'),('list-b','company-b','B','B')`;
    await db.$executeRaw`INSERT INTO "WholesaleCustomerPriceList" ("customerId","companyId","priceListId") VALUES ('customer-a','company-a','list-a'),('customer-a2','company-a','list-a2'),('customer-b','company-b','list-b')`;
    await db.$executeRaw`INSERT INTO "WholesalePriceListProduct" ("id","companyId","priceListId","productId","unitPrice","minimumQuantity","priceBasis") VALUES ('tier-a','company-a','list-a','product-a',1.2345,1,'NET'),('tier-zero','company-a','list-a','product-zero',0,1,'GROSS'),('tier-other','company-a','list-a2','product-a',99,1,'NET')`;
    // Scenarios follow below; every database mutation is fixture-owned.
    await db.$executeRaw`INSERT INTO "WholesaleSellerMembership" ("id","companyId","userId") VALUES ('foreign-member','company-b','seller-b')`;
    await db.$executeRaw`INSERT INTO "WholesaleSellerAssignment" ("id","companyId","userId","customerId","storeId") VALUES ('foreign-grant','company-b','seller-b','customer-b','store-b')`;
    api=await http(db);
    const base='/api/wholesale/sellers',manage='/api/wholesale/seller-admin';
    const input={customerId:'customer-a',storeId:'store-a',items:[{productId:'product-a',quantity:'2'},{productId:'product-zero',quantity:'1'}]};
    const manager=(path,method='GET',body)=>api.request(manage+path,method,body,'owner-a');
    const membership=async(user,active)=>{
      const rows=await db.$queryRaw`SELECT "revision" FROM "WholesaleSellerMembership" WHERE "companyId"='company-a' AND "userId"=${user}`;
      return manager('/users/'+user+'/membership','PUT',{active,expectedRevision:rows[0]?.revision||0});
    };
    const assignment=async(user,customerId,storeId,active)=>{
      const rows=await db.$queryRaw`SELECT "revision" FROM "WholesaleSellerAssignment" WHERE "companyId"='company-a' AND "userId"=${user} AND "customerId"=${customerId} AND "storeId"=${storeId}`;
      return manager('/users/'+user+'/assignments','PUT',{customerId,storeId,active,expectedRevision:rows[0]?.revision||0});
    };
    let body,orderId;
    await t.test('signed nonmember Owner gets403 without losing manager access; revoked session or disabled license still gets401',async()=>{
      const denied=await api.request(base+'/context','GET',undefined,'owner-a');
      assert.equal(denied.status,403);assert.equal(denied.data.code,'SELLER_MEMBERSHIP_REQUIRED');
      assert.equal((await manager('/users')).status,200);
      assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "WholesaleSellerMembership" WHERE "userId"='owner-a'`)[0].n,0,'no implicit seller enrollment');
      assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "WholesaleSellerAudit"`)[0].n,0);
      await db.$executeRaw`UPDATE "UserSession" SET "revokedAt"=clock_timestamp() WHERE "id"='session-owner-a'`;
      try{assert.equal((await api.request(base+'/context','GET',undefined,'owner-a')).status,401)}finally{await db.$executeRaw`UPDATE "UserSession" SET "revokedAt"=NULL WHERE "id"='session-owner-a'`}
      await db.$executeRaw`UPDATE "CompanyModule" SET "active"=false WHERE "id"='module-a'`;
      try{assert.equal((await api.request(base+'/context','GET',undefined,'owner-a')).status,401)}finally{await db.$executeRaw`UPDATE "CompanyModule" SET "active"=true WHERE "id"='module-a'`}
    });
    await t.test('only current managers provision same-company memberships and explicit assignment tuples',async()=>{
      assert.equal((await api.request(manage+'/users')).status,403);
      const users=await manager('/users');assert.equal(users.status,200);assert.doesNotMatch(JSON.stringify(users.data),/FOREIGN|foreign@|password|sessionVersion/);
      assert.equal((await manager('/users/seller-b/membership','PUT',{active:true,expectedRevision:0})).status,404);
      for(const user of ['seller-a','seller-a2']){
        assert.equal((await membership(user,true)).status,200);
        assert.equal((await assignment(user,'customer-a','store-a',true)).status,200);
      }
      assert.equal((await manager('/users/seller-a/membership','PUT',{active:false,expectedRevision:0})).status,409);
      assert.equal((await assignment('seller-a','customer-b','store-a',true)).status,404);
      assert.equal((await assignment('seller-a','customer-a','store-b',true)).status,404);
      const list=await manager('/users/seller-a/assignments?storeId=store-a');assert.equal(list.status,200);assert.equal(list.data.items.length,1);
      assert.equal((await manager('/users/seller-a/assignments')).status,400);
      assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "WholesaleSellerAudit"`)[0].n,4,'only four accepted provisioning mutations may be audited');
      await db.$executeRawUnsafe(`CREATE FUNCTION seller_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated seller audit failure'; END $$`);
      await db.$executeRawUnsafe('CREATE TRIGGER seller_audit_failure BEFORE INSERT ON "WholesaleSellerAudit" FOR EACH ROW EXECUTE FUNCTION seller_audit_failure()');
      try{assert.equal((await membership('seller-a2',false)).status,500)}finally{await db.$executeRawUnsafe('DROP TRIGGER seller_audit_failure ON "WholesaleSellerAudit"')}
      const retained=await db.$queryRaw`SELECT "active","revision" FROM "WholesaleSellerMembership" WHERE "userId"='seller-a2'`;assert.deepEqual(retained,[{active:true,revision:1}]);
      assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "WholesaleSellerAudit"`)[0].n,4);

    });
    await t.test('actual JWT audience, session ownership, current role and expected identity fail closed',async()=>{
      const context=await api.request(base+'/context');assert.equal(context.status,200);assert.match(context.headers.get('cache-control'),/no-store/);assert.equal(context.data.companyId,'company-a');
      for(const claims of [{tokenType:'POS_BACKGROUND'},{tokenType:'STORE_CHAT_OPERATOR'},{sessionId:undefined},{id:'seller-a2',sessionId:'session-seller-a'},{companyId:'company-b'},{sessionVersion:99},{role:'OWNER'},{tokenType:'B2B_CUSTOMER'}]){
        const r=await api.request(base+'/context','GET',undefined,'seller-a',{authorization:'Bearer '+api.token('seller-a',claims)});assert.ok([401,403].includes(r.status),JSON.stringify({claims,...r}));
      }
      assert.equal((await api.request(base+'/customers?storeId=store-a','GET',undefined,'seller-a',{'x-wholesale-seller':''})).status,428);
      assert.equal((await api.request(base+'/customers?storeId=store-a','GET',undefined,'seller-a',{'x-wholesale-company':'company-b'})).status,401);
      assert.equal((await api.request('/api/wholesale/customers')).status,403,'membership must not elevate employee to wholesale manager');
    });
    await t.test('lists and catalog require selected assignment, reject spoofed financial fields and foreign direct access',async()=>{
      assert.equal((await api.request(base+'/customers')).status,400);
      for(const storeId of ['store-a2','store-b','missing'])assert.ok([403,404].includes((await api.request(base+'/customers?storeId='+storeId)).status));
      const customers=await api.request(base+'/customers?storeId=store-a');assert.equal(customers.status,200);assert.deepEqual(customers.data.items.map(row=>row.id),['customer-a']);assert.doesNotMatch(JSON.stringify(customers.data),/creditLimit|customer-a2|customer-b/);
      const catalog=await api.request(base+'/catalog?storeId=store-a&customerId=customer-a');assert.equal(catalog.status,200);assert.ok(catalog.data.items.some(row=>row.id==='product-a'));assert.doesNotMatch(JSON.stringify(catalog.data),/FOREIGN|costPrice|tier-a|list-a/);
      for(const customerId of ['customer-a2','customer-b'])assert.ok([403,404].includes((await api.request(base+'/quotes','POST',{...input,customerId})).status));
      for(const patch of [{companyId:'company-b'},{actorId:'owner-a'},{channel:'BACKOFFICE'},{unitPrice:'0'}])assert.equal((await api.request(base+'/quotes','POST',{...input,...patch})).status,400);
      assert.ok([400,403,404].includes((await api.request(base+'/quotes','POST',{...input,items:[{productId:'product-b',quantity:'1'}]})).status));
    });
    await t.test('exact quote, concurrent accepted request and common backoffice receipt use the same immutable core',async()=>{
      const quote=await api.request(base+'/quotes','POST',input);assert.equal(quote.status,200);assert.deepEqual(quote.data.totals,{net:'2.47',vat:'0.59',gross:'3.06'});assert.doesNotMatch(JSON.stringify(quote.data),/tier-a|list-a|priceVersion/);
      body={...input,clientOrderId:crypto.randomUUID(),quoteId:quote.data.quoteId,notes:'Seller-owned note'};
      const results=await Promise.all(Array.from({length:4},()=>api.request(base+'/orders','POST',body)));assert.deepEqual(results.map(r=>r.status).sort(),[200,200,200,201]);orderId=results[0].data.orderId;assert.ok(results.every(r=>r.data.orderId===orderId));
      const rows=await db.$queryRaw`SELECT * FROM "WholesaleOrderRequest"`;assert.equal(rows.length,1);assert.equal(rows[0].channel,'FIELD_SALES');assert.equal(rows[0].actorId,'seller:seller-a');assert.equal(rows[0].snapshot.totals.gross,'3.06');
      assert.equal((await db.$queryRaw`SELECT * FROM "WholesaleOrderEvent"`).length,1);
      const office=await api.request('/api/wholesale/orders?storeId=store-a','GET',undefined,'owner-a');assert.equal(office.status,200);assert.equal(office.data.items[0].id,orderId);assert.deepEqual(office.data.items[0].snapshot,rows[0].snapshot);
      const history=await api.request(base+'/orders?storeId=store-a&customerId=customer-a');assert.equal(history.status,200);assert.equal(history.data.items.length,1);
      const other=await api.request(base+'/orders?storeId=store-a&customerId=customer-a','GET',undefined,'seller-a2');assert.equal(other.status,200);assert.equal(other.data.items.length,0);
      assert.equal((await api.request(base+'/orders/'+orderId+'?storeId=store-a&customerId=customer-a','GET',undefined,'seller-a2')).status,404);
      assert.equal((await api.request(base+'/context','GET',undefined,'seller-b')).status,200);
      assert.equal((await api.request(base+'/orders/'+orderId+'?storeId=store-b&customerId=customer-b','GET',undefined,'seller-b')).status,404);

      assert.equal((await api.request(base+'/orders','POST',{...body,notes:'Changed'})).status,409);
      await db.$executeRaw`UPDATE "WholesalePriceListProduct" SET "unitPrice"=2,"version"="version"+1 WHERE "id"='tier-a'`;
      const stale=await api.request(base+'/orders','POST',{...body,clientOrderId:crypto.randomUUID()});assert.equal(stale.status,409);assert.equal(stale.data.code,'PRICE_CHANGED');assert.doesNotMatch(JSON.stringify(stale.data),/tier-a|list-a|priceVersion/);
      const replay=await api.request(base+'/orders','POST',body);assert.equal(replay.status,200);assert.equal(replay.data.orderId,orderId);assert.equal(replay.data.order.snapshot.totals.gross,'3.06');
    });
    await t.test('event failure rolls back request and identical frozen-key retry recovers exactly once',async()=>{
      const priced=await api.request(base+'/quotes','POST',input);assert.equal(priced.status,200);
      const retry={...input,clientOrderId:crypto.randomUUID(),quoteId:priced.data.quoteId,notes:'Rollback fixture'};
      await db.$executeRawUnsafe(`CREATE FUNCTION seller_event_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated seller event failure'; END $$`);
      await db.$executeRawUnsafe('CREATE TRIGGER seller_event_failure BEFORE INSERT ON "WholesaleOrderEvent" FOR EACH ROW EXECUTE FUNCTION seller_event_failure()');
      try{assert.equal((await api.request(base+'/orders','POST',retry)).status,500)}finally{await db.$executeRawUnsafe('DROP TRIGGER seller_event_failure ON "WholesaleOrderEvent"')}
      assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "WholesaleOrderRequest" WHERE "clientOrderId"=${retry.clientOrderId}`)[0].n,0);
      assert.equal((await api.request(base+'/orders','POST',retry)).status,201);assert.equal((await api.request(base+'/orders','POST',retry)).status,200);
    });
    await t.test('seller context, management, private reads, quotes and accepted replay require own paid wholesale ACTIVE grant',async()=>{
      const cases=[
        ['CORE-only; another company has wholesale',`DELETE FROM "CompanyModule" WHERE "id"='module-a'`,`INSERT INTO "CompanyModule" ("id","companyId","moduleKey") VALUES ('module-a','company-a','WHOLESALE_B2B')`],
        ['inactive wholesale',`UPDATE "CompanyModule" SET "active"=false WHERE "id"='module-a'`,`UPDATE "CompanyModule" SET "active"=true WHERE "id"='module-a'`],
        ['TRIAL',`UPDATE "Company" SET "licenseStatus"='TRIAL' WHERE "id"='company-a'`,`UPDATE "Company" SET "licenseStatus"='ACTIVE' WHERE "id"='company-a'`],
        ['PILOT',`UPDATE "Company" SET "licenseStatus"='PILOT' WHERE "id"='company-a'`,`UPDATE "Company" SET "licenseStatus"='ACTIVE' WHERE "id"='company-a'`],
        ['future subscription',`UPDATE "Company" SET "subscriptionStartsAt"=NOW()+INTERVAL '1 hour' WHERE "id"='company-a'`,`UPDATE "Company" SET "subscriptionStartsAt"=NULL WHERE "id"='company-a'`],
        ['expired subscription',`UPDATE "Company" SET "subscriptionEndsAt"=NOW()-INTERVAL '1 hour' WHERE "id"='company-a'`,`UPDATE "Company" SET "subscriptionEndsAt"=NULL WHERE "id"='company-a'`],
        ['future module',`UPDATE "CompanyModule" SET "startsAt"=NOW()+INTERVAL '1 hour' WHERE "id"='module-a'`,`UPDATE "CompanyModule" SET "startsAt"=NULL WHERE "id"='module-a'`],
        ['expired module',`UPDATE "CompanyModule" SET "endsAt"=NOW()-INTERVAL '1 hour' WHERE "id"='module-a'`,`UPDATE "CompanyModule" SET "endsAt"=NULL WHERE "id"='module-a'`]
      ];
      const controls=()=>db.$queryRaw`SELECT (SELECT COUNT(*)::int FROM "WholesaleOrderRequest") AS orders,(SELECT COUNT(*)::int FROM "WholesaleOrderEvent") AS events,(SELECT COUNT(*)::int FROM "WholesaleSellerAudit") AS audits`;
      const before=await controls();
      for(const [label,disable,restore] of cases){
        await db.$executeRawUnsafe(disable);
        try{
          for(const path of [base+'/context',base+'/customers?storeId=store-a',base+'/catalog?customerId=customer-a&storeId=store-a',base+'/orders?customerId=customer-a&storeId=store-a',base+'/orders/'+orderId+'?customerId=customer-a&storeId=store-a'])assert.ok([401,403,404].includes((await api.request(path)).status),label+' '+path);
          assert.ok([401,403,404].includes((await api.request(base+'/quotes','POST',{customerId:'customer-a',storeId:'store-a',items:body.items})).status),label+' quote');
          assert.ok([401,403,404].includes((await api.request(base+'/orders','POST',body)).status),label+' accepted replay');
          assert.ok([401,403,404].includes((await api.request('/api/wholesale/seller-admin/users','GET',undefined,'owner-a')).status),label+' manager may not bypass paid grant');
          assert.equal((await db.$queryRaw`SELECT "active" FROM "CompanyModule" WHERE "id"='core-a'`)[0].active,true);assert.equal((await db.$queryRaw`SELECT "active" FROM "CompanyModule" WHERE "id"='module-b'`)[0].active,true);
          assert.deepEqual(await controls(),before,label+' no accepted request/event/assignment audit changes');
        }finally{await db.$executeRawUnsafe(restore)}
        assert.equal((await api.request(base+'/context')).status,200,label+' restored own grant');
      }
    });
    await t.test('current assignment, membership, customer, store and license revocation block accepted replay and reads',async()=>{
      assert.equal((await assignment('seller-a','customer-a','store-a',false)).status,200);
      for(const path of [base+'/orders/'+orderId+'?storeId=store-a&customerId=customer-a',base+'/catalog?storeId=store-a&customerId=customer-a'])assert.ok([403,404].includes((await api.request(path)).status));
      assert.ok([403,404].includes((await api.request(base+'/orders','POST',body)).status));
      assert.equal((await assignment('seller-a','customer-a','store-a',true)).status,200);
      assert.equal((await membership('seller-a',false)).status,200);const inactive=await api.request(base+'/orders','POST',body);assert.equal(inactive.status,403);assert.equal(inactive.data.code,'SELLER_MEMBERSHIP_REQUIRED');assert.equal((await membership('seller-a',true)).status,200);
      for(const [table,id] of [['WholesaleCustomer','customer-a'],['Store','store-a'],['Company','company-a'],['CompanyModule','module-a']]){
        await db.$executeRawUnsafe(`UPDATE "${table}" SET "active"=false WHERE "id"=$1`,id);
        try{assert.ok([401,403,404].includes((await api.request(base+'/orders','POST',body)).status),table)}finally{await db.$executeRawUnsafe(`UPDATE "${table}" SET "active"=true WHERE "id"=$1`,id)}
      }
      await db.$executeRaw`UPDATE "User" SET "sessionVersion"=1 WHERE "id"='seller-a'`;
      try{assert.equal((await api.request(base+'/context')).status,401)}finally{await db.$executeRaw`UPDATE "User" SET "sessionVersion"=0 WHERE "id"='seller-a'`}
      for(const [sql,restore] of [
        [`UPDATE "User" SET "role"='MANAGER' WHERE "id"='seller-a'`,`UPDATE "User" SET "role"='EMPLOYEE' WHERE "id"='seller-a'`],
        [`UPDATE "User" SET "mustChangePassword"=true WHERE "id"='seller-a'`,`UPDATE "User" SET "mustChangePassword"=false WHERE "id"='seller-a'`],
        [`UPDATE "UserSession" SET "expiresAt"=NOW()-INTERVAL '1 second' WHERE "id"='session-seller-a'`,`UPDATE "UserSession" SET "expiresAt"=NOW()+INTERVAL '2 hours' WHERE "id"='session-seller-a'`],
        [`UPDATE "Company" SET "licenseStatus"='SUSPENDED' WHERE "id"='company-a'`,`UPDATE "Company" SET "licenseStatus"='ACTIVE' WHERE "id"='company-a'`],
        [`UPDATE "Company" SET "subscriptionEndsAt"=NOW()-INTERVAL '1 second' WHERE "id"='company-a'`,`UPDATE "Company" SET "subscriptionEndsAt"=NULL WHERE "id"='company-a'`],
        [`UPDATE "CompanyModule" SET "startsAt"=NOW()+INTERVAL '1 hour' WHERE "id"='module-a'`,`UPDATE "CompanyModule" SET "startsAt"=NULL WHERE "id"='module-a'`],
        [`UPDATE "CompanyModule" SET "endsAt"=NOW()-INTERVAL '1 second' WHERE "id"='module-a'`,`UPDATE "CompanyModule" SET "endsAt"=NULL WHERE "id"='module-a'`]
      ]){
        await db.$executeRawUnsafe(sql);
        try{assert.ok([401,403].includes((await api.request(base+'/orders','POST',body)).status),sql)}finally{await db.$executeRawUnsafe(restore)}
      }
      const replay=await api.request(base+'/orders','POST',body);assert.equal(replay.status,200);assert.equal(replay.data.orderId,orderId);
    });
    await t.test('advisory-waiting seller replay rechecks dedicated paid module before disclosing the accepted order',async()=>{
      const key=JSON.stringify(['wholesale-order','company-a','seller:seller-a',body.clientOrderId]);let pending;
      const before=await db.$queryRaw`SELECT (SELECT COUNT(*)::int FROM "WholesaleOrderRequest") AS orders,(SELECT COUNT(*)::int FROM "WholesaleOrderEvent") AS events`;
      try{
        await db.$transaction(async tx=>{
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))::text`;
          pending=api.request(base+'/orders','POST',body);let observed=false;
          for(let attempt=0;attempt<100;attempt++){
            const rows=await tx.$queryRaw`SELECT 1 FROM pg_locks WHERE locktype='advisory' AND mode='ExclusiveLock' AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND granted=false AND objsubid=1 AND classid=((hashtextextended(${key},0)>>32)&4294967295)::oid AND objid=(hashtextextended(${key},0)&4294967295)::oid`;
            if(rows.length){observed=true;break}await new Promise(resolve=>setTimeout(resolve,20));
          }
          assert.ok(observed,'exact accepted seller key must be waiting before dedicated-module revocation');
          await tx.$executeRaw`UPDATE "CompanyModule" SET "active"=false WHERE "id"='module-a'`;
        },{timeout:10000,maxWait:5000});
        assert.ok([401,403].includes((await pending).status));assert.deepEqual(await db.$queryRaw`SELECT (SELECT COUNT(*)::int FROM "WholesaleOrderRequest") AS orders,(SELECT COUNT(*)::int FROM "WholesaleOrderEvent") AS events`,before);
      }finally{if(pending)await pending.catch(()=>{});await db.$executeRaw`UPDATE "CompanyModule" SET "active"=true WHERE "id"='module-a'`}
      const restored=await api.request(base+'/orders','POST',body);assert.equal(restored.status,200);assert.equal(restored.data.orderId,orderId);
    });
    await t.test('advisory-waiting accepted replay rechecks session revocation after lock acquisition',async()=>{
      const key=JSON.stringify(['wholesale-order','company-a','seller:seller-a',body.clientOrderId]);let pending;
      try{await db.$transaction(async tx=>{
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))::text`;
        pending=api.request(base+'/orders','POST',body);
        let observed=false;
        for(let attempt=0;attempt<100;attempt++){
          const rows=await tx.$queryRaw`SELECT 1 FROM pg_locks WHERE locktype='advisory' AND mode='ExclusiveLock' AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND granted=false AND objsubid=1 AND classid=((hashtextextended(${key},0)>>32)&4294967295)::oid AND objid=(hashtextextended(${key},0)&4294967295)::oid`;
          if(rows.length){observed=true;break}await new Promise(resolve=>setTimeout(resolve,20));
        }
        assert.ok(observed,'exact seller idempotency advisory waiter must be observed before revocation');
        await tx.$executeRaw`UPDATE "UserSession" SET "revokedAt"=clock_timestamp() WHERE "id"='session-seller-a'`;
      },{timeout:10000,maxWait:5000});
      assert.ok([401,403].includes((await pending).status))}finally{if(pending)await pending.catch(()=>{});await db.$executeRaw`UPDATE "UserSession" SET "revokedAt"=NULL WHERE "id"='session-seller-a'`}
      assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "WholesaleOrderRequest" WHERE "clientOrderId"=${body.clientOrderId}`)[0].n,1);
      assert.deepEqual(await db.$queryRaw`SELECT * FROM "Sale"`,[{id:'control-sale',amount:new Prisma.Decimal('77.33')}]);
      assert.deepEqual(await db.$queryRaw`SELECT * FROM "StockMovement"`,[{id:'control-stock',quantity:new Prisma.Decimal(42)}]);
      assert.deepEqual(await db.$queryRaw`SELECT * FROM "StoreTransaction"`,[{id:'control-money',amount:new Prisma.Decimal('100.25')}]);
    });
  }finally{
    if(api)await api.close();await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();
    if(previousSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousSecret;
  }
});
