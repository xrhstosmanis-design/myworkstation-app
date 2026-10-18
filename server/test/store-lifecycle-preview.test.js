import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {classifyLifecycleTable,lifecyclePreview,registerStoreLifecyclePreview} from '../src/services/store-lifecycle-preview.js';
const actor={id:'admin',isSuperAdmin:true};
const isolated=(()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}})();
test('preview rejects ordinary actors before DB access and never defaults an invalid mode',async()=>{
 const db={$transaction(){throw Error('unexpected database access')}};
 for(const user of [null,{id:'o',role:'OWNER'},{id:'o',role:'SUPER_ADMIN'},{id:'o',tokenType:'STORE_OPERATOR'}])await assert.rejects(lifecyclePreview(db,user,{companyId:'c',storeId:'s'},'RESET'),e=>e.status===403);
 for(const mode of [undefined,'reset','CLEAR',null,['RESET'],''])await assert.rejects(lifecyclePreview(db,actor,{companyId:'c',storeId:'s'},mode),e=>e.status===400);
});
test('prospective reset protects installation; unknown tables never silently become removable',()=>{
 for(const n of ['Store','StoreFiscalDevice','StoreEftposDevice','StoreRbsInstallationSettings','CloudDevice','StoreInstallationTerminal']){assert.equal(classifyLifecycleTable(n,'RESET'),'KEEP');assert.equal(classifyLifecycleTable(n,'DELETE'),'REMOVE')}
 for(const n of ['Employee','Sale','StoreProduct','CashShiftSession'])assert.equal(classifyLifecycleTable(n,'RESET'),'REMOVE');
 for(const n of ['FutureUnknownStoreTable','Product','Company','User'])assert.equal(classifyLifecycleTable(n,'RESET'),'REVIEW');
});
async function fixture(){
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='lifecycle_'+randomUUID().replaceAll('-','');await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 for(const sql of [
 'CREATE TABLE "Store"("id" text primary key,"name" text,"companyId" text)',
 'CREATE TABLE "Sale"("id" text primary key,"companyId" text,"storeId" text REFERENCES "Store"("id"),"document" text)',
 'CREATE TABLE "SaleLine"("id" text primary key,"saleId" text REFERENCES "Sale"("id") ON DELETE CASCADE)',
 'CREATE TABLE "LifecycleLineAttachment"("id" text primary key,"lineId" text REFERENCES "SaleLine"("id") ON DELETE CASCADE)',
 'CREATE TABLE "CashShiftSession"("id" text primary key,"companyId" text,"storeId" text,"status" text)',
 'CREATE TABLE "StoreOperatorSession"("id" text primary key,"companyId" text,"storeId" text,"expiresAt" timestamptz,"revokedAt" timestamptz,"secret" text)',
 'CREATE TABLE "RbsCapDriverV1Request"("id" text primary key,"companyId" text,"storeId" text,"status" text)',
 'CREATE TABLE "StoreRbsInstallationSettings"("companyId" text,"storeId" text,"cashCode" text)',
 'CREATE TABLE "CloudDevice"("id" text primary key,"companyId" text,"storeId" text,"status" text,"lastSeenAt" timestamptz,"token" text)',
 'CREATE TABLE "FutureUnknownStoreTable"("id" text primary key,"companyId" text,"storeId" text)',
 'CREATE TABLE "PurchaseOrder"("id" text primary key,"companyId" text,"storeId" text)',
 'CREATE TABLE "PurchaseOrderLine"("id" text primary key,"orderId" text,"companyId" text,"document" text)',
 'CREATE TABLE "Product"("id" text primary key,"companyId" text,"name" text)',
 `INSERT INTO "Store" VALUES('s','Target','c'),('sibling','Sibling','c'),('foreign','Foreign','other')`,
 `INSERT INTO "Sale" VALUES('sale','c','s','NEVER RETURN DOCUMENT'),('sibling-sale','c','sibling','CONTROL'),('foreign-sale','other','foreign','CONTROL')`,
 `INSERT INTO "SaleLine" VALUES('line','sale'),('control-line','sibling-sale')`,
 `INSERT INTO "LifecycleLineAttachment" VALUES('attachment','line'),('control-attachment','control-line')`,
 `INSERT INTO "CashShiftSession" VALUES('shift','c','s','OPEN'),('closed','c','s','CLOSED'),('control','c','sibling','OPEN')`,
 `INSERT INTO "StoreOperatorSession" VALUES('active','c','s',NOW()+INTERVAL '1 hour',NULL,'NEVER RETURN TOKEN'),('expired','c','s',NOW()-INTERVAL '1 hour',NULL,'OLD'),('revoked','c','s',NOW()+INTERVAL '1 hour',NOW(),'REVOKED')`,
 `INSERT INTO "RbsCapDriverV1Request" VALUES('pending','c','s','DISPATCHED'),('done','c','s','SALE_COMMITTED'),('declined','c','s','DECLINED')`,
 `INSERT INTO "CloudDevice" VALUES('writer','c','s','ACTIVE',NOW(),'NEVER RETURN DEVICE TOKEN')`,
 `INSERT INTO "StoreRbsInstallationSettings" VALUES('c','s','6')`,
 `INSERT INTO "PurchaseOrder" VALUES('order','c','s'),('sibling-order','c','sibling'),('foreign-order','other','foreign')`,
 `INSERT INTO "PurchaseOrderLine" VALUES('raw-line','order','c','NEVER RETURN RAW CONTENT'),('raw-control','sibling-order','c','CONTROL'),('raw-foreign','foreign-order','other','CONTROL')`,
 `INSERT INTO "Product" VALUES('shared','c','Shared catalog')`
 ])await db.$executeRawUnsafe(sql);
 return {db,close:async()=>{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}};
}
async function snapshot(db){const out={};for(const t of ['Store','Sale','SaleLine','LifecycleLineAttachment','CashShiftSession','StoreOperatorSession','CloudDevice','RbsCapDriverV1Request','StoreRbsInstallationSettings','Product','PurchaseOrder','PurchaseOrderLine'])out[t]=await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "${t}" t ORDER BY row_to_json(t)::text`);return out}
test('native preview reads only target counts, hides contents, detects work and dependencies, preserves complete target/sibling/foreign snapshots',{skip:!isolated},async()=>{
 const f=await fixture();try{
 const before=await snapshot(f.db),scope={companyId:'c',storeId:'s'},p=await lifecyclePreview(f.db,actor,scope,'RESET');assert.deepEqual(await snapshot(f.db),before);assert.equal(p.executionAvailable,false);assert.equal(p.inventory.find(x=>x.table==='Sale').count,1);assert.equal(p.inventory.find(x=>x.table==='StoreRbsInstallationSettings').action,'KEEP');
 for(const code of ['OPEN_SHIFT','ACTIVE_OPERATOR','ACTIVE_CONNECTOR','FISCAL_REQUEST'])assert.equal(p.blockers.find(x=>x.code===code).count,1);
 assert.ok(p.blockers.some(x=>x.code==='UNREVIEWED_TABLE'&&x.table==='FutureUnknownStoreTable'));assert.ok(p.indirect.some(x=>x.table==='SaleLine'&&x.parent==='Sale'));assert.ok(p.indirect.some(x=>x.table==='LifecycleLineAttachment'&&x.parent==='SaleLine'&&x.action==='REVIEW'));assert.doesNotMatch(JSON.stringify(p),/NEVER RETURN|sibling-sale|foreign-sale|Shared catalog/);
 const raw=p.applicationLinks.find(x=>x.table==='PurchaseOrderLine');assert.equal(raw.count,1);assert.equal(raw.action,'REVIEW');assert.equal(raw.inconsistent,0);assert.equal(raw.parentAction,'REMOVE');
 assert.equal((await lifecyclePreview(f.db,actor,scope,'RESET')).fingerprint,p.fingerprint);const d=await lifecyclePreview(f.db,actor,scope,'DELETE');assert.notEqual(d.fingerprint,p.fingerprint);assert.equal(d.inventory.find(x=>x.table==='StoreRbsInstallationSettings').action,'REMOVE');
 await f.db.$executeRawUnsafe(`INSERT INTO "PurchaseOrderLine" VALUES('new-raw-line','order','c','NEVER RETURN RAW CONTENT')`);assert.notEqual((await lifecyclePreview(f.db,actor,scope,'RESET')).fingerprint,p.fingerprint);
 await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrderLine" SET "companyId"='other' WHERE "id"='new-raw-line'`);assert.equal((await lifecyclePreview(f.db,actor,scope,'RESET')).blockers.find(x=>x.code==='INCONSISTENT_APPLICATION_LINK').count,1);
 for(const bad of [{companyId:'other',storeId:'s'},{companyId:'c',storeId:'foreign'},{companyId:'c',storeId:'missing'}])await assert.rejects(lifecyclePreview(f.db,actor,bad,'RESET'),e=>e.status===404);
 await f.db.$executeRawUnsafe(`INSERT INTO "Sale" VALUES('bad','other','s','NEVER RETURN CROSS SCOPE')`);const bad=await lifecyclePreview(f.db,actor,scope,'RESET');assert.equal(bad.blockers.find(x=>x.code==='INCONSISTENT_SCOPE').count,1);
 }finally{await f.close()}
});
test('native actual HTTP preparation endpoint is GET-only/no-store and refuses unprivileged or wrong-scope requests without writes',{skip:!isolated},async()=>{
 const f=await fixture(),app=express();let user=actor;app.use((req,res,next)=>{req.user=user;next()});registerStoreLifecyclePreview(app,f.db);app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))}),base='http://127.0.0.1:'+server.address().port+'/companies/c/stores/s/lifecycle/preview';
 try{const before=await snapshot(f.db),ok=await fetch(base+'?mode=RESET');assert.equal(ok.status,200);assert.equal(ok.headers.get('cache-control'),'no-store');assert.equal((await ok.json()).store.id,'s');user={id:'o',role:'OWNER'};assert.equal((await fetch(base+'?mode=RESET')).status,403);user=actor;assert.equal((await fetch(base.replace('/stores/s/','/stores/foreign/')+'?mode=RESET')).status,404);assert.equal((await fetch(base+'?mode=FORGED')).status,400);assert.equal((await fetch(base+'?mode=DELETE',{method:'DELETE'})).status,404);assert.deepEqual(await snapshot(f.db),before)}finally{await new Promise(r=>server.close(r));await f.close()}
});
