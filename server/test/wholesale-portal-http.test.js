import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {Prisma,PrismaClient} from '@prisma/client';
import {createWholesalePortalRouter} from '../src/routes/wholesale-portal.js';
import {createWholesalePortalAdminRouter} from '../src/routes/wholesale-portal-admin.js';
import {ensureWholesalePortalSchema} from '../src/wholesale-portal-bootstrap.js';
import {auth} from '../src/middleware/auth.js';
import {assertWholesaleManager,buildWholesaleQuote,wholesaleError} from '../src/lib/wholesale-pricing.js';
import {createWholesaleOrder} from '../src/lib/wholesale-orders.js';

const origin='https://myworkstation-app.onrender.com';
function isolated(){try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&u.pathname==='/myworkstation_test'}catch{return false}}

async function http(db){
  const app=express();app.use(express.json());
  app.use('/api/b2b',createWholesalePortalRouter({db,ensureSchema:()=>ensureWholesalePortalSchema(db),expectedOrigin:origin}));
  app.use('/api/wholesale/portal',(req,res,next)=>{req.user={id:'owner-a',companyId:req.headers['x-test-company']||'company-a',role:req.headers['x-test-role']||'OWNER',tokenType:req.headers['x-test-token']||'BACKOFFICE_USER'};next()},createWholesalePortalAdminRouter({db,ensureSchema:()=>ensureWholesalePortalSchema(db)}));
  // Execute the existing registered management router unchanged, with only its
  // database/schema dependencies pointing at this owned, isolated fixture.
  const source=(await readFile(new URL('../src/routes/wholesale-b2b.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export default .*;\n/gm,'');
  const management=new Function('crypto','Router','z','prisma','ensureWholesaleSchema','Prisma','assertWholesaleManager','buildWholesaleQuote','wholesaleError','createWholesaleOrder',source+'\nreturn router;')(crypto,express.Router,z,db,()=>ensureWholesalePortalSchema(db),Prisma,assertWholesaleManager,buildWholesaleQuote,wholesaleError,createWholesaleOrder);
  app.use('/api/wholesale',(req,res,next)=>{req.user={id:'owner-a',companyId:'company-a',role:'OWNER',tokenType:'BACKOFFICE_USER'};next()},management);
  app.get('/protected',auth,(req,res)=>res.json({unexpected:true}));
  app.use((error,req,res,next)=>res.status(500).json({error:'Isolated service unavailable'}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
  return {async request(path,method='GET',body,headers={}){
    const r=await fetch(`http://127.0.0.1:${server.address().port}`+path,{method,headers:{'content-type':'application/json',origin,...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const data=await r.json();return {status:r.status,data,headers:r.headers,cookie:r.headers.get('set-cookie')?.split(';')[0]};
  },close:()=>new Promise(resolve=>{server.close(resolve);server.closeIdleConnections()})};
}

test('native PostgreSQL customer portal isolates opaque sessions, grants and shared order requests',{skip:!isolated()},async t=>{
  const schema='wholesale_portal_'+crypto.randomBytes(8).toString('hex'),admin=new PrismaClient(),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
  const db=new PrismaClient({datasourceUrl:url.toString()});let api;
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for(const sql of [
      'CREATE TABLE "Company" ("id" TEXT PRIMARY KEY,"name" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"licenseStatus" TEXT NOT NULL DEFAULT \'ACTIVE\',"subscriptionEndsAt" TIMESTAMPTZ)',
      'CREATE TABLE "CompanyModule" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id"),"moduleKey" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"startsAt" TIMESTAMPTZ,"endsAt" TIMESTAMPTZ,UNIQUE("companyId","moduleKey"))',
      'CREATE TABLE "Store" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id"),"name" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true)',
      'CREATE TABLE "Product" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id"),"name" TEXT NOT NULL,"sku" TEXT,"unit" TEXT NOT NULL DEFAULT \'PIECE\',"vatRate" NUMERIC(6,3) NOT NULL DEFAULT 24,"active" BOOLEAN NOT NULL DEFAULT true)',
      'CREATE TABLE "StoreProduct" ("id" TEXT PRIMARY KEY,"storeId" TEXT NOT NULL REFERENCES "Store"("id"),"productId" TEXT NOT NULL REFERENCES "Product"("id"),"active" BOOLEAN NOT NULL DEFAULT true,UNIQUE("storeId","productId"))',
      'CREATE TABLE "Sale" ("id" TEXT PRIMARY KEY,"amount" NUMERIC)',
      'CREATE TABLE "StockMovement" ("id" TEXT PRIMARY KEY,"quantity" NUMERIC)',
      'CREATE TABLE "StoreTransaction" ("id" TEXT PRIMARY KEY,"amount" NUMERIC)'
    ])await db.$executeRawUnsafe(sql);
    await db.$executeRaw`INSERT INTO "Company" ("id","name") VALUES ('company-a','Company A'),('company-b','Company B')`;
    await db.$executeRaw`INSERT INTO "CompanyModule" ("id","companyId","moduleKey") VALUES ('module-a','company-a','CORE'),('module-b','company-b','CORE')`;
    await db.$executeRaw`INSERT INTO "Store" ("id","companyId","name") VALUES ('store-a','company-a','A'),('store-a2','company-a','A2'),('store-b','company-b','B')`;
    await db.$executeRaw`INSERT INTO "Product" ("id","companyId","name","sku","vatRate") VALUES ('product-a','company-a','Alpha','A',24),('product-zero','company-a','Zero','Z',0),('product-private','company-a','PRIVATE PRODUCT','PRIVATE',24),('product-b','company-b','FOREIGN SECRET','FOREIGN',24)`;
    await db.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId") VALUES ('spa','store-a','product-a'),('spz','store-a','product-zero'),('spp','store-a','product-private'),('spb','store-b','product-b')`;
    await db.$executeRaw`INSERT INTO "Sale" VALUES ('control-sale',77.33)`;
    await db.$executeRaw`INSERT INTO "StockMovement" VALUES ('control-stock',42)`;
    await db.$executeRaw`INSERT INTO "StoreTransaction" VALUES ('control-money',100.25)`;
    await ensureWholesalePortalSchema(db);await ensureWholesalePortalSchema(db);
    await db.$executeRaw`INSERT INTO "WholesaleCustomer" ("id","companyId","name") VALUES ('customer-a','company-a','Customer A'),('customer-a2','company-a','Customer A2'),('customer-b','company-b','Customer B')`;
    await db.$executeRaw`INSERT INTO "WholesalePriceList" ("id","companyId","code","name") VALUES ('list-a','company-a','A','A'),('list-a2','company-a','A2','A2'),('list-b','company-b','B','B')`;
    await db.$executeRaw`INSERT INTO "WholesaleCustomerPriceList" ("customerId","companyId","priceListId") VALUES ('customer-a','company-a','list-a'),('customer-a2','company-a','list-a2'),('customer-b','company-b','list-b')`;
    await db.$executeRaw`INSERT INTO "WholesalePriceListProduct" ("id","companyId","priceListId","productId","unitPrice","minimumQuantity","priceBasis") VALUES ('tier-a','company-a','list-a','product-a',1.2345,1,'NET'),('tier-zero','company-a','list-a','product-zero',0,1,'GROSS'),('tier-other','company-a','list-a2','product-a',99,1,'NET')`;
    api=await http(db);
    const manager='/api/wholesale/portal',base='/api/b2b/native-a',password='NativePassword_1234';
    let accountId,session,quote,body,orderId;
    const login=()=>api.request(base+'/session','POST',{login:'alice',password});
    const h=()=>({cookie:session.cookie,'x-csrf-token':session.data.csrfToken});
    await t.test('only managers explicitly provision sites, immutable grants and publication',async()=>{
      for(const headers of [{'x-test-role':'EMPLOYEE'},{'x-test-token':'B2B_CUSTOMER'},{'x-test-token':'STORE_OPERATOR'}])assert.equal((await api.request(manager+'/site','GET',undefined,headers)).status,403);
      assert.equal((await api.request(manager+'/site','PUT',{slug:'native-a',name:'Native A',enabled:true})).status,200);
      assert.equal((await api.request(manager+'/site','PUT',{slug:'other-slug',name:'Native A',enabled:true})).status,409);
      for(const customerId of ['customer-b','missing'])assert.ok([400,404].includes((await api.request(manager+'/accounts','POST',{login:'foreign',password,customerId,storeId:'store-a',active:true})).status));
      assert.ok([400,404].includes((await api.request(manager+'/accounts','POST',{login:'foreign-store',password,customerId:'customer-a',storeId:'store-b',active:true})).status));
      assert.equal((await api.request(manager+'/accounts','POST',{login:'alice',password,customerId:'customer-a',storeId:'store-a',active:true})).status,201);
      const accounts=await api.request(manager+'/accounts');assert.equal(accounts.status,200);accountId=accounts.data.items[0].id;assert.ok(accountId);assert.doesNotMatch(JSON.stringify(accounts.data),/passwordHash|NativePassword/);
      assert.equal((await api.request(manager+`/accounts/${accountId}`,'PATCH',{customerId:'customer-a2'})).status,400);
      for(const productId of ['product-a','product-zero'])assert.equal((await api.request(manager+'/products/'+productId,'PUT',{storeId:'store-a',published:true})).status,200);
      assert.ok([400,404].includes((await api.request(manager+'/products/product-b','PUT',{storeId:'store-a',published:true})).status));
    });
    await t.test('anonymous branding, cookie isolation, CSRF and explicit store fail closed',async()=>{
      const config=await api.request(base+'/config');assert.equal(config.status,200);assert.doesNotMatch(JSON.stringify(config.data),/customer-a|list-a|product-a/);
      assert.equal((await api.request(base+'/me')).status,401);
      assert.equal((await api.request(base+'/session','POST',{login:'alice',password},{origin:'https://foreign.invalid'})).status,403);
      assert.equal((await api.request(base+'/session','POST',{login:'alice',password:'incorrect'})).status,401);
      session=await login();assert.equal(session.status,200);assert.equal(session.data.account.customerId,'customer-a');assert.equal(session.data.stores[0].id,'store-a');assert.ok(session.data.csrfToken);
      assert.ok(new Date(session.data.expiresAt)>new Date());
      const cookie=session.headers.get('set-cookie');for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/api/b2b/native-a'])assert.ok(cookie.includes(flag),cookie);
      assert.doesNotMatch(session.cookie,/eyJ/);assert.match(session.headers.get('cache-control'),/no-store/);
      const stored=await db.$queryRaw`SELECT "tokenHash" FROM "WholesalePortalSession"`;assert.ok(stored.length);assert.ok(stored.every(row=>/^[a-f0-9]{64}$/.test(row.tokenHash)));assert.ok(stored.every(row=>!session.cookie.includes(row.tokenHash)));
      assert.equal((await api.request('/protected','GET',undefined,{authorization:'Bearer '+session.cookie.split('=').slice(1).join('=')})).status,401);
      const managementToken=jwt.sign({id:'owner-a',companyId:'company-a',role:'OWNER',tokenType:'BACKOFFICE_USER'},'isolated-portal-test');
      assert.equal((await api.request(base+'/me','GET',undefined,{authorization:'Bearer '+managementToken})).status,401);
      assert.equal((await api.request(base+'/catalog','GET',undefined,h())).status,400);
      for(const storeId of ['store-a2','store-b','missing'])assert.ok([403,404].includes((await api.request(base+'/catalog?storeId='+storeId,'GET',undefined,h())).status));
      assert.equal((await api.request(base+'/quotes','POST',{storeId:'store-a',items:[{productId:'product-a',quantity:'2'}]},{cookie:session.cookie})).status,403);
      assert.equal((await api.request(base+'/quotes','POST',{storeId:'store-a',items:[{productId:'product-a',quantity:'2'}]}, {...h(),origin:'https://foreign.invalid'})).status,403);
      const catalog=await api.request(base+'/catalog?storeId=store-a','GET',undefined,h());assert.equal(catalog.status,200);assert.equal(catalog.data.items.length,2);assert.doesNotMatch(JSON.stringify(catalog.data),/PRIVATE|FOREIGN|cost|passwordHash|tier-a|list-a/);
      for(const patch of [{customerId:'customer-a2'},{companyId:'company-b'},{actorId:'owner-a'},{channel:'BACKOFFICE'},{unitPrice:'0'}])assert.equal((await api.request(base+'/quotes','POST',{storeId:'store-a',items:[{productId:'product-a',quantity:'2'}],...patch},h())).status,400);
    });
    await t.test('published own products share exact quote, atomic concurrent order and immutable replay',async()=>{
      const input={storeId:'store-a',items:[{productId:'product-a',quantity:'2'},{productId:'product-zero',quantity:'1'}]};
      assert.ok([400,403,404].includes((await api.request(base+'/quotes','POST',{storeId:'store-a',items:[{productId:'product-private',quantity:'1'}]},h())).status));
      const priced=await api.request(base+'/quotes','POST',input,h());assert.equal(priced.status,200);quote=priced.data;assert.deepEqual(quote.totals,{net:'2.47',vat:'0.59',gross:'3.06'});assert.doesNotMatch(JSON.stringify(quote),/tier-a|list-a|priceVersion/);
      body={...input,clientOrderId:crypto.randomUUID(),quoteId:quote.quoteId,notes:'Own customer note'};
      const accepted=await Promise.all(Array.from({length:4},()=>api.request(base+'/orders','POST',body,h())));assert.deepEqual(accepted.map(x=>x.status).sort(),[200,200,200,201]);orderId=accepted[0].data.orderId;assert.ok(accepted.every(x=>x.data.orderId===orderId));assert.equal(accepted[0].data.order.clientOrderId,body.clientOrderId);
      const rows=await db.$queryRaw`SELECT * FROM "WholesaleOrderRequest"`;assert.equal(rows.length,1);assert.equal(rows[0].channel,'B2B_SITE');assert.equal(rows[0].actorId,'b2b:'+accountId);assert.equal(rows[0].snapshot.totals.gross,'3.06');
      const backoffice=await api.request('/api/wholesale/orders?storeId=store-a');assert.equal(backoffice.status,200);assert.equal(backoffice.data.items[0].id,orderId);assert.deepEqual(backoffice.data.items[0].snapshot,rows[0].snapshot);
      assert.equal((await db.$queryRaw`SELECT * FROM "WholesaleOrderEvent"`).length,1);
      assert.equal((await api.request(base+'/orders','POST',{...body,notes:'Changed'},h())).status,409);
      await db.$executeRaw`UPDATE "WholesalePriceListProduct" SET "unitPrice"=2,"version"="version"+1 WHERE "id"='tier-a'`;
      const stale=await api.request(base+'/orders','POST',{...body,clientOrderId:crypto.randomUUID()},h());assert.equal(stale.status,409);assert.equal(stale.data.code,'PRICE_CHANGED');assert.doesNotMatch(JSON.stringify(stale.data),/tier-a|list-a|priceVersion/);
      await api.request(manager+'/products/product-a','PUT',{storeId:'store-a',published:false});
      const replay=await api.request(base+'/orders','POST',body,h());assert.equal(replay.status,200);assert.equal(replay.data.orderId,orderId);assert.equal(replay.data.order.snapshot.totals.gross,'3.06');
      const history=await api.request(base+'/orders?storeId=store-a','GET',undefined,h());assert.equal(history.status,200);assert.equal(history.data.items.length,1);
      assert.equal((await api.request(base+'/orders/'+orderId+'?storeId=store-a','GET',undefined,h())).status,200);
      await api.request(manager+'/products/product-a','PUT',{storeId:'store-a',published:true});
    });
    await t.test('failed request/event write rolls back and the same key safely recovers',async()=>{
      const input={storeId:'store-a',items:[{productId:'product-a',quantity:'2'}]},fresh=await api.request(base+'/quotes','POST',input,h());assert.equal(fresh.status,200);
      const request={...input,clientOrderId:crypto.randomUUID(),quoteId:fresh.data.quoteId,notes:'Rollback fixture'};
      await db.$executeRawUnsafe(`CREATE FUNCTION portal_event_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated portal event failure'; END $$`);
      await db.$executeRawUnsafe('CREATE TRIGGER portal_event_failure BEFORE INSERT ON "WholesaleOrderEvent" FOR EACH ROW EXECUTE FUNCTION portal_event_failure()');
      try{assert.equal((await api.request(base+'/orders','POST',request,h())).status,500)}finally{await db.$executeRawUnsafe('DROP TRIGGER portal_event_failure ON "WholesaleOrderEvent"')}
      assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "WholesaleOrderRequest" WHERE "clientOrderId"=${request.clientOrderId}`)[0].n,0);
      const recovered=await api.request(base+'/orders','POST',request,h());assert.equal(recovered.status,201);
      assert.equal((await api.request(base+'/orders','POST',request,h())).status,200);
    });
    await t.test('customer and tenant history isolation, logout and same-account fresh-session replay',async()=>{
      assert.equal((await api.request(manager+'/accounts','POST',{login:'other',password,customerId:'customer-a2',storeId:'store-a',active:true})).status,201);
      const other=await api.request(base+'/session','POST',{login:'other',password});assert.equal(other.status,200);
      const headers={cookie:other.cookie,'x-csrf-token':other.data.csrfToken};
      const history=await api.request(base+'/orders?storeId=store-a','GET',undefined,headers);assert.equal(history.status,200);assert.equal(history.data.items.length,0);
      assert.equal((await api.request(base+'/orders/'+orderId+'?storeId=store-a','GET',undefined,headers)).status,404);
      await api.request(manager+'/site','PUT',{slug:'native-b',name:'Native B',enabled:true},{'x-test-company':'company-b'});
      await api.request(manager+'/accounts','POST',{login:'bob',password,customerId:'customer-b',storeId:'store-b',active:true},{'x-test-company':'company-b'});
      const foreign=await api.request('/api/b2b/native-b/session','POST',{login:'bob',password});assert.equal(foreign.status,200);
      assert.equal((await api.request(base+'/me','GET',undefined,{cookie:foreign.cookie})).status,401);
      assert.equal((await api.request('/api/b2b/native-b/orders/'+orderId+'?storeId=store-b','GET',undefined,{cookie:foreign.cookie})).status,404);
      assert.equal((await api.request('/api/b2b/missing/me','GET',undefined,h())).status,401);
      const oldCookie=session.cookie;assert.equal((await api.request(base+'/session','DELETE',undefined,h())).status,200);
      assert.equal((await api.request(base+'/me','GET',undefined,{cookie:oldCookie})).status,401);
      session=await login();assert.equal(session.status,200);assert.notEqual(session.cookie,oldCookie);
      const replay=await api.request(base+'/orders','POST',body,h());assert.equal(replay.status,200);assert.equal(replay.data.orderId,orderId);
    });
    await t.test('publication is store-specific and password reset/expiry revoke opaque credentials',async()=>{
      await db.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId") VALUES ('spa2','store-a2','product-a')`;
      assert.equal((await api.request(manager+'/accounts','POST',{login:'second-store',password,customerId:'customer-a',storeId:'store-a2',active:true})).status,201);
      const second=await api.request(base+'/session','POST',{login:'second-store',password});assert.equal(second.status,200);
      const headers={cookie:second.cookie,'x-csrf-token':second.data.csrfToken};
      const catalog=await api.request(base+'/catalog?storeId=store-a2','GET',undefined,headers);assert.equal(catalog.status,200);assert.deepEqual(catalog.data.items,[]);
      assert.ok([403,404].includes((await api.request(base+'/quotes','POST',{storeId:'store-a2',items:[{productId:'product-a',quantity:'2'}]},headers)).status));
      const id=second.data.account.id,newPassword='ChangedNativePassword_5678';
      assert.equal((await api.request(manager+'/accounts/'+id,'PATCH',{password:newPassword})).status,200);
      assert.equal((await api.request(base+'/me','GET',undefined,headers)).status,401);
      assert.equal((await api.request(base+'/session','POST',{login:'second-store',password})).status,401);
      const updated=await api.request(base+'/session','POST',{login:'second-store',password:newPassword});assert.equal(updated.status,200);
      await db.$executeRaw`UPDATE "WholesalePortalSession" SET "expiresAt"=NOW()-INTERVAL '1 second' WHERE "accountId"=${id}`;
      assert.equal((await api.request(base+'/me','GET',undefined,{cookie:updated.cookie})).status,401);
      for(let attempt=0;attempt<5;attempt++)assert.equal((await api.request(base+'/session','POST',{login:'rate-fixture',password:'wrong'})).status,401);
      assert.equal((await api.request(base+'/session','POST',{login:'rate-fixture',password:'wrong'})).status,429);
    });
    await t.test('current license, module, site, customer and account revocation block even accepted replay',async()=>{
      for(const [disable,restore] of [
        [`UPDATE "Company" SET "active"=false WHERE "id"='company-a'`,`UPDATE "Company" SET "active"=true WHERE "id"='company-a'`],
        [`UPDATE "Company" SET "licenseStatus"='SUSPENDED' WHERE "id"='company-a'`,`UPDATE "Company" SET "licenseStatus"='ACTIVE' WHERE "id"='company-a'`],
        [`UPDATE "Company" SET "subscriptionEndsAt"=NOW()-INTERVAL '1 hour' WHERE "id"='company-a'`,`UPDATE "Company" SET "subscriptionEndsAt"=NULL WHERE "id"='company-a'`],
        [`UPDATE "CompanyModule" SET "active"=false WHERE "id"='module-a'`,`UPDATE "CompanyModule" SET "active"=true WHERE "id"='module-a'`],
        [`UPDATE "CompanyModule" SET "startsAt"=NOW()+INTERVAL '1 hour' WHERE "id"='module-a'`,`UPDATE "CompanyModule" SET "startsAt"=NULL WHERE "id"='module-a'`],
        [`UPDATE "CompanyModule" SET "endsAt"=NOW()-INTERVAL '1 hour' WHERE "id"='module-a'`,`UPDATE "CompanyModule" SET "endsAt"=NULL WHERE "id"='module-a'`],
        [`UPDATE "Store" SET "active"=false WHERE "id"='store-a'`,`UPDATE "Store" SET "active"=true WHERE "id"='store-a'`],
        [`UPDATE "WholesaleCustomer" SET "active"=false WHERE "id"='customer-a'`,`UPDATE "WholesaleCustomer" SET "active"=true WHERE "id"='customer-a'`]
      ]){
        await db.$executeRawUnsafe(disable);try{assert.ok([401,403,404].includes((await api.request(base+'/orders','POST',body,h())).status))}finally{await db.$executeRawUnsafe(restore)}
      }
      await api.request(manager+'/site','PUT',{slug:'native-a',name:'Native A',enabled:false});assert.ok([401,403,404].includes((await api.request(base+'/orders','POST',body,h())).status));
      await api.request(manager+'/site','PUT',{slug:'native-a',name:'Native A',enabled:true});
      session=await login();assert.equal(session.status,200);
      assert.equal((await api.request(manager+`/accounts/${accountId}`,'PATCH',{active:false})).status,200);
      assert.ok([401,403].includes((await api.request(base+'/orders','POST',body,h())).status));
      assert.equal((await login()).status,401);
      const state=await db.$queryRaw`SELECT (SELECT COUNT(*)::int FROM "Sale") AS sales,(SELECT SUM("quantity")::text FROM "StockMovement") AS stock,(SELECT SUM("amount")::text FROM "StoreTransaction") AS money,(SELECT COUNT(*)::int FROM "WholesaleOrderRequest") AS orders,(SELECT COUNT(*)::int FROM "WholesaleOrderEvent") AS events`;
      assert.deepEqual(state[0],{sales:1,stock:'42',money:'100.25',orders:2,events:2});
    });
  }finally{if(api)await api.close();await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
