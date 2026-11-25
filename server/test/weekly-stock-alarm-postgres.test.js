import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import express from 'express';
import {selectedStoreLifecycleManifest} from '../src/services/store-lifecycle-manifest.js';
import {ensureWeeklyStockAlarmSchema,weeklyStockAlarmReadiness} from '../src/services/weekly-stock-alarm-schema.js';
import {runWeeklyStockAlarmBatch,readStockAlarmPolicy,stockAlarmRows,readWeeklyStockAlarmState} from '../src/services/weekly-stock-alarm.js';
const url=process.env.WEEKLY_STOCK_ALARM_TEST_DATABASE_URL||process.env.DATABASE_URL;
test('weekly stock alarm actual PostgreSQL: settings, replay, overrides, audit, tenant/grant HTTP', {skip:!url||process.env.NODE_ENV!=='test',timeout:60000},async t=>{
 const parsed=new URL(url);assert.ok(['localhost','127.0.0.1','[::1]'].includes(parsed.hostname));assert.match(parsed.pathname,/_test$/);assert.equal(process.env.NODE_ENV,'test');
 const schema='weekly_'+randomUUID().replaceAll('-',''),admin=new PrismaClient({datasourceUrl:url}),previous=process.env.DATABASE_URL,now=new Date('2026-11-24T10:00:00Z');let db,server;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);parsed.searchParams.set('schema',schema);process.env.DATABASE_URL=parsed.href;db=new PrismaClient({datasourceUrl:parsed.href});
  const tables={Company:'"id" TEXT PRIMARY KEY,"name" TEXT,"active" BOOLEAN,"licenseStatus" TEXT,"subscriptionEndsAt" TIMESTAMP',CompanyModule:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"moduleKey" TEXT,"active" BOOLEAN,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP',Store:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT,"active" BOOLEAN',StorePaidModule:'"id" TEXT PRIMARY KEY,"storeId" TEXT,"moduleKey" TEXT,"active" BOOLEAN,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP',Product:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT,"sku" TEXT,"unit" TEXT,"active" BOOLEAN,"trackStock" BOOLEAN,"createdAt" TIMESTAMP',StoreProduct:'"id" TEXT PRIMARY KEY,"storeId" TEXT,"productId" TEXT,"currentStock" NUMERIC,"minStock" NUMERIC,"active" BOOLEAN,"createdAt" TIMESTAMP,"updatedAt" TIMESTAMP',Recipe:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"productId" TEXT,"active" BOOLEAN',PreparationRecipeLine:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"productId" TEXT,"automatic" BOOLEAN',Sale:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"status" TEXT,"source" TEXT,"occurredAt" TIMESTAMP',SaleLine:'"id" TEXT PRIMARY KEY,"saleId" TEXT,"productId" TEXT,"quantity" NUMERIC',Employee:'"id" TEXT PRIMARY KEY,"storeId" TEXT,"active" BOOLEAN',StoreOperatorCredential:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"employeeId" TEXT,"active" BOOLEAN',StoreOperatorProfile:'"companyId" TEXT,"storeId" TEXT,"employeeId" TEXT,"permissions" JSONB,"posAccess" BOOLEAN'};
  for(const [name,cols] of Object.entries(tables))await db.$executeRawUnsafe(`CREATE TABLE "${name}" (${cols})`);
  await ensureWeeklyStockAlarmSchema(db);await ensureWeeklyStockAlarmSchema(db);
  await db.$executeRawUnsafe(`INSERT INTO "Company" VALUES ('a','A',true,'ACTIVE',NULL),('b','B',true,'ACTIVE',NULL);`);
  await db.$executeRawUnsafe(`INSERT INTO "Store" VALUES ('a1','a','A1',true),('a2','a','A2',true),('b1','b','B1',true)`);
  await db.$executeRawUnsafe(`INSERT INTO "CompanyModule" VALUES ('m','a','ORDER_SUGGESTIONS',true,NULL,NULL)`);
  await db.$executeRawUnsafe(`INSERT INTO "Product" VALUES ('p','a','Water','P','PIECE',true,true,'2026-01-01'),('q','b','Foreign','Q','PIECE',true,true,'2026-01-01')`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreProduct" VALUES ('sp','a1','p',20,5,true,'2026-01-01',NULL),('control','a2','p',100,7,true,'2026-01-01',NULL),('foreign','b1','q',80,9,true,'2026-01-01',NULL)`);
  await db.$executeRawUnsafe(`INSERT INTO "Sale" VALUES ('s','a','a1','COMPLETED','POS','2026-11-23'),('r','a','a1','COMPLETED','POS_REVERSAL','2026-11-23'),('w','a','a1','COMPLETED','WASTE','2026-11-23'),('f','a','a2','COMPLETED','POS','2026-11-23')`);
  await db.$executeRawUnsafe(`INSERT INTO "SaleLine" VALUES ('l','s','p',168),('rl','r','p',28),('wl','w','p',500),('fl','f','p',500)`);
  const settings={enabled:true,historyDays:28,leadDays:3,safetyDays:2,floor:0};
  await db.$executeRaw`INSERT INTO "WeeklyStockAlarmPolicy" ("companyId","scope","settings") VALUES ('a','COMPANY',${JSON.stringify(settings)}::jsonb)`;
  await t.test('computed minimum is 25; stock and other stores unchanged; weekly retry no second write',async()=>{
   const results=await Promise.all([runWeeklyStockAlarmBatch(db,{companyId:'a',storeId:'a1',now}),runWeeklyStockAlarmBatch(db,{companyId:'a',storeId:'a1',now})]);assert.equal(results.reduce((sum,r)=>sum+r.processed,0),1);
   const [row]=await db.$queryRaw`SELECT "minStock","currentStock" FROM "StoreProduct" WHERE "id"='sp'`;assert.equal(Number(row.minStock),25);assert.equal(Number(row.currentStock),20);
   assert.equal((await runWeeklyStockAlarmBatch(db,{companyId:'a',storeId:'a1',now})).processed,0);
   const controls=await db.$queryRaw`SELECT "id","minStock","currentStock" FROM "StoreProduct" WHERE "id" IN ('control','foreign') ORDER BY "id"`;assert.deepEqual(controls.map(x=>[x.id,Number(x.minStock),Number(x.currentStock)]),[['control',7,100],['foreign',9,80]]);
   assert.equal((await db.$queryRaw`SELECT COUNT(*)::int n FROM "WeeklyStockAlarmHistory"`)[0].n,1);
  });
  await t.test('unknown availability prevents a low-sales week from lowering the live minimum',async()=>{await db.$executeRaw`UPDATE "SaleLine" SET "quantity"=0 WHERE "id" IN ('l','rl')`;await runWeeklyStockAlarmBatch(db,{companyId:'a',storeId:'a1',now:new Date('2026-12-01T10:00:00Z')});assert.equal((await db.$queryRaw`SELECT "details" FROM "WeeklyStockAlarmHistory" WHERE "week"='2026-11-30' AND "productId"='p'`)[0].details.reason,'DECREASE_REQUIRES_COMPLETE_HISTORY');assert.equal(Number((await db.$queryRaw`SELECT "minStock" FROM "StoreProduct" WHERE "id"='sp'`)[0].minStock),25)});
  await t.test('later manual minimum is detected, frozen, and auditable',async()=>{
   await db.$executeRaw`UPDATE "StoreProduct" SET "minStock"=12 WHERE "id"='sp'`;
   await runWeeklyStockAlarmBatch(db,{companyId:'a',storeId:'a1',now:new Date('2026-12-08T10:00:00Z')});
   assert.equal(Number((await db.$queryRaw`SELECT "minStock" FROM "StoreProduct" WHERE "id"='sp'`)[0].minStock),12);
   assert.equal((await db.$queryRaw`SELECT "mode" FROM "WeeklyStockAlarmProduct"`)[0].mode,'MANUAL');
  });
  await t.test('store OFF overrides inherited company ON, company/store isolation and module gate',async()=>{
   await db.$executeRaw`INSERT INTO "WeeklyStockAlarmPolicy" ("companyId","scope","settings") VALUES ('a','a2',${JSON.stringify({...settings,enabled:false})}::jsonb)`;
   assert.equal((await readStockAlarmPolicy(db,'a','a2')).settings.enabled,false);
   assert.equal((await runWeeklyStockAlarmBatch(db,{companyId:'a',storeId:'a2',now})).status,'OFF');
   assert.equal((await runWeeklyStockAlarmBatch(db,{companyId:'a',storeId:'b1',now})).status,'INACTIVE');
   assert.equal((await runWeeklyStockAlarmBatch(db,{companyId:'b',storeId:'b1',now})).status,'MODULE_OFF');
   await db.$executeRaw`UPDATE "WeeklyStockAlarmPolicy" SET "settings"=${JSON.stringify(settings)}::jsonb WHERE "scope"='a2'`;
   await db.$executeRaw`UPDATE "WeeklyStockAlarmPolicy" SET "settings"=${JSON.stringify({...settings,enabled:false})}::jsonb WHERE "scope"='COMPANY'`;
   assert.equal((await runWeeklyStockAlarmBatch(db,{companyId:'a',storeId:'a2',now})).status,'OFF');
   await db.$executeRaw`UPDATE "WeeklyStockAlarmPolicy" SET "settings"=${JSON.stringify(settings)}::jsonb WHERE "scope"='COMPANY'`;
  });
  await db.$executeRawUnsafe(`INSERT INTO "Employee" VALUES ('e','a1',true)`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreOperatorCredential" VALUES ('op','a','a1','e',true)`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreOperatorProfile" VALUES ('a','a1','e','{"orderSuggestionsPos":true}',true)`);
  const {createWeeklyStockAlarmRouter}=await import('../src/routes/weekly-stock-alarm.js');
  const router=createWeeklyStockAlarmRouter({db,readiness:async()=>({ready:true})});
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.user=req.get('x-actor')==='owner'?{id:'owner',companyId:'a',role:'OWNER'}:{id:'op',operatorId:'op',companyId:'a',storeId:'a1',tokenType:'STORE_OPERATOR',role:'EMPLOYEE',permissions:[]};next()});app.use('/unadmitted',createWeeklyStockAlarmRouter({db}));app.use(router);app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const root=`http://127.0.0.1:${server.address().port}`;
  const request=async(path,options={})=>fetch(root+path,options);
  await t.test('operator cannot manage weekly settings',async()=>{assert.equal((await request('/stores/a1/settings')).status,403);assert.equal((await request('/stores/a1/permission')).status,404)});
  await t.test('preview search and cursor cover products beyond the first page without writes',async()=>{
   await db.$executeRawUnsafe(`INSERT INTO "Product" SELECT 'page-'||lpad(n::text,3,'0'),'a','Page product '||n,'PAGE-'||n,'PIECE',true,true,'2026-01-01'::timestamp FROM generate_series(1,105) n`);
   await db.$executeRawUnsafe(`INSERT INTO "StoreProduct" SELECT 'sp-'||p."id",'a1',p."id",10,2,true,'2026-01-01',NULL FROM "Product" p WHERE p."id" LIKE 'page-%'`);
   const headers={'x-actor':'owner'};
   const first=await (await request('/stores/a1/preview',{headers})).json();assert.equal(first.rows.length,100);assert.ok(first.nextAfter);
   const next=await (await request('/stores/a1/preview?after='+encodeURIComponent(first.nextAfter),{headers})).json();assert.equal(next.rows.length,6);assert.equal(next.nextAfter,null);
   const selected=await (await request('/stores/a1/preview?q=PAGE-105',{headers})).json();assert.equal(selected.rows.length,1);assert.equal(selected.rows[0].sku,'PAGE-105');
   const bad=await (await request('/stores/a1/preview?q='+encodeURIComponent("';DROP TABLE Product;--"),{headers})).json();assert.equal(bad.rows.length,0);
  });
  await t.test('unadmitted production profile blocks central schema use while POS remains independent',async()=>{
   const headers={'x-actor':'owner'};
   assert.equal((await request('/unadmitted/stores/a1/settings',{headers})).status,503);
   assert.equal((await request('/unadmitted/stores/a1/permission',{headers})).status,404);
   const state=await weeklyStockAlarmReadiness(db,{manifest:()=>selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V3__WEEKLY_STOCK_ALARM_V1'})});assert.equal(state.ready,true);
  });
  await t.test('owner policy optimistic conflict is 409 and tenant mismatch rejected',async()=>{
   const body={scope:'STORE',expectedVersion:0,settings:{...settings,enabled:false}},headers={'x-actor':'owner','content-type':'application/json'};
   assert.equal((await request('/stores/a1/settings',{method:'PUT',headers,body:JSON.stringify(body)})).status,200);
   assert.equal((await request('/stores/a1/settings',{method:'PUT',headers,body:JSON.stringify(body)})).status,409);
   assert.equal((await request('/stores/b1/settings',{headers})).status,404);
   const res=await request('/stores/a1/settings',{headers}),data=await res.json();assert.equal(res.status,200);assert.equal(data.policy.settings.enabled,false);
  });

  await t.test('runtime policy state is enabled only after real catalogue admission and respects company OFF',async()=>{
   const previous=process.env.MWS_STORE_LIFECYCLE_PROFILE;
   try{
    process.env.MWS_STORE_LIFECYCLE_PROFILE='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V3__WEEKLY_STOCK_ALARM_V1';
    const state=await readWeeklyStockAlarmState(db,{companyId:'a',storeId:'a2'});assert.deepEqual(state,{available:true,enabled:true,reason:null});
    await db.$executeRaw`UPDATE "WeeklyStockAlarmPolicy" SET "settings"=${JSON.stringify({...settings,enabled:false})}::jsonb WHERE "scope"='COMPANY'`;
    assert.equal((await readWeeklyStockAlarmState(db,{companyId:'a',storeId:'a2'})).enabled,false);
    await db.$executeRaw`UPDATE "WeeklyStockAlarmPolicy" SET "settings"=${JSON.stringify(settings)}::jsonb WHERE "scope"='COMPANY'`;
   }finally{if(previous===undefined)delete process.env.MWS_STORE_LIFECYCLE_PROFILE;else process.env.MWS_STORE_LIFECYCLE_PROFILE=previous}
  });
  await t.test('rolling sales bounds remain UTC under both database time zones',async()=>{
   await db.$executeRawUnsafe(`INSERT INTO "Product" VALUES ('boundary','a','Boundary','BOUND','PIECE',true,true,'2026-01-01')`);
   await db.$executeRawUnsafe(`INSERT INTO "StoreProduct" VALUES ('boundary','a1','boundary',10,0,true,'2026-01-01',NULL)`);
   await db.$executeRawUnsafe(`INSERT INTO "Sale" VALUES ('b-start','a','a1','COMPLETED','POS','2026-10-27 10:00:00'),('b-last','a','a1','COMPLETED','POS','2026-11-24 09:59:59.999999'),('b-before','a','a1','COMPLETED','POS','2026-10-27 09:59:59.999999'),('b-end','a','a1','COMPLETED','POS','2026-11-24 10:00:00')`);
   await db.$executeRawUnsafe(`INSERT INTO "SaleLine" VALUES ('b1','b-start','boundary',10),('b2','b-last','boundary',20),('b3','b-before','boundary',100),('b4','b-end','boundary',200)`);
   for(const timezone of ['UTC','Europe/Athens']){
    const rows=await db.$transaction(async tx=>{await tx.$executeRawUnsafe(timezone==='UTC'?"SET LOCAL TIME ZONE 'UTC'":"SET LOCAL TIME ZONE 'Europe/Athens'");return stockAlarmRows(tx,{companyId:'a',storeId:'a1',settings,now,query:'Boundary'})});assert.equal(rows.length,1);assert.equal(Number(rows[0].soldQuantity),30);
   }
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));if(db)await db.$disconnect();const {prisma}=await import('../src/prisma.js');await prisma.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();if(previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previous;}
});
