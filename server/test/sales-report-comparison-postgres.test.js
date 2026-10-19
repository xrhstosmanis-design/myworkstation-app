import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import express from 'express';
import {prisma} from '../src/prisma.js';
import router,{readSalesAnalysisReport} from '../src/routes/kiosk-reports-sales-v4.js';
import {salesReportCalendar} from '../src/services/sales-report-calendar.js';
import {readSalesReportComparison} from '../src/services/sales-report-comparison.js';

const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};

// Real Prisma transaction, canonical SQL and production HTTP router. Tables are
// isolated synthetic fixtures; this test never accesses a production schema.
export async function runSalesComparisonRegression(db,{http=true}={}){
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
 for(const[name,columns]of Object.entries(definitions))await db.$executeRawUnsafe(`CREATE TABLE "${name}"(${columns})`);
 await db.$executeRaw`INSERT INTO "Store" VALUES('s','c','LAB fixture',true),('control','c','Control',true),('foreign','x','Foreign',true),('inactive','c','Inactive',false)`;
 await db.$executeRaw`INSERT INTO "Product" VALUES('piece','c','Exact piece','PIECE-SKU','PIECE',NULL,NULL,.25),('kg','c','Exact weight','KG-SKU','KG',NULL,NULL,.5)`;
 await db.$executeRaw`INSERT INTO "PriceCatalogPromotion" VALUES('promo','c',false)`;
 const sale=async(id,date,{store='s',company='c',source='POS',status='COMPLETED',mode='NORMAL'}={})=>db.$executeRaw`INSERT INTO "Sale" VALUES(${id},${company},${store},${status},${mode},${source},${new Date(date)},NULL)`;
 const line=async(id,saleId,productId,{quantity=1,total=1,promo=null}={})=>db.$executeRaw`INSERT INTO "SaleLine" VALUES(${id},${saleId},${productId},${productId},${quantity},1,0,0,${total},${promo},${promo?'LEAFLET':null})`;
 const digest=()=>Promise.all(Object.keys(definitions).map(async name=>(await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count,md5(COALESCE(string_agg(row_to_json(t)::text,',' ORDER BY row_to_json(t)::text),'')) AS digest FROM "${name}" t`))[0]));
 const filters=(day,previous,extra={})=>{const calendar=salesReportCalendar(day,day);return{companyId:'c',storeId:'s',from:calendar.from,to:calendar.to,calendar,compareFrom:previous,compareTo:previous,...extra}};
 const now=new Date('2026-11-02T10:00:00.000Z');
 const read=(day,previous,extra={})=>readSalesReportComparison(filters(day,previous,extra),{db,readReport:readSalesAnalysisReport,now});
 const available=(out,current,previous,delta,percent,reason=null)=>{const c=out.comparison;assert.equal(c.status,'AVAILABLE');assert.equal(c.policy,'EQUAL_ENDED_ATHENS_CALENDAR_DAYS');assert.equal(c.timeZone,'Europe/Athens');assert.equal(c.storeId,'s');assert.equal(c.companyId,'c');assert.equal(c.dayCount,1);assert.equal(c.currentGrossCents,current);assert.equal(c.previousGrossCents,previous);assert.equal(c.deltaGrossCents,delta);assert.equal(c.revenueChangePercent,percent);assert.equal(c.percentUnavailableReason,reason);assert.equal(c.financialFinality,'PROVISIONAL');assert.equal(c.financialReconciliationComplete,false);assert.ok(c.basisLimitations.includes('NOT_WEEKDAY_OR_SEASONAL_EQUIVALENCE'));assert.ok(c.basisLimitations.includes('NOT_FINAL_FINANCIAL_RECONCILIATION'));};
 const limited=out=>{assert.equal(out.comparison.status,'SOURCE_LIMITED');assert.equal(out.comparison.unavailableReason,'SOURCE_LIMITED');for(const key of ['currentGrossCents','previousGrossCents','deltaGrossCents','revenueChangePercent'])assert.equal(key in out.comparison,false,key);};
 const privateFree=value=>{if(Array.isArray(value))value.forEach(privateFree);else if(value&&typeof value==='object')for(const[key,child]of Object.entries(value)){assert.ok(!key.startsWith('_'),`private field ${key}`);privateFree(child)}};

 // Exact UTC boundaries are Athens midnight, not raw 24-hour shifts.
 const current=salesReportCalendar('2026-10-10','2026-10-10'),prior=salesReportCalendar('2026-10-09','2026-10-09');
 await sale('before',new Date(+prior.from-1).toISOString());await line('before','before','piece',{total:999});
 await sale('prior-start',prior.from.toISOString());await line('prior','prior-start','piece',{total:50,promo:'promo'});
 await sale('current-start',current.from.toISOString());await line('current-piece','current-start','piece',{quantity:3,total:60,promo:'promo'});await line('current-kg','current-start','kg',{quantity:1.5,total:40});
 await sale('current-reversal','2026-10-10T10:00:00.000Z',{source:'POS_REVERSAL'});await line('reversal','current-reversal','piece',{quantity:-1,total:-20,promo:'promo'});
 await sale('at-current-end',current.to.toISOString());await line('after','at-current-end','piece',{total:999});
 for(const[id,options]of [['control',{store:'control'}],['foreign',{company:'x',store:'foreign'}],['open',{status:'OPEN'}],['credit',{mode:'CREDIT'}],['inactive',{store:'inactive'}]]){await sale(id,'2026-10-10T09:00:00.000Z',options);await line(id,id,'piece',{total:777})}
 let before=await digest(),out=await read('2026-10-10','2026-10-09');available(out,8000,5000,3000,60);assert.equal(out.totalGross,80);assert.equal(out.normalSaleCount,1);assert.equal(out.reversalCount,1);assert.equal(out.items.length,2);assert.equal(out.comparison.asOf,now.toISOString());privateFree(out);
 assert.equal(out.comparison.currentPeriod.from,current.from.toISOString());assert.equal(out.comparison.currentPeriod.toExclusive,current.to.toISOString());assert.equal(out.comparison.previousPeriod.from,prior.from.toISOString());assert.equal(out.comparison.previousPeriod.toExclusive,prior.to.toISOString());
 // Both canonical calls must use the very same actual Prisma transaction.
 const calls=[];
 const coordinated=await readSalesReportComparison(filters('2026-10-10','2026-10-09',{includeHourly:true}),{db,now,readReport:async(args,options)=>{calls.push({args,tx:options.db});assert.equal((await options.db.$queryRawUnsafe('SHOW transaction_isolation'))[0].transaction_isolation,'repeatable read');return readSalesAnalysisReport(args,options)}});
 available(coordinated,8000,5000,3000,60);assert.equal(calls.length,2);assert.equal(calls[0].tx,calls[1].tx);assert.notEqual(calls[0].tx,db);assert.equal(calls[0].args.includeHourly,true);assert.ok(!calls[1].args.includeHourly);assert.equal(coordinated.hourlyActivity.complete,true);
 const plain=await readSalesAnalysisReport(filters('2026-10-10','2026-10-09'),{db});const {comparison,...legacy}=out;assert.deepEqual(legacy,plain);assert.equal('comparison' in plain,false);
 available(await read('2026-10-10','2026-10-09',{q:'PIECE-SKU'}),4000,5000,-1000,-20);
 available(await read('2026-10-10','2026-10-09',{productIds:['piece']}),4000,5000,-1000,-20);
 available(await read('2026-10-10','2026-10-09',{promotionsOnly:true}),4000,5000,-1000,-20);
 available(await read('2026-10-10','2026-10-09',{q:'not-present'}),0,0,0,null,'ZERO_BASE');
 await assert.rejects(readSalesReportComparison(filters('2026-10-10','2026-10-09'),{db,readReport:readSalesAnalysisReport,now:new Date(+current.to-1)}),error=>error.status===400);available(await readSalesReportComparison(filters('2026-10-10','2026-10-09'),{db,readReport:readSalesAnalysisReport,now:current.to}),8000,5000,3000,60);assert.deepEqual(await digest(),before);

 await sale('negative','2026-10-07T10:00:00.000Z',{source:'POS_REVERSAL'});await line('negative','negative','piece',{quantity:-1,total:-5});
 before=await digest();available(await read('2026-10-10','2026-10-06'),8000,0,8000,null,'ZERO_BASE');available(await read('2026-10-10','2026-10-07'),8000,-500,8500,null,'NEGATIVE_BASE');available(await read('2026-10-07','2026-10-06'),-500,0,-500,null,'ZERO_BASE');assert.deepEqual(await digest(),before);

 // Equal one-calendar-day comparisons allow 23/25 elapsed hours. Real query
 // fixtures at every half-open edge detect an accidental UTC-duration shift.
 for(const[day,previous,hours]of [['2026-03-29','2026-03-28',23],['2026-10-25','2026-10-24',25]]){
  const a=salesReportCalendar(day,day),b=salesReportCalendar(previous,previous);
  for(const[id,date,total]of [['prior-begin',b.from,10],['prior-last',new Date(+b.to-1),5],['current-begin',a.from,20],['current-last',new Date(+a.to-1),10],['after',a.to,999]]){const key=day+'-'+id;await sale(key,date.toISOString());await line(key,key,'piece',{total})}
  const snapshot=await digest(),result=await read(day,previous);available(result,3000,1500,1500,100);assert.equal(result.comparison.currentPeriod.elapsedHours,hours);assert.equal(result.comparison.previousPeriod.elapsedHours,24);assert.equal(result.comparison.previousPeriod.from,b.from.toISOString());assert.equal(result.comparison.previousPeriod.toExclusive,b.to.toISOString());assert.deepEqual(await digest(),snapshot);
 }

 if(http){
  // Replace only database transport. Production router/role/policy/filter code
  // runs unchanged; query parameters cannot supply the trusted service clock.
  const originalQuery=prisma.$queryRaw,originalTransaction=prisma.$transaction;
  prisma.$queryRaw=db.$queryRaw.bind(db);prisma.$transaction=db.$transaction.bind(db);
  const users={owner:{role:'OWNER',companyId:'c'},admin:{role:'ADMIN',companyId:'c'},manager:{role:'MANAGER',companyId:'c'},sa:{role:'SUPER_ADMIN',companyId:'c'},foreign:{role:'OWNER',companyId:'x'},staff:{role:'EMPLOYEE',companyId:'c'},operator:{role:'OWNER',companyId:'c',tokenType:'STORE_OPERATOR'}};
  const app=express();app.use((req,res,next)=>{req.user=users[req.get('x-fixture-user')];return req.user?next():res.status(401).end()});app.use('/reports',router);app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const request=async(user,overrides={})=>{const query=new URLSearchParams({from:'2026-10-10',to:'2026-10-10',compareFrom:'2026-10-09',compareTo:'2026-10-09',timeZone:'Europe/Athens',storeId:'s',...overrides});for(const[key,value]of Object.entries(overrides))if(value===null)query.delete(key);const res=await fetch(`http://127.0.0.1:${server.address().port}/reports/sales-analysis?${query}`,{headers:{'x-fixture-user':user}});return{status:res.status,body:await res.json()};};
  before=await digest();try{
   for(const user of ['owner','admin','manager','sa']){const result=await request(user);assert.equal(result.status,200,JSON.stringify(result.body));available(result.body,8000,5000,3000,60);privateFree(result.body)}
   const legacy=await request('owner',{compareFrom:null,compareTo:null});assert.equal(legacy.status,200);assert.equal('comparison' in legacy.body,false);assert.equal(legacy.body.totalGross,80);
   const hourly=await request('owner',{includeHourly:'1'});assert.equal(hourly.status,200);available(hourly.body,8000,5000,3000,60);assert.equal(hourly.body.hourlyActivity.complete,true);
   const filtered=await request('owner',{q:'PIECE-SKU'});assert.equal(filtered.status,200);available(filtered.body,4000,5000,-1000,-20);assert.equal(filtered.body.comparison.query,'PIECE-SKU');
   for(const[user,query,status]of [['staff',{},403],['operator',{},403],['owner',{storeId:''},400],['owner',{storeId:null},400],['owner',{storeId:'foreign'},404],['foreign',{},404],['owner',{storeId:'inactive'},404],['owner',{storeId:'missing'},404],['owner',{timeZone:null},400],['owner',{timeZone:'UTC'},400],['owner',{compareFrom:null},400],['owner',{compareTo:null},400],['owner',{compareFrom:'2026-02-30',compareTo:'2026-02-30'},400],['owner',{compareFrom:'2026-10-10',compareTo:'2026-10-10'},400],['owner',{compareFrom:'2026-10-08',compareTo:'2026-10-09'},400],['owner',{from:'2099-01-02',to:'2099-01-02',compareFrom:'2099-01-01',compareTo:'2099-01-01',now:'2100-01-01',asOf:'2100-01-01'},400]]){const result=await request(user,query);assert.equal(result.status,status,JSON.stringify(result));assert.equal('comparison' in result.body,false);assert.equal('items' in result.body,false)}
   assert.deepEqual(await digest(),before);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));prisma.$queryRaw=originalQuery;prisma.$transaction=originalTransaction;}
 }

 // A cap in either period suppresses all compared money/percent fields while
 // retaining the current report's original product rows and coverage limits.
 await db.$executeRawUnsafe(`INSERT INTO "Sale" SELECT 'cap-sale-'||g,'c','s','COMPLETED','NORMAL','POS','2026-05-15T10:00:00'::timestamp,NULL FROM generate_series(1,10000)g`);
 await db.$executeRawUnsafe(`INSERT INTO "SaleLine" SELECT 'cap-line-'||g,'cap-sale-'||g,'cap-product-'||g,'cap-'||g,1,1,0,0,1,NULL,NULL FROM generate_series(1,10000)g`);
 before=await digest();out=await read('2026-05-15','2026-05-14');available(out,1000000,0,1000000,null,'ZERO_BASE');assert.equal(out.items.length,10000);assert.equal(out.sourceCoverage.complete,true);assert.deepEqual(await digest(),before);
 await sale('cap-sale-10001','2026-05-15T10:00:00.000Z');await line('cap-line-10001','cap-sale-10001','cap-product-10001');
 before=await digest();out=await read('2026-05-15','2026-05-14');limited(out);assert.equal(out.items.length,10000);assert.equal(out.sourceCoverage.complete,false);assert.equal(out.comparison.coverage.previous.complete,true);assert.equal(out.totalGross,10000);
 const previousCap=await read('2026-05-16','2026-05-15');limited(previousCap);assert.deepEqual(previousCap.items,[]);assert.equal(previousCap.sourceCoverage.complete,true);assert.equal(previousCap.comparison.coverage.previous.complete,false);assert.equal(previousCap.totalGross,0);assert.deepEqual(await digest(),before);
}

test('native canonical sales comparison: one snapshot, ended Athens days, DST, signed totals, scope and full-source caps',{skip:!isolated(),timeout:120000},async()=>{
 const{PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='sales_comparison_'+randomUUID().replaceAll('-','');const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);await runSalesComparisonRegression(db)}finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
