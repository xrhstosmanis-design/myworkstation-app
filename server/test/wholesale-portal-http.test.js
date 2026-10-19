import {assertWholesaleEntitlement} from '../src/lib/wholesale-entitlement.js';
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
  const management=new Function('crypto','Router','z','prisma','ensureWholesaleSchema','Prisma','assertWholesaleManager','buildWholesaleQuote','wholesaleError','createWholesaleOrder','assertWholesaleEntitlement',source+'\nreturn router;')(crypto,express.Router,z,db,()=>ensureWholesalePortalSchema(db),Prisma,assertWholesaleManager,buildWholesaleQuote,wholesaleError,createWholesaleOrder,assertWholesaleEntitlement);
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
    await ensureWholesalePortalSchema(db);await ensureWholesalePortalSchema(db);
    await db.$executeRaw`INSERT INTO "WholesaleCustomer" ("id","companyId","name") VALUES ('customer-a','company-a','Customer A'),('customer-a2','company-a','Customer A2'),('customer-b','company-b','Customer B')`;
    await db.$executeRaw`INSERT INTO "WholesalePriceList" ("id","companyId","code","name") VALUES ('list-a','company-a','A','A'),('list-a2','company-a','A2','A2'),('list-b','company-b','B','B')`;
    await db.$executeRaw`INSERT INTO "WholesaleCustomerPriceList" ("customerId","companyId","priceListId") VALUES ('customer-a','company-a','list-a'),('customer-a2','company-a','list-a2'),('customer-b','company-b','list-b')`;
    await db.$executeRaw`INSERT INTO "WholesalePriceListProduct" ("id","companyId","priceListId","productId","unitPrice","minimumQuantity","priceBasis") VALUES ('tier-a','company-a','list-a','product-a',1.2345,1,'NET'),('tier-zero','company-a','list-a','product-zero',0,1,'GROSS'),('tier-other','company-a','list-a2','product-a',99,1,'NET')`;
    api=await http(db);
    const manager='/api/wholesale/portal',base='/api/b2b/native-a',password='NativePassword_1234';
    let accountId,session,quote,body,orderId;
    const login=()=>api.request(base+'/session','POST',{login:'alice',password});
    const h=()=>({cookie:session.cookie,'x-csrf-token':session.data.csrfToken,'x-b2b-account':session.data.account.id});
    await t.test('only managers explicitly provision sites, immutable grants and publication',async()=>{
      for(const headers of [{'x-test-role':'EMPLOYEE'},{'x-test-token':'B2B_CUSTOMER'},{'x-test-token':'STORE_OPERATOR'}])assert.equal((await api.request(manager+'/site','GET',undefined,headers)).status,403);
      assert.equal((await api.request(manager+'/site','PUT',{slug:'native-a',name:'Native A',enabled:true})).status,200);
      assert.equal((await api.request(manager+'/site','PUT',{slug:'other-slug',name:'Native A',enabled:true})).status,409);
      for(const customerId of ['customer-b','missing'])assert.ok([400,404].includes((await api.request(manager+'/accounts','POST',{login:'foreign',password,customerId,storeId:'store-a',active:true})).status));
      assert.ok([400,404].includes((await api.request(manager+'/accounts','POST',{login:'foreign-store',password,customerId:'customer-a',storeId:'store-b',active:true})).status));
      assert.equal((await api.request(manager+'/accounts','POST',{login:'alice',password,customerId:'customer-a',storeId:'store-a',active:true})).status,201);
      const accounts=await api.request(manager+'/accounts?storeId=store-a');assert.equal(accounts.status,200);accountId=accounts.data.items[0].id;assert.ok(accountId);assert.doesNotMatch(JSON.stringify(accounts.data),/passwordHash|NativePassword/);
      assert.equal((await api.request(manager+`/accounts/${accountId}?storeId=store-a`,'PATCH',{customerId:'customer-a2'})).status,400);
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
      assert.equal((await api.request(base+'/catalog?storeId=store-a','GET',undefined,{...h(),'x-b2b-account':'another-account'})).status,401);
      assert.equal((await api.request(base+'/me','GET',undefined,{...h(),'x-b2b-account':'another-account'})).status,200);
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
      assert.equal((await api.request(manager+'/accounts/'+id+'?storeId=store-a2','PATCH',{password:newPassword})).status,200);
      assert.equal((await api.request(base+'/me','GET',undefined,headers)).status,401);
      assert.equal((await api.request(base+'/session','POST',{login:'second-store',password})).status,401);
      const updated=await api.request(base+'/session','POST',{login:'second-store',password:newPassword});assert.equal(updated.status,200);
      await db.$executeRaw`UPDATE "WholesalePortalSession" SET "expiresAt"=NOW()-INTERVAL '1 second' WHERE "accountId"=${id}`;
      assert.equal((await api.request(base+'/me','GET',undefined,{cookie:updated.cookie})).status,401);
      for(let attempt=0;attempt<5;attempt++)assert.equal((await api.request(base+'/session','POST',{login:'rate-fixture',password:'wrong'})).status,401);
      assert.equal((await api.request(base+'/session','POST',{login:'rate-fixture',password:'wrong'})).status,429);
    });
    await t.test('manager account reads and mutations require exact selected store and preserve denied account/session controls',async()=>{
      const scoped=storeId=>manager+'/accounts?storeId='+encodeURIComponent(storeId);
      const first=await api.request(scoped('store-a')),second=await api.request(scoped('store-a2'));
      assert.equal(first.status,200);assert.equal(second.status,200);
      assert.ok(first.data.items.length>=2);assert.ok(first.data.items.every(row=>row.storeId==='store-a'));
      assert.equal(second.data.items.length,1);assert.equal(second.data.items[0].login,'second-store');
      assert.doesNotMatch(JSON.stringify(first.data),/second-store|passwordHash|sessionVersion/);
      const id=second.data.items[0].id,path=manager+'/accounts/'+id;
      const central=await api.request(manager+'/accounts?scope=company');assert.equal(central.status,200);
      assert.equal(central.data.items.length,first.data.items.length+second.data.items.length);
      assert.ok(central.data.items.every(row=>['store-a','store-a2'].includes(row.storeId)));
      assert.equal(central.headers.get('cache-control'),'no-store');
      const customerSession=await api.request(base+'/session','POST',{login:'second-store',password:'ChangedNativePassword_5678'});assert.equal(customerSession.status,200);
      const digest=async()=>crypto.createHash('sha256').update(JSON.stringify(await db.$queryRaw`SELECT (SELECT jsonb_agg(a ORDER BY a."id") FROM "WholesalePortalAccount" a) AS accounts,(SELECT jsonb_agg(s ORDER BY s."id") FROM "WholesalePortalSession" s) AS sessions`)).digest('hex');
      const before=await digest();
      for(const query of ['', '?storeId=', '?storeId=missing', '?storeId=store-b','?storeId=store-a&storeId=store-a2','?scope=invalid','?scope=company&storeId=store-a','?storeId=store-a&extra=1']){
        const listed=await api.request(manager+'/accounts'+query);assert.ok([400,404].includes(listed.status),query);
        assert.doesNotMatch(JSON.stringify(listed.data),/alice|second-store|passwordHash/);
        for(const payload of [{active:false},{password:'DeniedReplacement_1234'}])assert.ok([400,404].includes((await api.request(path+query,'PATCH',payload)).status),query);
      }
      for(const storeId of ['store-a','store-b','missing'])for(const payload of [{active:false},{password:'DeniedReplacement_1234'}])assert.equal((await api.request(path+'?storeId='+storeId,'PATCH',payload)).status,404);
      assert.equal((await api.request(path+'?storeId=store-a2','PATCH',{storeId:'store-a',active:false})).status,400);
      assert.equal((await api.request(path+'?scope=company','PATCH',{active:false})).status,400);
      assert.equal((await api.request(path+'?storeId=store-b','PATCH',{active:false},{'x-test-company':'company-b'})).status,404);
      for(const headers of [{'x-test-role':'EMPLOYEE'},{'x-test-token':'B2B_CUSTOMER'},{'x-test-token':'STORE_OPERATOR'}]){
        assert.equal((await api.request(scoped('store-a'),'GET',undefined,headers)).status,403);
        assert.equal((await api.request(path+'?storeId=store-a2','PATCH',{active:false},headers)).status,403);
      }
      await db.$executeRaw`UPDATE "Store" SET "active"=false WHERE "id"='store-a2'`;
      try{
        assert.equal((await api.request(scoped('store-a2'))).status,404);
        assert.equal((await api.request(path+'?storeId=store-a2','PATCH',{active:false})).status,404);
      }finally{await db.$executeRaw`UPDATE "Store" SET "active"=true WHERE "id"='store-a2'`}
      assert.equal(await digest(),before,'denied list/patch must leave every account and session unchanged');
      assert.equal((await api.request(base+'/me','GET',undefined,{cookie:customerSession.cookie})).status,200);
      // Observe the real selected Store row wait before deactivating it. The
      // queued PATCH must re-evaluate active ownership before touching accounts.
      let waiting;
      try{
        await db.$transaction(async tx=>{
          const [{pid}]=await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
          await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"='store-a2' FOR UPDATE`;
          waiting=api.request(path+'?storeId=store-a2','PATCH',{active:false});let observed=false;
          for(let attempt=0;attempt<100;attempt++){
            const rows=await tx.$queryRaw`SELECT pid FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))`;
            if(rows.length){observed=true;break}await new Promise(resolve=>setTimeout(resolve,20));
          }
          assert.ok(observed,'PATCH must be waiting on the selected store row');
          await tx.$executeRaw`UPDATE "Store" SET "active"=false WHERE "id"='store-a2'`;
        },{timeout:10000,maxWait:5000});
        assert.equal((await waiting).status,404);assert.equal(await digest(),before);
      }finally{if(waiting)await waiting.catch(()=>{});await db.$executeRaw`UPDATE "Store" SET "active"=true WHERE "id"='store-a2'`}
      // Entitlement time can expire while a row lock is held even though its
      // grant row cannot be edited. Reads must recheck the live clock as well.
      let pendingRead;
      await db.$executeRaw`UPDATE "CompanyModule" SET "endsAt"=clock_timestamp()+INTERVAL '3 seconds' WHERE "id"='module-a'`;
      try{
        await db.$transaction(async tx=>{
          const [{pid}]=await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
          await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"='store-a2' FOR UPDATE`;
          pendingRead=api.request(scoped('store-a2'));let observed=false,expired=false;
          for(let attempt=0;attempt<100;attempt++){
            if((await tx.$queryRaw`SELECT pid FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))`).length){observed=true;break}
            await new Promise(resolve=>setTimeout(resolve,20));
          }
          assert.ok(observed,'account GET must be waiting on the selected store after its initial license check');
          for(let attempt=0;attempt<300;attempt++){
            const [row]=await tx.$queryRaw`SELECT clock_timestamp()>="endsAt" AS expired FROM "CompanyModule" WHERE "id"='module-a'`;
            if(row.expired){expired=true;break}await new Promise(resolve=>setTimeout(resolve,20));
          }
          assert.ok(expired,'grant must expire before releasing the account read');
        },{timeout:12000,maxWait:5000});
        const denied=await pendingRead;assert.equal(denied.status,403);assert.doesNotMatch(JSON.stringify(denied.data),/second-store|customer-a/);assert.equal(await digest(),before);
      }finally{if(pendingRead)await pendingRead.catch(()=>{});await db.$executeRaw`UPDATE "CompanyModule" SET "endsAt"=NULL WHERE "id"='module-a'`}
      assert.equal((await api.request(path+'?storeId=store-a2','PATCH',{active:false})).status,200);
      assert.equal((await api.request(base+'/me','GET',undefined,{cookie:customerSession.cookie})).status,401);
      assert.equal((await api.request(path+'?storeId=store-a2','PATCH',{active:true})).status,200);
      assert.equal((await api.request(base+'/me','GET',undefined,{cookie:customerSession.cookie})).status,401,'reenabling cannot revive revoked sessions');
      assert.equal((await api.request(scoped('store-a'))).data.items.length,first.data.items.length);
    });
    await t.test('explicit paid wholesale grant is required for anonymous branding, login, private reads, management and accepted replay',async()=>{
      const cases=[
        ['CORE-only grant with wholesale granted only to another company',`DELETE FROM "CompanyModule" WHERE "id"='module-a'`,`INSERT INTO "CompanyModule" ("id","companyId","moduleKey") VALUES ('module-a','company-a','WHOLESALE_B2B')`],
        ['inactive wholesale',`UPDATE "CompanyModule" SET "active"=false WHERE "id"='module-a'`,`UPDATE "CompanyModule" SET "active"=true WHERE "id"='module-a'`],
        ['TRIAL is not paid ACTIVE',`UPDATE "Company" SET "licenseStatus"='TRIAL' WHERE "id"='company-a'`,`UPDATE "Company" SET "licenseStatus"='ACTIVE' WHERE "id"='company-a'`],
        ['PILOT is not paid ACTIVE',`UPDATE "Company" SET "licenseStatus"='PILOT' WHERE "id"='company-a'`,`UPDATE "Company" SET "licenseStatus"='ACTIVE' WHERE "id"='company-a'`],
        ['future subscription',`UPDATE "Company" SET "subscriptionStartsAt"=NOW()+INTERVAL '1 hour' WHERE "id"='company-a'`,`UPDATE "Company" SET "subscriptionStartsAt"=NULL WHERE "id"='company-a'`],
        ['expired subscription',`UPDATE "Company" SET "subscriptionEndsAt"=NOW()-INTERVAL '1 hour' WHERE "id"='company-a'`,`UPDATE "Company" SET "subscriptionEndsAt"=NULL WHERE "id"='company-a'`],
        ['future module',`UPDATE "CompanyModule" SET "startsAt"=NOW()+INTERVAL '1 hour' WHERE "id"='module-a'`,`UPDATE "CompanyModule" SET "startsAt"=NULL WHERE "id"='module-a'`],
        ['expired module',`UPDATE "CompanyModule" SET "endsAt"=NOW()-INTERVAL '1 hour' WHERE "id"='module-a'`,`UPDATE "CompanyModule" SET "endsAt"=NULL WHERE "id"='module-a'`]
      ];
      // Distinct real credentials avoid confusing entitlement denial with the
      // intentionally retained five-attempt login limiter.
      for(let index=0;index<cases.length;index++)assert.equal((await api.request(manager+'/accounts','POST',{login:'paid-check-'+index,password,customerId:'customer-a',storeId:'store-a',active:true})).status,201);
      const controls=()=>db.$queryRaw`SELECT (SELECT COUNT(*)::int FROM "WholesaleOrderRequest") AS orders,(SELECT COUNT(*)::int FROM "WholesaleOrderEvent") AS events,(SELECT COUNT(*)::int FROM "WholesalePortalSession") AS sessions`;
      const before=await controls();
      for(const [index,[label,disable,restore]] of cases.entries()){
        await db.$executeRawUnsafe(disable);
        try{
          assert.equal((await db.$queryRaw`SELECT "active" FROM "CompanyModule" WHERE "id"='core-a'`)[0].active,true);
          assert.equal((await db.$queryRaw`SELECT "active" FROM "CompanyModule" WHERE "id"='module-b'`)[0].active,true);
          const config=await api.request(base+'/config');assert.equal(config.status,404,label+' branding must be closed');assert.doesNotMatch(JSON.stringify(config.data),/Native A|customer-a|product-a|list-a/);assert.equal(config.headers.get('cache-control'),'no-store');
          const deniedLogin=await api.request(base+'/session','POST',{login:'paid-check-'+index,password});assert.ok([401,403,404].includes(deniedLogin.status),label+' valid credentials must not create access');assert.equal(deniedLogin.headers.get('set-cookie'),null);
          for(const path of [base+'/me',base+'/catalog?storeId=store-a',base+'/orders?storeId=store-a',base+'/orders/'+orderId+'?storeId=store-a'])assert.ok([401,403,404].includes((await api.request(path,'GET',undefined,h())).status),label+' '+path);
          for(const [path,payload] of [[base+'/quotes',{storeId:'store-a',items:body.items}],[base+'/orders',body]])assert.ok([401,403,404].includes((await api.request(path,'POST',payload,h())).status),label+' must deny quote and immutable accepted replay');
          assert.ok([401,403,404].includes((await api.request(manager+'/site')).status),label+' management requires the same paid module');
          assert.deepEqual(await controls(),before,label+' denied login/replay may not create sessions or requests/events');
        }finally{await db.$executeRawUnsafe(restore)}
        assert.equal((await api.request(base+'/me','GET',undefined,h())).status,200,label+' restored grant restores only existing authorized access');
      }
    });
    await t.test('accepted portal replay rechecks paid-module revocation after an observed advisory wait',async()=>{
      const key=JSON.stringify(['wholesale-order','company-a','b2b:'+accountId,body.clientOrderId]);let pending;
      const before=await db.$queryRaw`SELECT (SELECT COUNT(*)::int FROM "WholesaleOrderRequest") AS orders,(SELECT COUNT(*)::int FROM "WholesaleOrderEvent") AS events`;
      try{
        await db.$transaction(async tx=>{
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))::text`;
          pending=api.request(base+'/orders','POST',body,h());let observed=false;
          for(let attempt=0;attempt<100;attempt++){
            const rows=await tx.$queryRaw`SELECT 1 FROM pg_locks WHERE locktype='advisory' AND mode='ExclusiveLock' AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND granted=false AND objsubid=1 AND classid=((hashtextextended(${key},0)>>32)&4294967295)::oid AND objid=(hashtextextended(${key},0)&4294967295)::oid`;
            if(rows.length){observed=true;break}await new Promise(resolve=>setTimeout(resolve,20));
          }
          assert.ok(observed,'exact accepted portal key must be waiting before paid-module revocation');
          await tx.$executeRaw`UPDATE "CompanyModule" SET "active"=false WHERE "id"='module-a'`;
        },{timeout:10000,maxWait:5000});
        assert.ok([401,403].includes((await pending).status));assert.deepEqual(await db.$queryRaw`SELECT (SELECT COUNT(*)::int FROM "WholesaleOrderRequest") AS orders,(SELECT COUNT(*)::int FROM "WholesaleOrderEvent") AS events`,before);
      }finally{if(pending)await pending.catch(()=>{});await db.$executeRaw`UPDATE "CompanyModule" SET "active"=true WHERE "id"='module-a'`}
      const restored=await api.request(base+'/orders','POST',body,h());assert.equal(restored.status,200);assert.equal(restored.data.orderId,orderId);
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
      assert.equal((await api.request(manager+`/accounts/${accountId}?storeId=store-a`,'PATCH',{active:false})).status,200);
      assert.ok([401,403].includes((await api.request(base+'/orders','POST',body,h())).status));
      assert.equal((await login()).status,401);
      const state=await db.$queryRaw`SELECT (SELECT COUNT(*)::int FROM "Sale") AS sales,(SELECT SUM("quantity")::text FROM "StockMovement") AS stock,(SELECT SUM("amount")::text FROM "StoreTransaction") AS money,(SELECT COUNT(*)::int FROM "WholesaleOrderRequest") AS orders,(SELECT COUNT(*)::int FROM "WholesaleOrderEvent") AS events`;
      assert.deepEqual(state[0],{sales:1,stock:'42',money:'100.25',orders:2,events:2});
    });
  }finally{if(api)await api.close();await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
