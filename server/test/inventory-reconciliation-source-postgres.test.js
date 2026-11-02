import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import XLSX from 'xlsx';
import {readInventoryReconciliation} from '../src/services/inventory-reconciliation-source.js';
import {createInventoryReconciliationHandler} from '../src/services/inventory-reconciliation-handler.js';
const isolated=()=>{try{const url=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(url.hostname)&&/test/i.test(url.pathname)}catch{return false}};
test('native read-only two-stocktake SQL/HTTP: scope, count boundary, exports, fingerprint and original invariance',{skip:!isolated()},async()=>{
  const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema=`reconcile_test_${randomUUID().replaceAll('-','')}`;
  const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
  let server;
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for(const sql of [
      'CREATE TABLE "Stocktake"("id" text primary key,"companyId" text,"storeId" text,"name" text,"status" text,"startedAt" timestamp,"finalizedAt" timestamp)',
      'CREATE TABLE "StocktakeLine"("id" text primary key,"stocktakeId" text,"productId" text,"countedAt" timestamp,"countedQuantity" numeric,"unitCost" numeric)',
      'CREATE TABLE "Product"("id" text primary key,"companyId" text,"name" text,"sku" text)',
      'CREATE TABLE "Store"("id" text primary key,"companyId" text)',
      'CREATE TABLE "User"("id" text primary key,"companyId" text,"fullName" text)',
      'CREATE TABLE "PurchaseDocument"("id" text primary key,"companyId" text,"storeId" text,"documentDate" timestamp,"documentNumber" text,"createdAt" timestamp)',
      'CREATE TABLE "PurchaseOrder"("id" text primary key,"companyId" text,"storeId" text,"sourceDocumentId" text)',
      'CREATE TABLE "InventoryCountEvent"("id" text primary key,"companyId" text,"storeId" text,"stocktakeId" text,"lineId" text,"eventType" text,"previousQuantity" numeric,"countedQuantity" numeric,"expectedQuantity" numeric,"actorName" text,"source" text,"createdAt" timestamp)',
      'CREATE TABLE "StockMovement"("id" text primary key,"storeId" text,"productId" text,"movementType" text,"quantity" numeric,"unitCost" numeric,"sourceType" text,"sourceId" text,"idempotencyKey" text,"note" text,"createdAt" timestamp,"createdByUserId" text)'
    ])await db.$executeRawUnsafe(sql);
    await db.$executeRawUnsafe(`INSERT INTO "Store" VALUES ('s','c'),('foreign','other')`);
    await db.$executeRawUnsafe(`INSERT INTO "Product" VALUES ('p','c','Προϊόν','001'),('foreign','other','SECRET','secret')`);
    await db.$executeRawUnsafe(`INSERT INTO "Stocktake" VALUES ('old','c','s','Παλιά','FINALIZED','2026-10-01 01:00','2026-10-01 04:00'),('new','c','s','Νέα','FINALIZED','2026-10-01 08:00','2026-10-01 12:00'),('foreign','other','foreign','SECRET','FINALIZED','2026-10-01 01:00','2026-10-01 04:00')`);
    await db.$executeRawUnsafe(`INSERT INTO "StocktakeLine" VALUES ('a','old','p','2026-10-01 02:00',100,2),('b','new','p','2026-10-01 10:00',70,2)`);
    await db.$executeRawUnsafe(`INSERT INTO "InventoryCountEvent" VALUES ('e1','c','s','old','a','COUNT',null,100,105,'Owner','BACKOFFICE','2026-10-01 02:00'),('e2','c','s','new','b','COUNT',null,70,80,'Owner','BACKOFFICE','2026-10-01 10:00')`);
    await db.$executeRawUnsafe(`INSERT INTO "StockMovement"("id","storeId","productId","movementType","quantity","sourceType","sourceId","createdAt") VALUES ('baseline','s','p','STOCKTAKE_ADJUSTMENT',-5,'INVENTORY_V2','old','2026-10-01 04:00'),('sale','s','p','SALE',-25,'SALE','sale1','2026-10-01 06:00'),('purchase','s','p','PURCHASE',5,'PURCHASE_DOCUMENT','invoice','2026-10-01 07:00'),('late-sale','s','p','SALE',-3,'SALE','sale2','2026-10-01 11:00'),('foreign','foreign','foreign','SALE',-999,'SALE','secret','2026-10-01 06:00')`);
    const current=(await db.$queryRaw`SELECT * FROM "Stocktake" WHERE "id"='new'`)[0];
    const baseline=await db.$queryRaw`SELECT (SELECT json_agg(t ORDER BY "id") FROM "Stocktake" t) AS parents,(SELECT json_agg(t ORDER BY "id") FROM "StocktakeLine" t) AS lines,(SELECT json_agg(t ORDER BY "id") FROM "StockMovement" t) AS movements,(SELECT json_agg(t ORDER BY "id") FROM "InventoryCountEvent" t) AS events`;
    const app=express();app.use((req,res,next)=>{req.user={role:'OWNER',companyId:'c',storeId:'s',staffAccess:req.get('x-staff')==='yes'};next();});
    app.get('/takes/:stocktakeId/reconciliation',createInventoryReconciliationHandler({db,
      access:async(req,id)=>id==='new'?current:null,
      requireLossDetection:async(req,res)=>{if(req.get('x-disabled')){res.status(403).json({error:'MODULE_DISABLED'});return false;}return true;}}));
    app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const base=`http://127.0.0.1:${server.address().port}/takes/new/reconciliation`,get=async(suffix='',headers={})=>fetch(base+suffix,{headers});
    const response=await get(),report=await response.json();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.equal(report.rows[0].expectedQuantity,80);assert.equal(report.rows[0].difference,-10);assert.equal(report.summary.shortageValue,20);assert.doesNotMatch(JSON.stringify(report),/SECRET|secret|999/);
    assert.equal((await get('?previousStocktakeId=foreign')).status,404);
    assert.equal((await get('?format=xlsx')).status,409);assert.equal((await get('?format=csv')).status,400);
    assert.equal((await get('',{'x-staff':'yes'})).status,403);assert.equal((await get('',{'x-disabled':'yes'})).status,403);
    const file=await(await get(`?format=xlsx&expectedFingerprint=${report.fingerprint}`)).json();
    const wb=XLSX.read(Buffer.from(file.base64,'base64'),{type:'buffer'});assert.equal(wb.SheetNames.length,10);assert.equal(wb.Sheets['Πληρότητα πηγών'].B2.v,false);
    const rows=XLSX.utils.sheet_to_json(wb.Sheets['Είδη'],{header:1});assert.equal(rows[1][11],-10);assert.equal(rows[1][13],-20);
    const pdf=await(await get(`?format=pdf&expectedFingerprint=${report.fingerprint}`)).json();assert.equal(Buffer.from(pdf.base64,'base64').subarray(0,5).toString(),'%PDF-');
    assert.deepEqual(await db.$queryRaw`SELECT (SELECT json_agg(t ORDER BY "id") FROM "Stocktake" t) AS parents,(SELECT json_agg(t ORDER BY "id") FROM "StocktakeLine" t) AS lines,(SELECT json_agg(t ORDER BY "id") FROM "StockMovement" t) AS movements,(SELECT json_agg(t ORDER BY "id") FROM "InventoryCountEvent" t) AS events`,baseline);
    await db.$executeRaw`UPDATE "StocktakeLine" SET "unitCost"=NULL WHERE "id"='b'`;
    assert.equal((await get(`?format=xlsx&expectedFingerprint=${report.fingerprint}`)).status,409);
    const missing=await readInventoryReconciliation(db,current);assert.equal(missing.summary.netValue,null);assert.equal(missing.rows[0].differenceValue,null);
    await db.$executeRawUnsafe(`INSERT INTO "PurchaseOrder" VALUES ('order','c','s','doc');`);
    await db.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" VALUES ('doc','c','s','2026-09-01','LATE-1','2026-10-01 06:30')`);
    await db.$executeRaw`UPDATE "StockMovement" SET "sourceType"='PURCHASE_ORDER',"sourceId"='order' WHERE "id"='purchase'`;
    const late=await readInventoryReconciliation(db,current);assert.ok(late.rows[0].findings.includes('LATE_DOCUMENT'));assert.equal(late.rows[0].movements.find(x=>x.id==='purchase').documentNumber,'LATE-1');
  } finally {if(server)await new Promise(resolve=>server.close(resolve));await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();}
});
