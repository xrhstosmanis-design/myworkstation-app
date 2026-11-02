import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import XLSX from 'xlsx';
import {readInventoryReconciliation} from '../src/services/inventory-reconciliation-source.js';
import {applyInventoryReview} from '../src/services/inventory-reconciliation-reviews.js';
import {createInventoryReconciliationHandler,createInventoryReviewHandler} from '../src/services/inventory-reconciliation-handler.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native reviewed inventory: umbrellas, glasses, source invariance, replay, races, live authority and exports',{skip:!isolated()},async()=>{
  const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema=`inventory_review_test_${randomUUID().replaceAll('-','')}`;
  const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);url.searchParams.set('application_name',schema);
  const db=new PrismaClient({datasourceUrl:url.toString()});let server;
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const definitions=[
      'CREATE TABLE "Company"("id" text primary key,"name" text,"active" bool,"licenseStatus" text,"subscriptionEndsAt" timestamp)',
      'CREATE TABLE "CompanyModule"("id" text primary key,"companyId" text,"moduleKey" text,"active" bool,"startsAt" timestamp,"endsAt" timestamp)',
      'CREATE TABLE "Store"("id" text primary key,"companyId" text,"active" bool)',
      'CREATE TABLE "StorePaidModule"("companyId" text,"storeId" text,"moduleKey" text,"active" bool,"startsAt" timestamptz,"endsAt" timestamptz)',
      'CREATE TABLE "OwnerCompanyAccess"("ownerId" text,"companyId" text)',
      'CREATE TABLE "User"("id" text primary key,"fullName" text,"role" text,"companyId" text,"sessionVersion" int,"mustChangePassword" bool)',
      'CREATE TABLE "UserSession"("id" text primary key,"userId" text,"expiresAt" timestamp,"revokedAt" timestamp)',
      'CREATE TABLE "Stocktake"("id" text primary key,"companyId" text,"storeId" text,"name" text,"status" text,"startedAt" timestamp,"finalizedAt" timestamp)',
      'CREATE TABLE "StocktakeLine"("id" text primary key,"stocktakeId" text,"productId" text,"countedAt" timestamp,"countedQuantity" numeric,"unitCost" numeric)',
      'CREATE TABLE "Product"("id" text primary key,"companyId" text,"name" text,"sku" text)',
      'CREATE TABLE "StoreProduct"("id" text primary key,"storeId" text,"productId" text,"currentStock" numeric)',
      'CREATE TABLE "PurchaseOrder"("id" text primary key,"companyId" text,"storeId" text,"sourceDocumentId" text)',
      'CREATE TABLE "PurchaseDocument"("id" text primary key,"companyId" text,"storeId" text,"documentDate" timestamp,"documentNumber" text,"createdAt" timestamp)',
      'CREATE TABLE "InventoryCountEvent"("id" text primary key,"companyId" text,"storeId" text,"stocktakeId" text,"lineId" text,"eventType" text,"previousQuantity" numeric,"countedQuantity" numeric,"expectedQuantity" numeric,"actorName" text,"source" text,"createdAt" timestamptz)',
      'CREATE TABLE "StockMovement"("id" text primary key,"storeId" text,"productId" text,"movementType" text,"quantity" numeric,"unitCost" numeric,"sourceType" text,"sourceId" text,"idempotencyKey" text,"note" text,"createdAt" timestamp,"createdByUserId" text)',
      'CREATE TABLE "WorkforceAuditLog"("id" text primary key,"companyId" text,"storeId" text,"actorUserId" text,"action" text,"entityType" text,"entityId" text,"afterJson" jsonb,"createdAt" timestamp(3))',
      'CREATE TABLE "StoreTransaction"("id" text primary key,"storeId" text,"amount" numeric)',
      'CREATE TABLE "CashShiftSession"("id" text primary key,"storeId" text,"cash" numeric,"cards" numeric)'
    ];for(const statement of definitions)await db.$executeRawUnsafe(statement);
    for(const sql of [
      `INSERT INTO "Company" VALUES ('c','LAB',true,'ACTIVE',NULL),('other','CONTROL',true,'ACTIVE',NULL)`,
      `INSERT INTO "CompanyModule" VALUES ('inv','c','INVENTORY',true,NULL,NULL),('loss','c','LOSS_DETECTION',true,NULL,NULL),('inv2','other','INVENTORY',true,NULL,NULL),('loss2','other','LOSS_DETECTION',true,NULL,NULL)`,
      `INSERT INTO "Store" VALUES ('s','c',true),('control','c',true),('foreign','other',true)`,
      `INSERT INTO "User" VALUES ('owner','Ελεγκτής','OWNER','c',1,false),('sa','Platform','SUPER_ADMIN','other',1,false)`,
      `INSERT INTO "UserSession" VALUES ('session','owner',(clock_timestamp() AT TIME ZONE 'UTC')+INTERVAL '1 hour',NULL),('sa-session','sa',(clock_timestamp() AT TIME ZONE 'UTC')+INTERVAL '1 hour',NULL)`,
      `INSERT INTO "Stocktake" VALUES ('old','c','s','Παλιά','FINALIZED','2026-10-01 01:00','2026-10-01 04:00'),('new','c','s','Νέα','FINALIZED','2026-10-01 08:00','2026-10-01 12:00')`,
      `INSERT INTO "Product" VALUES ('a','c','Ομπρέλες Α','A'),('b','c','Ομπρέλες Β','B'),('g','c','Γυαλιά','G'),('unrelated','c','Control','CTRL')`,
      `INSERT INTO "StocktakeLine" VALUES ('oa','old','a','2026-10-01 02:00',244,2),('ob','old','b','2026-10-01 02:00',0,2),('og','old','g','2026-10-01 02:00',268,3),('na','new','a','2026-10-01 10:00',0,2),('nb','new','b','2026-10-01 10:00',233,2),('ng','new','g','2026-10-01 10:00',0,3)`,
      `INSERT INTO "InventoryCountEvent" VALUES ('eoa','c','s','old','oa','COUNT',NULL,244,0,'Owner','BACKOFFICE','2026-10-01 02:00Z'),('eob','c','s','old','ob','COUNT',NULL,0,0,'Owner','BACKOFFICE','2026-10-01 02:00Z'),('eog','c','s','old','og','COUNT',NULL,268,0,'Owner','BACKOFFICE','2026-10-01 02:00Z'),('ena','c','s','new','na','COUNT',NULL,0,244,'Owner','BACKOFFICE','2026-10-01 10:00Z'),('enb','c','s','new','nb','COUNT',NULL,233,0,'Owner','BACKOFFICE','2026-10-01 10:00Z'),('eng','c','s','new','ng','COUNT',NULL,0,263,'Owner','BACKOFFICE','2026-10-01 10:00Z')`,
      `INSERT INTO "StockMovement"("id","storeId","productId","movementType","quantity","sourceType","sourceId","createdAt") VALUES ('opening-a','s','a','STOCKTAKE_ADJUSTMENT',244,'INVENTORY_V2','old','2026-10-01 04:00'),('opening-g','s','g','STOCKTAKE_ADJUSTMENT',268,'INVENTORY_V2','old','2026-10-01 04:00'),('sale-g','s','g','SALE',-5,'POS_SALE','sale','2026-10-01 06:00'),('closing-a','s','a','STOCKTAKE_ADJUSTMENT',-244,'INVENTORY_V2','new','2026-10-01 12:00'),('closing-b','s','b','STOCKTAKE_ADJUSTMENT',233,'INVENTORY_V2','new','2026-10-01 12:00'),('closing-g','s','g','STOCKTAKE_ADJUSTMENT',-263,'INVENTORY_V2','new','2026-10-01 12:00')`,
      `INSERT INTO "StoreProduct" VALUES ('a','s','a',0),('b','s','b',233),('g','s','g',0),('control','control','unrelated',50)`,
      `INSERT INTO "StoreTransaction" VALUES ('finance','s',123),('control','control',456)`,
      `INSERT INTO "CashShiftSession" VALUES ('shift','s',10,20),('control','control',30,40)`,
      `INSERT INTO "WorkforceAuditLog" VALUES ('other-audit','c','s','owner','KEEP','OTHER','other','{}','2026-10-01 01:00')`
    ])await db.$executeRawUnsafe(sql);
    const current=(await db.$queryRaw`SELECT * FROM "Stocktake" WHERE "id"='new'`)[0],actor={id:'owner',role:'OWNER',tokenType:'BACKOFFICE_USER',sessionId:'session',sessionVersion:1,companyId:'c',storeId:'s'};
    const invariant=async()=>db.$queryRaw`SELECT
      (SELECT json_agg(t ORDER BY "id") FROM "Stocktake" t) AS parents,
      (SELECT json_agg(t ORDER BY "id") FROM "StocktakeLine" t) AS lines,
      (SELECT json_agg(t ORDER BY "id") FROM "InventoryCountEvent" t) AS counts,
      (SELECT json_agg(t ORDER BY "id") FROM "StockMovement" t) AS movements,
      (SELECT json_agg(t ORDER BY "id") FROM "StoreProduct" t) AS stocks,
      (SELECT json_agg(t ORDER BY "id") FROM "StoreTransaction" t) AS finance,
      (SELECT json_agg(t ORDER BY "id") FROM "CashShiftSession" t) AS shifts,
      (SELECT json_agg(t ORDER BY "id") FROM "WorkforceAuditLog" t WHERE "entityType"='OTHER') AS otheraudit`;
    const original=await invariant();
    const read=()=>readInventoryReconciliation(db,current,'old'),body=(report,action)=>({requestId:randomUUID(),previousStocktakeId:'old',generation:report.generation,head:report.review.head,expectedFingerprint:report.fingerprint,action});
    const actionLink={kind:'LINK',productIds:['b','a'],canonicalProductId:'a',reason:'Επιβεβαίωση ομπρελών',evidence:'Φυσική ταύτιση ομπρελών Α και Β'};
    const actionCorrection={kind:'CORRECTION',productId:'g',quantity:240,reason:'Διόρθωση γυαλιών',evidence:'Φύλλο επανακαταμέτρησης γυαλιών'};
    let report=await read();assert.equal(report.summary.shortageQuantity,507);assert.equal(report.summary.surplusQuantity,233);
    const linkRequest=body(report,actionLink),linkReceipt=await applyInventoryReview(db,actor,current,linkRequest);
    report=await read();assert.equal(report.groups.find(x=>x.productIds.includes('a')).finalDifference,-11);assert.equal(report.summary.surplusQuantity,0);
    const correctionRequest=body(report,actionCorrection),correctionReceipt=await applyInventoryReview(db,actor,current,correctionRequest);
    report=await read();const glasses=report.groups.find(x=>x.id==='g');assert.equal(glasses.initialDifference,-263);assert.equal(glasses.correctionQuantity,240);assert.equal(glasses.finalDifference,-23);assert.equal(glasses.finalValue,-69);assert.equal(report.summary.shortageQuantity,34);assert.equal(report.summary.shortageValue,91);
    assert.equal(report.rows.find(x=>x.productId==='g').movements.filter(x=>x.id==='sale-g').length,1);assert.deepEqual(await invariant(),original);
    const replay=await applyInventoryReview(db,actor,current,{...linkRequest,action:{...actionLink,productIds:['a','b'],reason:'  Επιβεβαίωση ομπρελών  '}});assert.equal(replay.replayed,true);assert.equal(replay.receiptId,linkReceipt.receiptId);
    await assert.rejects(applyInventoryReview(db,actor,current,{...linkRequest,action:{...actionLink,reason:'Άλλη αιτιολογία'}}),{code:'INVENTORY_REVIEW_REPLAY_CHANGED'});
    await assert.rejects(applyInventoryReview(db,actor,current,body(report,actionCorrection)),{code:'INVENTORY_REVIEW_DUPLICATE_CORRECTION'});
    await assert.rejects(applyInventoryReview(db,actor,current,body(report,{...actionCorrection,productId:'foreign'})),{code:'INVENTORY_REVIEW_UNCOMPUTABLE'});
    await assert.rejects(applyInventoryReview(db,actor,current,body(report,{...actionCorrection,quantity:1,evidence:'sale-g'})),{code:'INVENTORY_REVIEW_MOVEMENT_ALREADY_INCLUDED'});
    for(const user of [{...actor,staffAccess:true},{...actor,role:'MANAGER'},{...actor,tokenType:'INVENTORY_COUNTER'},{...actor,storeId:'control'},{...actor,supportContext:{companyId:'c',storeId:'control'}},{...actor,isSuperAdmin:true,platformRole:'SUPER_ADMIN'}])await assert.rejects(applyInventoryReview(db,user,current,body(report,{...actionCorrection,quantity:1,evidence:'Separate evidence'})),{status:403});
    const revokeRequest=body(report,{kind:'REVOKE',actionId:correctionReceipt.receiptId,reason:'Έλεγχος ανάκλησης',evidence:'Νέα επαλήθευση καταμέτρησης'});
    await applyInventoryReview(db,actor,current,revokeRequest);report=await read();assert.equal(report.groups.find(x=>x.id==='g').finalDifference,-263);assert.equal(report.review.history.length,3);
    const raceA=body(report,actionCorrection),raceB={...raceA,requestId:randomUUID()};
    const race=await Promise.allSettled([applyInventoryReview(db,actor,current,raceA),applyInventoryReview(db,actor,current,raceB)]);
    assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.equal(race.find(x=>x.status==='rejected').reason.code,'INVENTORY_REVIEW_STALE_HEAD');
    report=await read();assert.equal(report.groups.find(x=>x.id==='g').finalDifference,-23);assert.deepEqual(await invariant(),original);
    const beforeAuthority=(await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "WorkforceAuditLog"`)[0].n;
    await db.$executeRaw`UPDATE "UserSession" SET "revokedAt"=NOW() WHERE "id"='session'`;
    await assert.rejects(applyInventoryReview(db,actor,current,body(report,{...actionCorrection,quantity:1,evidence:'Another review'})),{code:'INVENTORY_REVIEW_SESSION_REVOKED'});
    await db.$executeRaw`UPDATE "UserSession" SET "revokedAt"=NULL WHERE "id"='session'`;
    await db.$executeRaw`UPDATE "CompanyModule" SET "active"=FALSE WHERE "id"='loss'`;
    await assert.rejects(applyInventoryReview(db,actor,current,body(report,{...actionCorrection,quantity:1,evidence:'Another review'})),{code:'INVENTORY_REVIEW_MODULE_DENIED'});
    await db.$executeRaw`UPDATE "CompanyModule" SET "active"=TRUE WHERE "id"='loss'`;
    await db.$executeRaw`UPDATE "User" SET "role"='EMPLOYEE' WHERE "id"='owner'`;
    await assert.rejects(applyInventoryReview(db,actor,current,body(report,{...actionCorrection,quantity:1,evidence:'Another review'})),{code:'INVENTORY_REVIEW_SESSION_REVOKED'});
    await db.$executeRaw`UPDATE "User" SET "role"='OWNER' WHERE "id"='owner'`;
    const support={...actor,id:'sa',sessionId:'sa-session',isSuperAdmin:true,platformRole:'SUPER_ADMIN',supportContext:{companyId:'c',storeId:'s'}};
    await assert.rejects(applyInventoryReview(db,support,current,linkRequest),{code:'INVENTORY_REVIEW_STALE_HEAD'});
    await db.$executeRawUnsafe('CREATE TABLE "StoreLifecycleFence"("storeId" text primary key,"companyId" text,"generation" bigint,"maintenance" bool,"retired" bool)');
    await db.$executeRawUnsafe(`INSERT INTO "StoreLifecycleFence" VALUES ('s','c',1,false,false)`);
    await assert.rejects(applyInventoryReview(db,actor,current,body(report,{...actionCorrection,quantity:1,evidence:'Another review'})),{code:'STORE_LIFECYCLE_STALE_GENERATION'});
    await db.$executeRaw`UPDATE "StoreLifecycleFence" SET "generation"=0 WHERE "storeId"='s'`;
    // Observe a real Store-row wait, then withdraw the session before the writer
    // reaches its transaction-time authority check.
    let release,acquired;const gate=new Promise(resolve=>{release=resolve}),locked=new Promise(resolve=>{acquired=resolve});
    const holder=db.$transaction(async tx=>{await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"='s' FOR UPDATE`;acquired();await gate;await tx.$executeRaw`UPDATE "UserSession" SET "revokedAt"=NOW() WHERE "id"='session'`;},{timeout:10000});
    await locked;const blocked=applyInventoryReview(db,actor,current,body(report,{...actionCorrection,quantity:1,evidence:'Post-wait authority test'})).then(value=>({value}),error=>({error}));
    let observedWait=false;
    try{for(let i=0;i<40;i++){const [waiting]=await admin.$queryRaw`SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE application_name=${schema} AND wait_event_type='Lock'`;if(waiting.n>0){observedWait=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}}finally{release();}
    await holder;assert.equal(observedWait,true);assert.equal((await blocked).error?.code,'INVENTORY_REVIEW_SESSION_REVOKED');
    await db.$executeRaw`UPDATE "UserSession" SET "revokedAt"=NULL WHERE "id"='session'`;
    assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "WorkforceAuditLog"`)[0].n,beforeAuthority);
    const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={...actor};if(req.get('x-staff'))req.user.staffAccess=true;next();});
    const options={db,access:async(req,id)=>id==='new'?current:null,requireLossDetection:async()=>true};
    app.get('/takes/:stocktakeId/reconciliation',createInventoryReconciliationHandler(options));app.post('/takes/:stocktakeId/reconciliation/reviews',createInventoryReviewHandler(options));
    app.use((e,req,res,next)=>res.status(e.name==='ZodError'?400:e.status||500).json({error:e.message,code:e.code}));
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const origin=`http://127.0.0.1:${server.address().port}/takes/new/reconciliation`;
    assert.equal((await fetch(origin)).status,409,'old clients must not render original rows as final reviewed results');
    const get=await fetch(origin+'?reportVersion=2');let httpReport=await get.json();assert.equal(get.status,200,JSON.stringify(httpReport));assert.equal(httpReport.review.canWrite,true);
    const oldHttpFingerprint=httpReport.fingerprint,httpRequest=body(httpReport,{...actionCorrection,productId:'a',quantity:1,evidence:'HTTP επιβεβαίωση φυσικής καταμέτρησης Α'});
    const applied=await fetch(origin+'/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(httpRequest)});const appliedBody=await applied.json();assert.equal(applied.status,200,JSON.stringify(appliedBody));assert.equal(appliedBody.ok,true);
    const httpReplay=await(await fetch(origin+'/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(httpRequest)})).json();assert.equal(httpReplay.replayed,true);assert.equal(httpReplay.receiptId,appliedBody.receiptId);
    assert.equal((await fetch(`${origin}?reportVersion=2&format=xlsx&previousStocktakeId=old&expectedFingerprint=${oldHttpFingerprint}`)).status,409);
    httpReport=await(await fetch(origin+'?reportVersion=2')).json();assert.equal(httpReport.summary.shortageQuantity,33);assert.equal(httpReport.summary.shortageValue,89);assert.deepEqual(await invariant(),original);
    const xlsx=await(await fetch(`${origin}?reportVersion=2&format=xlsx&previousStocktakeId=old&expectedFingerprint=${httpReport.fingerprint}`)).json();
    const wb=XLSX.read(Buffer.from(xlsx.base64,'base64'),{type:'buffer'}),finalRows=XLSX.utils.sheet_to_json(wb.Sheets['Τελικό αποτέλεσμα'],{header:1});
    assert.equal(finalRows.find(x=>x[0]==='g')[6],-23);assert.equal(finalRows.find(x=>x[0]==='g')[10],-69);assert.equal(wb.SheetNames.length,12);assert.equal(wb.Sheets['Πληρότητα πηγών'].B2.v,false);
    assert.equal(finalRows.slice(1).reduce((sum,x)=>sum+x[6],0),httpReport.summary.netQuantity);assert.equal(finalRows.slice(1).reduce((sum,x)=>sum+x[10],0),httpReport.summary.netValue);
    const invalid=await fetch(origin+'/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body(httpReport,actionCorrection),actorId:'spoof'})});assert.equal(invalid.status,400);
    const staff=await fetch(origin+'/reviews',{method:'POST',headers:{'Content-Type':'application/json','x-staff':'yes'},body:JSON.stringify(body(httpReport,actionCorrection))});assert.equal(staff.status,403);
    await db.$executeRaw`UPDATE "StocktakeLine" SET "unitCost"=NULL WHERE "id"='ng'`;
    const stale=await read();assert.equal(stale.groups.find(x=>x.id==='g').finalDifference,null);assert.equal(stale.summary.netValue,null);assert.equal(stale.summary.netQuantity,null);
    assert.equal((await fetch(`${origin}?reportVersion=2&format=pdf&previousStocktakeId=old&expectedFingerprint=${httpReport.fingerprint}`)).status,409);
    await db.$executeRaw`UPDATE "StocktakeLine" SET "unitCost"=3 WHERE "id"='ng'`;
    assert.deepEqual(await invariant(),original);
  }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();}
});
