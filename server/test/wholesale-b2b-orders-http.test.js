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
    await t.test('deterministic advisory waiter reproduces old RR replay conflict and default RC replays the original snapshot',{timeout:45000},async()=>{
      // Run the same real router, service, SQL and PostgreSQL twice. Only the
      // negative-control DB adapter restores the previous RR transaction option.
      // This expected 409 is evidence of the old replay-contract defect, not a
      // business/LAB failure or permission to weaken the corrected assertion.
      const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes});return {promise,resolve}};
      const bounded=async(promise,label,ms=6000)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),ms)})])}finally{clearTimeout(timer)}};
      const bindDb=(transaction)=>new Proxy(db,{get(target,key){if(key==='$transaction')return transaction;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}});
      const sqlText=first=>Array.isArray(first)?first.join(''):String(first?.sql||first?.text||first||'');
      const runCase=async(label,restoreRepeatableRead)=>{
        const actorId='advisory-'+label,clientOrderId=crypto.randomUUID(),tierId='inserted-tier-'+label;
        const reachedInsert=deferred(),releaseInsert=deferred(),seenTier=[],firstOptions=[],secondOptions=[];
        let firstApi,secondApi,firstRequest,secondRequest,firstPid;
        const options=original=>restoreRepeatableRead?{...original,isolationLevel:'RepeatableRead'}:original;
        const firstDb=bindDb((fn,original)=>{
          firstOptions.push(original?.isolationLevel);
          return db.$transaction(tx=>fn(new Proxy(tx,{get(target,key){
            if(key==='$queryRaw')return async(...args)=>{
              const text=sqlText(args[0]);
              if(text.includes('INSERT INTO "WholesaleOrderRequest"')){
                firstPid=(await target.$queryRaw`SELECT pg_backend_pid()::int AS "pid"`)[0].pid;
                reachedInsert.resolve();
                await bounded(releaseInsert.promise,'first order INSERT barrier was not released',10000);
              }
              const result=await Reflect.apply(target.$queryRaw,target,args);
              if(text.includes('JOIN LATERAL')&&text.includes('WholesalePriceListProduct')&&text.includes('FOR SHARE'))seenTier.push(...result);
              return result;
            };
            const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
          }})),options(original));
        });
        const secondDb=bindDb((fn,original)=>{secondOptions.push(original?.isolationLevel);return db.$transaction(fn,options(original))});
        try{
          firstApi=await http(firstDb);secondApi=await http(secondDb);
          const headers={'x-test-actor':actorId};
          const fresh=await secondApi.request('/quotes','POST',input,headers);
          assert.equal(fresh.status,200);assert.deepEqual(secondOptions,['RepeatableRead'],'the quote endpoint retains its independent RR snapshot');
          assert.equal(fresh.data.items[0].minimumQuantity,'1.0000');
          const submitted={...input,clientOrderId,quoteId:fresh.data.quoteId,notes:label};
          firstRequest=firstApi.request('/orders','POST',submitted,headers);
          await bounded(reachedInsert.promise,'first real request did not reach INSERT after pricing and locks');
          assert.equal(seenTier.length,1,'actual selected tier query executed before the INSERT barrier');
          assert.equal(String(seenTier[0].minimumQuantity),'1','first transaction locked the existing min1 tier');
          // A new eligible tier is a phantom: unlike updating the selected row,
          // this insert is not blocked by T1's existing-row FOR SHARE lock.
          await db.$executeRaw`INSERT INTO "WholesalePriceListProduct" ("id","companyId","priceListId","productId","minimumQuantity","unitPrice","priceBasis","version") VALUES (${tierId},'company-a','list-a','product-a',1.5,3,'NET',1)`;
          secondRequest=secondApi.request('/orders','POST',submitted,headers);
          const lockKey=JSON.stringify(['wholesale-order','company-a',actorId,clientOrderId]);
          const deadline=Date.now()+4500;let waiter;
          while(Date.now()<deadline){
            const rows=await db.$queryRaw`SELECT COUNT(*)::int AS "waiting" FROM pg_locks l JOIN pg_stat_activity a ON a."pid"=l."pid" WHERE a."wait_event_type"='Lock' AND a."wait_event"='advisory' AND ${firstPid}::int=ANY(pg_blocking_pids(l."pid")) AND "locktype"='advisory' AND "mode"='ExclusiveLock' AND "granted"=false AND "database"=(SELECT oid FROM pg_database WHERE datname=current_database()) AND "classid"=((hashtextextended(${lockKey},0)>>32)&4294967295)::oid AND "objid"=(hashtextextended(${lockKey},0)&4294967295)::oid AND "objsubid"=1`;
            if(rows[0]?.waiting===1){waiter=rows[0];break}
            await new Promise(resolve=>setTimeout(resolve,10));
          }
          assert.equal(waiter?.waiting,1,'second real request must be observed waiting on the exact company/actor/key advisory lock before T1 commits');
          releaseInsert.resolve();
          const [first,second]=await bounded(Promise.all([firstRequest,secondRequest]),'real order requests failed to settle');
          assert.equal(first.status,201);assert.equal(first.data.order.snapshot.quoteId,fresh.data.quoteId);
          assert.deepEqual(first.data.order.snapshot.totals,fresh.data.totals);
          assert.equal(first.data.order.snapshot.items[0].minimumQuantity,'1.0000');
          if(restoreRepeatableRead){
            assert.equal(second.status,409,'negative control reproduces the old RR stale-snapshot replay defect');
            assert.equal(second.data.code,'PRICE_CHANGED');
            assert.equal(second.data.details.quote.items[0].minimumQuantity,'1.5000');
            assert.notEqual(second.data.details.quote.quoteId,fresh.data.quoteId);
          }else{
            assert.equal(second.status,200,'RC must see the accepted request after the advisory wait, before any reprice');
            assert.equal(second.data.replayed,true);assert.equal(second.data.orderId,first.data.orderId);
            assert.deepEqual(second.data.order.snapshot,first.data.order.snapshot);
          }
          assert.deepEqual(firstOptions,['ReadCommitted'],'the unmodified service requests RC, including when the control adapter restores RR');
          assert.deepEqual(secondOptions,['RepeatableRead','ReadCommitted']);
          const saved=await db.$queryRaw`SELECT "id","snapshot" FROM "WholesaleOrderRequest" WHERE "companyId"='company-a' AND "actorId"=${actorId} AND "clientOrderId"=${clientOrderId}`;
          assert.equal(saved.length,1);assert.equal(saved[0].id,first.data.orderId);assert.deepEqual(saved[0].snapshot,first.data.order.snapshot);
          assert.equal(Number((await db.$queryRaw`SELECT COUNT(*) AS n FROM "WholesaleOrderEvent" WHERE "companyId"='company-a' AND "actorId"=${actorId} AND "orderId"=${first.data.orderId}`)[0].n),1);
          const current=await secondApi.request('/quotes','POST',input,headers);assert.equal(current.status,200);assert.equal(current.data.items[0].minimumQuantity,'1.5000');assert.notEqual(current.data.quoteId,fresh.data.quoteId);
        }finally{
          releaseInsert.resolve();
          await Promise.allSettled([firstRequest,secondRequest].filter(Boolean));
          if(firstApi)await firstApi.close();if(secondApi)await secondApi.close();
          await db.$executeRaw`DELETE FROM "WholesalePriceListProduct" WHERE "id"=${tierId} AND "companyId"='company-a'`;
        }
      };
      await runCase('rr-negative-control',true);
      await runCase('rc-default-positive',false);
      assert.deepEqual(await db.$queryRaw`SELECT "id","amount"::text AS amount FROM "Sale"`,[{id:'control-sale',amount:'77.33'}]);
      assert.deepEqual(await db.$queryRaw`SELECT "id","quantity"::text AS quantity FROM "StockMovement"`,[{id:'control-stock',quantity:'42'}]);
      assert.deepEqual(await db.$queryRaw`SELECT "id","amount"::text AS amount FROM "StoreTransaction"`,[{id:'control-money',amount:'100.25'}]);
    });
  }finally{if(api)await api.close();await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
