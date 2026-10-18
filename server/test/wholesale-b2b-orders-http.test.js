import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import express,{Router} from 'express';
import {z} from 'zod';
import {Prisma} from '@prisma/client';
import {assertWholesaleManager,buildWholesaleQuote,wholesaleError} from '../src/lib/wholesale-pricing.js';
import {createWholesaleOrder} from '../src/lib/wholesale-orders.js';

const source=(await readFile(new URL('../src/routes/wholesale-b2b.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export default .*;\n/gm,'');
const bootstrap=(await readFile(new URL('../src/wholesale-b2b-bootstrap.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export async function','async function');
async function http(db){
  const router=new Function('crypto','Router','z','prisma','ensureWholesaleSchema','Prisma','assertWholesaleManager','buildWholesaleQuote','wholesaleError','createWholesaleOrder',source+'\nreturn router;')(crypto,Router,z,db,async()=>{},Prisma,assertWholesaleManager,buildWholesaleQuote,wholesaleError,createWholesaleOrder);
  const app=express();app.use(express.json());
  app.use((req,res,next)=>{req.user={id:req.headers['x-test-actor']||'owner-a',companyId:req.headers['x-test-company']||'company-a',role:req.headers['x-test-role']||'OWNER',tokenType:req.headers['x-test-token']||'BACKOFFICE_USER'};next()});
  app.use('/api/wholesale',router);app.use((error,req,res,next)=>res.status(500).json({error:error.message}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))}),base=`http://127.0.0.1:${server.address().port}/api/wholesale`;
  return {async request(path,method='GET',body,headers={}){const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()}},close:()=>new Promise(resolve=>{server.close(resolve);server.closeIdleConnections()})};
}
const input={customerId:'customer-a',storeId:'store-a',items:[{productId:'product-a',quantity:'2'}]};

test('registered wholesale operational HTTP rejects invalid input and unsupported identities before database work',async()=>{
  let reads=0;const api=await http({$transaction:async fn=>fn({$queryRaw:()=>{reads++;throw Error('must not query')}})});
  try{
    for(const path of ['/products','/orders','/orders/missing'])assert.equal((await api.request(path)).status,400);
    for(const q of ['storeId=store-a&page=0','storeId=store-a&pageSize=101','storeId[]=store-a','storeId=store-a&companyId=other'])assert.equal((await api.request('/products?'+q)).status,400);
    for(const body of [{...input,companyId:'other'},{...input,items:[{productId:'product-a',quantity:2}]},{...input,items:[{productId:'product-a',quantity:'1',unitPrice:'0'}]}])assert.equal((await api.request('/quotes','POST',body)).status,400);
    assert.equal((await api.request('/orders','POST',{...input,clientOrderId:'invalid',quoteId:'0'.repeat(64)})).status,400);
    for(const token of ['STORE_OPERATOR','B2B_CUSTOMER','FIELD_SALES']){
      for(const path of ['/quotes','/orders'])assert.equal((await api.request(path,'POST',input,{'x-test-token':token})).status,403);
      assert.equal((await api.request('/products?storeId=store-a','GET',undefined,{'x-test-token':token})).status,403);
    }
    assert.equal((await api.request('/quotes','POST',input,{'x-test-role':'EMPLOYEE'})).status,403);assert.equal(reads,0);
  }finally{await api.close()}
});
function isolated(){try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&u.pathname==='/myworkstation_test'}catch{return false}}

test('native PostgreSQL registered wholesale quotes, tier audit and concurrent requests preserve tenant scope and financial controls',{skip:!isolated()},async t=>{
  const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='wholesale_orders_'+crypto.randomBytes(8).toString('hex'),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
  const db=new PrismaClient({datasourceUrl:url.toString()});let api;
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for(const sql of [
      'CREATE TABLE "Company" ("id" TEXT PRIMARY KEY,"active" BOOLEAN NOT NULL DEFAULT true)',
      'CREATE TABLE "Store" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id"),"name" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true)',
      'CREATE TABLE "Product" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id"),"sku" TEXT,"name" TEXT NOT NULL,"unit" TEXT NOT NULL DEFAULT \'PIECE\',"vatRate" NUMERIC(6,3) NOT NULL DEFAULT 24,"active" BOOLEAN NOT NULL DEFAULT true)',
      'CREATE TABLE "StoreProduct" ("id" TEXT PRIMARY KEY,"storeId" TEXT NOT NULL REFERENCES "Store"("id"),"productId" TEXT NOT NULL REFERENCES "Product"("id"),"active" BOOLEAN NOT NULL DEFAULT true,UNIQUE("storeId","productId"))',
      'CREATE TABLE "Sale" ("id" TEXT PRIMARY KEY,"amount" NUMERIC)',
      'CREATE TABLE "StockMovement" ("id" TEXT PRIMARY KEY,"quantity" NUMERIC)',
      'CREATE TABLE "StoreTransaction" ("id" TEXT PRIMARY KEY,"amount" NUMERIC)'
    ])await db.$executeRawUnsafe(sql);
    await db.$executeRaw`INSERT INTO "Company" ("id") VALUES ('company-a'),('company-b')`;
    await db.$executeRaw`INSERT INTO "Store" ("id","companyId","name","active") VALUES ('store-a','company-a','A',true),('store-a2','company-a','A2',true),('store-b','company-b','B',true),('store-off','company-a','Off',false)`;
    await db.$executeRaw`INSERT INTO "Product" ("id","companyId","name","sku","vatRate") VALUES ('product-a','company-a','Alpha','A',24),('product-zero','company-a','Zero','Z',0),('product-hidden','company-a','Hidden','H',24),('product-b','company-b','Foreign','SECRET',24)`;
    await db.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","active") VALUES ('spa','store-a','product-a',true),('spz','store-a','product-zero',true),('sph','store-a','product-hidden',false),('spb','store-b','product-b',true),('corrupt','store-a','product-b',true)`;
    await db.$executeRaw`INSERT INTO "Sale" VALUES ('control-sale',77.33)`;
    await db.$executeRaw`INSERT INTO "StockMovement" VALUES ('control-stock',42)`;
    await db.$executeRaw`INSERT INTO "StoreTransaction" VALUES ('control-money',100.25)`;
    const ensure=new Function('prisma',bootstrap+';return ensureWholesaleSchema;')(db);await ensure();await ensure();
    await db.$executeRaw`INSERT INTO "WholesaleCustomer" ("id","companyId","name") VALUES ('customer-a','company-a','Own'),('customer-b','company-b','Foreign')`;
    await db.$executeRaw`INSERT INTO "WholesalePriceList" ("id","companyId","code","name") VALUES ('list-a','company-a','A','Own'),('list-b','company-b','B','Foreign')`;
    await db.$executeRaw`INSERT INTO "WholesaleCustomerPriceList" ("customerId","companyId","priceListId") VALUES ('customer-a','company-a','list-a'),('customer-b','company-b','list-b')`;
    api=await http(db);
    await t.test('tier writes classify explicitly, preserve legacy null, audit and compare versions',async()=>{
      for(const [productId,unitPrice,priceBasis] of [['product-a',1.2345,'NET'],['product-zero',0,'GROSS']])assert.equal((await api.request('/price-lists/list-a/products','PUT',{productId,unitPrice,minimumQuantity:1,priceBasis})).status,200);
      for(const patch of [{minimumQuantity:0.00001},{unitPrice:1.00001},{discountPercent:0.0001}])assert.equal((await api.request('/price-lists/list-a/products','PUT',{productId:'product-a',unitPrice:1,...patch})).status,400);
      const tier=(await api.request('/price-lists/list-a/products')).data.items.find(x=>x.productId==='product-a');assert.equal(tier.priceBasis,'NET');assert.equal(tier.version,1);
      assert.equal((await api.request(`/price-lists/list-a/products/${tier.id}/price-basis`,'PUT',{priceBasis:'GROSS',expectedVersion:1})).status,200);
      assert.equal((await api.request(`/price-lists/list-a/products/${tier.id}/price-basis`,'PUT',{priceBasis:'NET',expectedVersion:1})).status,409);
      assert.equal((await api.request(`/price-lists/list-b/products/${tier.id}/price-basis`,'PUT',{priceBasis:'NET',expectedVersion:2})).status,404);
      assert.equal((await api.request('/price-lists/list-a/products','PUT',{productId:'product-a',unitPrice:1.2345})).status,200);
      assert.equal((await api.request('/quotes','POST',input)).data.code,'WHOLESALE_PRICE_BASIS_REQUIRED');
      const legacy=(await api.request('/price-lists/list-a/products')).data.items.find(x=>x.productId==='product-a');assert.equal(legacy.priceBasis,null);assert.equal(legacy.version,3);
      assert.equal((await api.request(`/price-lists/list-a/products/${tier.id}/price-basis`,'PUT',{priceBasis:'NET',expectedVersion:3})).status,200);
      const audit=await db.$queryRaw`SELECT "oldJson","newJson","actorId","companyId" FROM "WholesalePriceAudit" ORDER BY "createdAt","id"`;assert.equal(audit.length,5);assert.ok(audit.every(x=>x.actorId==='owner-a'&&x.companyId==='company-a'));assert.ok(audit.some(x=>x.oldJson?.priceBasis==='GROSS'&&x.newJson?.priceBasis===null));
    });
    let quote,body,acceptedId;
    await t.test('products and quote use exact selected active store, authoritative NET/GROSS and zero VAT',async()=>{
      const products=await api.request('/products?storeId=store-a&pageSize=1');assert.equal(products.status,200);assert.equal(products.data.total,2);assert.equal(products.data.items.length,1);assert.deepEqual(Object.keys(products.data.items[0]).sort(),['id','name','sku','unit']);
      assert.equal((await api.request('/products?storeId=store-a2')).data.total,0);
      for(const id of ['store-b','store-off','missing'])assert.equal((await api.request('/products?storeId='+id)).status,404);
      for(const productId of ['product-hidden','product-b','missing'])assert.equal((await api.request('/quotes','POST',{...input,items:[{productId,quantity:'2'}]})).status,400);
      assert.equal((await api.request('/quotes','POST',{...input,customerId:'customer-b'})).status,404);
      quote=(await api.request('/quotes','POST',input)).data;assert.deepEqual(quote.totals,{net:'2.47',vat:'0.59',gross:'3.06'});assert.equal(quote.creditChecked,false);assert.equal(quote.items[0].priceVersion,4);
      assert.equal((await api.request('/price-lists/list-a/products','PUT',{productId:'product-a',minimumQuantity:5,unitPrice:1.24,priceBasis:'GROSS'})).status,200);
      const gross=(await api.request('/quotes','POST',{...input,items:[{productId:'product-a',quantity:'5'}]})).data;assert.deepEqual(gross.totals,{net:'5.00',vat:'1.20',gross:'6.20'});assert.equal(gross.items[0].minimumQuantity,'5.0000');
      const zero=await api.request('/quotes','POST',{...input,items:[{productId:'product-zero',quantity:'0.1250'}]});assert.equal(zero.data.code,'WHOLESALE_PRICE_REQUIRED');
      const zeroQuote=await api.request('/quotes','POST',{...input,items:[{productId:'product-zero',quantity:'1'}]});assert.deepEqual(zeroQuote.data.totals,{net:'0.00',vat:'0.00',gross:'0.00'});
      body={...input,clientOrderId:crypto.randomUUID(),quoteId:quote.quoteId,notes:'One immutable request'};
    });
    await t.test('concurrent identical online submissions commit one request and event; replays retain original snapshot',async()=>{
      const results=await Promise.all(Array.from({length:5},()=>api.request('/orders','POST',body)));
      assert.deepEqual(results.map(x=>x.status).sort(),[200,200,200,200,201]);assert.equal(new Set(results.map(x=>x.data.orderId)).size,1);acceptedId=results[0].data.orderId;
      assert.equal(Number((await db.$queryRaw`SELECT COUNT(*) AS n FROM "WholesaleOrderRequest"`)[0].n),1);assert.equal(Number((await db.$queryRaw`SELECT COUNT(*) AS n FROM "WholesaleOrderEvent"`)[0].n),1);
      const list=await api.request('/orders?storeId=store-a');assert.equal(list.data.total,1);assert.equal(list.data.items[0].grossTotal,'3.06');
      assert.equal((await api.request(`/orders/${acceptedId}?storeId=store-a2`)).status,404);assert.equal((await api.request(`/orders/${acceptedId}?storeId=store-a`)).data.order.snapshot.quoteId,quote.quoteId);
      assert.equal((await api.request('/orders?storeId=store-a','GET',undefined,{'x-test-company':'company-b'})).status,404);
      assert.equal((await api.request('/orders','POST',{...body,notes:'changed'})).data.code,'IDEMPOTENCY_CONFLICT');
      await db.$executeRaw`UPDATE "WholesalePriceListProduct" SET "unitPrice"=2,"version"="version"+1 WHERE "productId"='product-a'`;
      const replay=await api.request('/orders','POST',body);assert.equal(replay.status,200);assert.equal(replay.data.order.grossTotal,'3.06');
      const stale=await api.request('/orders','POST',{...body,clientOrderId:crypto.randomUUID()});assert.equal(stale.status,409);assert.equal(stale.data.code,'PRICE_CHANGED');assert.deepEqual(stale.data.details.quote.totals,{net:'4.00',vat:'0.96',gross:'4.96'});
      for(const [table,id] of [['Company','company-a'],['Store','store-a'],['WholesaleCustomer','customer-a']]){
        await db.$executeRawUnsafe(`UPDATE "${table}" SET "active"=false WHERE "id"=$1`,id);assert.equal((await api.request('/orders','POST',body)).status,404);await db.$executeRawUnsafe(`UPDATE "${table}" SET "active"=true WHERE "id"=$1`,id);
      }
    });
    await t.test('event failure rolls back inserted order; same key retry succeeds with untouched financial controls',async()=>{
      await db.$executeRawUnsafe(`CREATE FUNCTION fail_wholesale_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."actorId"='fail-actor' THEN RAISE EXCEPTION 'isolated event failure'; END IF; RETURN NEW; END $$`);
      await db.$executeRawUnsafe('CREATE TRIGGER fail_event BEFORE INSERT ON "WholesaleOrderEvent" FOR EACH ROW EXECUTE FUNCTION fail_wholesale_event()');
      const headers={'x-test-actor':'fail-actor'},fresh=(await api.request('/quotes','POST',input,headers)).data,failed={...input,clientOrderId:crypto.randomUUID(),quoteId:fresh.quoteId};
      assert.equal((await api.request('/orders','POST',failed,headers)).status,500);
      assert.equal(Number((await db.$queryRaw`SELECT COUNT(*) AS n FROM "WholesaleOrderRequest" WHERE "actorId"='fail-actor'`)[0].n),0);
      assert.equal(Number((await db.$queryRaw`SELECT COUNT(*) AS n FROM "WholesaleOrderEvent" WHERE "actorId"='fail-actor'`)[0].n),0);
      await db.$executeRawUnsafe('DROP TRIGGER fail_event ON "WholesaleOrderEvent"');
      assert.equal((await api.request('/orders','POST',failed,headers)).status,201);assert.equal((await api.request('/orders','POST',failed,headers)).status,200);
      assert.deepEqual(await db.$queryRaw`SELECT "id","amount"::text AS amount FROM "Sale"`,[{id:'control-sale',amount:'77.33'}]);
      assert.deepEqual(await db.$queryRaw`SELECT "id","quantity"::text AS quantity FROM "StockMovement"`,[{id:'control-stock',quantity:'42'}]);
      assert.deepEqual(await db.$queryRaw`SELECT "id","amount"::text AS amount FROM "StoreTransaction"`,[{id:'control-money',amount:'100.25'}]);
      assert.equal(Number((await db.$queryRaw`SELECT COUNT(*) AS n FROM "WholesaleOrderRequest"`)[0].n),2);assert.equal(Number((await db.$queryRaw`SELECT COUNT(*) AS n FROM "WholesaleOrderEvent"`)[0].n),2);
    });
  }finally{if(api)await api.close();await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
