import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import express from 'express';
import {prisma} from '../src/prisma.js';
import router,{readSalesAnalysisReport} from '../src/routes/kiosk-reports-sales-v4.js';
import {salesReportCalendar} from '../src/services/sales-report-calendar.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};

// Execute the actual canonical reader against either native PostgreSQL or the
// isolated PostgreSQL-WASM local runner. No replacement hourly SQL is used.
export async function runSalesHourlyRegression(db,{http=true}={}){
 const definitions={
  Store:'"id" text primary key,"companyId" text,"name" text,"active" boolean',
  Product:'"id" text primary key,"companyId" text,"name" text,"sku" text,"unit" text,"categoryId" text,"masterProductId" text,"costPrice" numeric',
  ProductCategory:'"id" text primary key,"companyId" text,"name" text',
  MasterProduct:'"id" text primary key,"subcategoryName" text,"categoryName" text',
  StoreProduct:'"storeId" text,"productId" text,"currentStock" numeric',
  PriceCatalogPromotion:'"id" text primary key,"companyId" text,"active" bool',
  Sale:'"id" text primary key,"companyId" text,"storeId" text,"status" text,"transactionMode" text,"source" text,"occurredAt" timestamp,"originalSaleId" text',
  SaleLine:'"id" text primary key,"saleId" text,"productId" text,"description" text,"quantity" numeric,"unitPrice" numeric,"discount" numeric,"vatRate" numeric,"lineTotal" numeric,"promotionId" text,"promotionType" text',
  PurchaseDocumentLine:'"purchaseDocumentId" text,"productId" text,"unit" text,"unitCost" numeric,"unitsPerPackage" numeric',
  PurchaseDocument:'"id" text,"supplierId" text,"companyId" text,"storeId" text,"status" text,"documentDate" timestamp,"createdAt" timestamp',
  Supplier:'"id" text,"name" text'
 };
 for(const [name,columns] of Object.entries(definitions))await db.$executeRawUnsafe(`CREATE TABLE "${name}"(${columns})`);
 await db.$executeRaw`INSERT INTO "Store" VALUES('s','c','LAB',true),('control','c','CONTROL',true),('foreign','x','FOREIGN',true),('inactive','c','INACTIVE',false)`;
 for(const [id,unit] of [['p','PIECE'],['kg','KG'],['litre','LITER'],['pack','PACKAGE'],['unknown',null]])await db.$executeRaw`INSERT INTO "Product" VALUES(${id},'c',${id},${id},${unit},NULL,NULL,.25)`;
 await db.$executeRaw`INSERT INTO "PriceCatalogPromotion" VALUES('promo','c',false)`;
 const sale=async(id,date,{store='s',company='c',source='POS',status='COMPLETED',mode='NORMAL'}={})=>db.$executeRaw`INSERT INTO "Sale" VALUES(${id},${company},${store},${status},${mode},${source},${new Date(date)},NULL)`;
 const line=async(id,saleId,productId,{quantity=1,total=2,promo=null}={})=>db.$executeRaw`INSERT INTO "SaleLine" VALUES(${id},${saleId},${productId},${productId},${quantity},2,0,0,${total},${promo},${promo?'LEAFLET':null})`;
 const read=(first,last=first,extra={})=>{const calendar=salesReportCalendar(first,last);return readSalesAnalysisReport({companyId:'c',storeId:'s',from:calendar.from,to:calendar.to,calendar,includeHourly:true,...extra},{db})};
 const digest=()=>Promise.all(Object.keys(definitions).map(async name=>(await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count,md5(COALESCE(string_agg(row_to_json(t)::text,',' ORDER BY row_to_json(t)::text),'')) AS digest FROM "${name}" t`))[0]));
 const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
 const privateFree=value=>{if(Array.isArray(value))value.forEach(privateFree);else if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){assert.ok(!key.startsWith('_'),`private field ${key}`);privateFree(child)}};
 // A basket appears once even when several rows and units occur in its hour.
 await sale('basket','2026-10-10T10:00:00Z');
 for(const [id,quantity] of [['p',3],['kg',1.5],['litre',.25],['pack',2],['unknown',4]])await line('b-'+id,'basket',id,{quantity,promo:id==='p'?'promo':null});
 await line('duplicate-p','basket','p',{quantity:2});
 await sale('reverse','2026-10-10T10:30:00Z',{source:'POS_REVERSAL'});await line('rp','reverse','p',{quantity:-1,total:-2,promo:'promo'});await line('rk','reverse','kg',{quantity:-.5,total:-1});
 await sale('later','2026-10-10T11:00:00Z');await line('later','later','p');
 for(const [id,options] of [['other',{store:'control'}],['foreign',{company:'x',store:'foreign'}],['draft',{status:'OPEN'}],['credit',{mode:'CREDIT'}]]){await sale(id,'2026-10-10T10:00:00Z',options);await line(id,id,'p',{total:999})}
 const initial=await digest();let out=await read('2026-10-10');
 assert.equal(out.hourlyActivity.complete,true);assert.equal(out.hourlyActivity.totalsScope,'COMPLETE_FILTERED_SOURCE');assert.equal(out.hourlyActivity.bucketBasis,'UTC_HOUR');assert.equal(out.hourlyActivity.timeZone,'Europe/Athens');
 assert.equal(out.hourlyActivity.normalSaleCount,2);assert.equal(out.hourlyActivity.reversalCount,1);assert.equal(out.normalSaleCount,2);assert.equal(out.reversalCount,1);
 const hour=out.hourlyActivity.hours.find(h=>h.from==='2026-10-10T10:00:00.000Z');assert.ok(hour);assert.equal(hour.normalSaleCount,1);assert.equal(hour.reversalCount,1);assert.equal(hour.localStart,'2026-10-10T13:00:00');assert.equal(hour.utcOffsetSeconds,10800);assert.equal(hour.toExclusive,'2026-10-10T11:00:00.000Z');
 assert.equal(hour.quantities.length,5);assert.ok(!('totalQuantity' in out.hourlyActivity));
 for(const [unit,normal,reversal,net] of [['PIECE',5,-1,4],['KG',1.5,-.5,1],['LITER',.25,0,.25],['PACKAGE',2,0,2],[null,4,0,4]]){const q=hour.quantities.find(q=>q.unit===unit);assert.ok(q,`unit ${unit}`);close(q.normalQuantity,normal);close(q.reversalQuantity,reversal);close(q.netQuantity,net)}
 const calendar=salesReportCalendar('2026-10-10','2026-10-10');const plain=await readSalesAnalysisReport({companyId:'c',storeId:'s',from:calendar.from,to:calendar.to,calendar},{db});const {hourlyActivity,...legacy}=out;assert.deepEqual(legacy,plain);assert.ok(!('hourlyActivity' in plain));privateFree(out);
 for(const extra of [{q:'kg'},{productIds:['p']},{promotionsOnly:true},{observedThrough:new Date('2026-10-10T10:15:00Z')}]){const result=await read('2026-10-10','2026-10-10',extra);assert.equal(result.hourlyActivity.normalSaleCount,extra.observedThrough?1:extra.q?1:extra.productIds?2:1);assert.equal(result.hourlyActivity.reversalCount,extra.observedThrough?0:1);assert.equal(result.hourlyActivity.hours.reduce((s,h)=>s+h.normalSaleCount,0),result.normalSaleCount);assert.equal(result.hourlyActivity.hours.reduce((s,h)=>s+h.reversalCount,0),result.reversalCount);privateFree(result)}
 const empty=await read('2026-10-10','2026-10-10',{q:'not-present'});assert.deepEqual(empty.hourlyActivity.hours,[]);assert.equal(empty.hourlyActivity.normalSaleCount,0);assert.equal(empty.hourlyActivity.reversalCount,0);assert.equal(empty.hourlyActivity.complete,true);assert.deepEqual(empty.items,[]);
 assert.deepEqual(await digest(),initial);
 // Half-open Athens day boundaries, both discontinuities, exact observation fence.
 for(const [date,instants] of [
  ['2026-03-29',['2026-03-28T21:59:59.999Z','2026-03-28T22:00:00Z','2026-03-29T00:30:00Z','2026-03-29T01:30:00Z','2026-03-29T20:59:59.999Z','2026-03-29T21:00:00Z']],
  ['2026-10-25',['2026-10-24T20:59:59.999Z','2026-10-24T21:00:00Z','2026-10-25T00:30:00Z','2026-10-25T01:30:00Z','2026-10-25T21:59:59.999Z','2026-10-25T22:00:00Z']]
 ]){for(let i=0;i<instants.length;i++){const id=date+'-'+i;await sale(id,instants[i]);await line(id,id,'p')}
  const before=await digest(),result=await read(date);assert.equal(result.normalSaleCount,4);assert.equal(result.hourlyActivity.normalSaleCount,4);assert.equal(result.hourlyActivity.hours.reduce((sum,h)=>sum+h.normalSaleCount,0),4);
  if(date==='2026-03-29'){assert.equal(Date.parse(result.hourlyActivity.toExclusive)-Date.parse(result.hourlyActivity.from),23*3600000);assert.ok(result.hourlyActivity.hours.every(h=>!h.localStart.startsWith('2026-03-29T03:')))}else{assert.equal(Date.parse(result.hourlyActivity.toExclusive)-Date.parse(result.hourlyActivity.from),25*3600000);const repeated=result.hourlyActivity.hours.filter(h=>h.localStart.startsWith('2026-10-25T03:'));assert.equal(repeated.length,2);assert.deepEqual(repeated.map(h=>h.utcOffsetSeconds).sort((a,b)=>a-b),[7200,10800]);assert.equal(new Set(repeated.map(h=>h.from)).size,2)}
  const observed=await read(date,date,{observedThrough:new Date(instants[2])});assert.equal(observed.normalSaleCount,2);assert.equal(observed.hourlyActivity.normalSaleCount,2);assert.deepEqual(await digest(),before);
 }
 if(http){
  // Mount the actual production router, replacing only its database transport
  // with this isolated schema. The real filters and role middleware execute.
  const originalQuery=prisma.$queryRaw;prisma.$queryRaw=db.$queryRaw.bind(db);
  const users={owner:{role:'OWNER',companyId:'c'},admin:{role:'ADMIN',companyId:'c'},manager:{role:'MANAGER',companyId:'c'},sa:{role:'SUPER_ADMIN',companyId:'c'},foreign:{role:'OWNER',companyId:'x'},staff:{role:'EMPLOYEE',companyId:'c'},operator:{role:'OWNER',companyId:'c',tokenType:'STORE_OPERATOR'}};
  const app=express();app.use((req,res,next)=>{req.user=users[req.get('x-fixture-user')];return req.user?next():res.status(401).end()});app.use('/reports',router);app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const request=async(user,overrides={})=>{const query=new URLSearchParams({from:'2026-10-10',to:'2026-10-10',timeZone:'Europe/Athens',includeHourly:'1',storeId:'s',...overrides});for(const [key,value]of Object.entries(overrides))if(value===null)query.delete(key);const res=await fetch(`http://127.0.0.1:${server.address().port}/reports/sales-analysis?${query}`,{headers:{'x-fixture-user':user}});return {status:res.status,body:await res.json()}};
  const before=await digest();try{
   for(const user of ['owner','admin','manager','sa']){const r=await request(user);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.hourlyActivity.normalSaleCount,2);privateFree(r.body)}
   for(const [user,query,status]of [['staff',{},403],['operator',{},403],['owner',{storeId:''},400],['owner',{storeId:null},400],['owner',{storeId:'foreign'},404],['foreign',{},404],['owner',{storeId:'inactive'},404],['owner',{storeId:'missing'},404],['owner',{timeZone:null},400],['owner',{timeZone:'UTC'},400]]){const r=await request(user,query);assert.equal(r.status,status,JSON.stringify(r));assert.ok(!('hourlyActivity' in r.body));assert.ok(!('items' in r.body))}
   assert.deepEqual(await digest(),before);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));prisma.$queryRaw=originalQuery}
 }
 // The product limit never truncates full filtered hourly basket counts.
 await db.$executeRawUnsafe(`INSERT INTO "Sale" SELECT 'cap-sale-'||g,'c','s','COMPLETED','NORMAL','POS','2026-10-11T10:00:00'::timestamp,NULL FROM generate_series(1,10001)g`);
 await db.$executeRawUnsafe(`INSERT INTO "SaleLine" SELECT 'cap-line-'||g,'cap-sale-'||g,'cap-product-'||g,'cap-'||g,1,1,0,0,1,NULL,NULL FROM generate_series(1,10001)g`);
 const capBefore=await digest();out=await read('2026-10-11');assert.equal(out.items.length,10000);assert.equal(out.totalGross,10000);assert.equal(out.sourceCoverage.complete,false);assert.equal(out.hourlyActivity.complete,true);assert.equal(out.hourlyActivity.normalSaleCount,10001);assert.equal(out.hourlyActivity.hours[0].normalSaleCount,10001);assert.equal(out.hourlyActivity.hours[0].quantities[0].unit,null);assert.equal(out.hourlyActivity.hours[0].quantities[0].netQuantity,10001);privateFree(out);assert.deepEqual(await digest(),capBefore);
 // A new unit vocabulary above the declared per-hour bound fails closed.
 for(let i=0;i<33;i++)await db.$executeRaw`INSERT INTO "Product" VALUES(${'unit-'+i},'c',${'unit-'+i},${'unit-'+i},${'UNIT_'+i},NULL,NULL,.25)`;
 await sale('unit-cap','2026-10-12T10:00:00Z');
 for(let i=0;i<33;i++)await line('unit-cap-'+i,'unit-cap','unit-'+i);
 const unitsBefore=await digest();await assert.rejects(read('2026-10-12'),error=>error.status===502);assert.deepEqual(await digest(),unitsBefore);
}
test('native hourly canonical SQL and mounted HTTP: Athens DST, distinct baskets, separate units, caps and read-only authorization',{skip:!isolated(),timeout:120000},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='sales_hourly_'+randomUUID().replaceAll('-','');const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);await runSalesHourlyRegression(db)}finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
