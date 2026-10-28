import test from 'node:test';
import assert from 'node:assert/strict';
import {readCashEventSales} from '../src/services/cash-event-sales-source.js';
import {randomUUID} from 'node:crypto';
const scope={companyId:'co',storeId:'store'},session={...scope,id:'shift',status:'CLOSED',openedAt:'2026-10-22T12:00:00.000Z',closedAt:'2026-10-22T20:00:00.000Z'};
test('native reader uses explicit scope, completed ledger linkage and safe projection, with no approval flags or writers',async()=>{
 const calls=[];const sale={...scope,sessionId:'shift',saleId:'sale',status:'COMPLETED',source:'POS',occurredAt:'2026-10-22T16:00:00.000Z',actorId:'user',total:0,linked:true,lines:[{lineId:'l',productId:'p',description:'Σοκολάτα',quantity:1,unitPrice:0,lineTotal:0}]};
 const event={...scope,id:'e',actionType:'PRICE_CHANGE',actorId:'user',actorName:'Α',createdAt:'2026-10-22T15:59:50.000Z',details:{sessionId:'shift',productId:'p',productName:'Σοκολάτα',previousQuantity:1,oldPrice:2,newPrice:0,newTotal:0,automaticDiscountConfirmed:true,attachmentData:'SECRET'}};
 const db={$queryRaw:async(strings,...values)=>{const sql=strings.join('?');calls.push({sql,values});if(sql.includes('to_regclass'))return [{auditTable:'PosSaleActionAudit',completionTable:'StoreOperatorAudit'}];if(sql.includes('FROM "Sale"'))return [sale];if(sql.includes('FROM "PosSaleActionAudit"'))return [event];throw Error(sql)}};
 const before=JSON.stringify({sale,event});const result=await readCashEventSales(db,scope,session);assert.equal(result.status,'AVAILABLE');assert.equal(result.findings.length,1);assert.equal(result.findings[0].code,'ZERO_VALUE_SALE');assert.equal(result.findings[0].originalPriceCents,200);assert.match(result.evidenceHash,/^[a-f0-9]{64}$/);assert(!JSON.stringify(result).includes('SECRET'));assert.equal(JSON.stringify({sale,event}),before);
 for(const c of calls.slice(1)){assert(c.values.includes('co'));assert(c.values.includes('store'));assert(c.values.includes('shift'));assert.doesNotMatch(c.sql,/INSERT|UPDATE|DELETE|ALTER|CREATE/);}
 assert(calls[1].sql.includes('t."reversedAt" IS NULL'));assert(calls[1].sql.includes('HAVING COUNT(*)>0'));assert(calls[2].sql.includes('LIMIT 2001'));
 event.details.newPrice=1;assert.notEqual((await readCashEventSales(db,scope,session)).evidenceHash,result.evidenceHash);
});
test('foreign/open scopes never read; missing audit table and source limits are explicitly unavailable',async()=>{
 let calls=0;const db={$queryRaw:async()=>{calls++;return [{auditTable:null}]}};
 for(const s of [{...session,storeId:'foreign'},{...session,status:'OPEN'},{...session,openedAt:'invalid'},{...session,closedAt:'2026-10-21T00:00:00Z'}])assert.equal((await readCashEventSales(db,scope,s)).status,'UNAVAILABLE');assert.equal(calls,0);
 assert.equal((await readCashEventSales(db,scope,session)).status,'UNAVAILABLE');assert.equal(calls,1);
 const overflow={$queryRaw:async strings=>strings.join('').includes('to_regclass')?[{auditTable:'present',completionTable:'present'}]:strings.join('').includes('FROM "Sale"')?Array(2001).fill({}):[]};assert.equal((await readCashEventSales(overflow,scope,session)).status,'LIMITED');
});
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native PostgreSQL: zero-total sale is linked through completion, automatic proof is exact, ambiguous session and foreign records stay out; no original changes',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='cash_events_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "Sale"("id" text,"companyId" text,"storeId" text,"status" text,"source" text,"receiptNumber" text,"occurredAt" timestamptz,"total" numeric)',
   'CREATE TABLE "SaleLine"("id" text,"saleId" text,"productId" text,"description" text,"quantity" numeric,"unitPrice" numeric,"discount" numeric,"lineTotal" numeric,"promotionId" text,"promotionType" text)',
   'CREATE TABLE "StoreTransaction"("id" text,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric,"description" text,"actorId" text,"actorName" text,"reversedAt" timestamptz)',
   'CREATE TABLE "StoreOperatorAudit"("id" text,"companyId" text,"storeId" text,"eventType" text,"actorId" text,"details" jsonb)',
   'CREATE TABLE "PosSaleActionAudit"("id" text,"companyId" text,"storeId" text,"saleId" text,"actionType" text,"actorId" text,"actorName" text,"createdAt" timestamptz,"details" jsonb)'
  ])await db.$executeRawUnsafe(sql);
  for(const [id,store,total]of [['free','store',0],['auto','store',7],['foreign','other',0],['ambiguous','store',0]]){
   await db.$executeRaw`INSERT INTO "Sale" VALUES (${id},'co',${store},'COMPLETED','POS',${'R-'+id},'2026-10-22T16:00:00Z',${total})`;
   const qty=1,unit=id==='auto'?8:0;
   await db.$executeRaw`INSERT INTO "SaleLine" VALUES (${'l-'+id},${id},'p',${id},${qty},${unit},${id==='auto'?1:0},${total},${id==='auto'?'promo':null},${id==='auto'?'LEAFLET':null})`;
   const details={saleId:id,sessionId:'shift',items:[{productId:'p',quantity:qty,unitPrice:unit,lineTotal:total,priceSource:id==='auto'?'LEAFLET':'MANUAL'}]};
   await db.$executeRaw`INSERT INTO "StoreOperatorAudit" VALUES (${'completed-'+id},'co',${store},'POS_SALE_COMPLETED','user',${JSON.stringify(details)}::jsonb)`;
  }
  await db.$executeRaw`INSERT INTO "StoreOperatorAudit" VALUES ('wrong-session','co','store','POS_SALE_COMPLETED','user','{"saleId":"ambiguous","sessionId":"other-shift"}'::jsonb)`;
  await db.$executeRaw`INSERT INTO "PosSaleActionAudit" VALUES ('edit','co','store',NULL,'PRICE_CHANGE','user','Σωτήρης','2026-10-22T15:59:50Z','{"sessionId":"shift","productId":"p","productName":"Δωρεάν είδος","previousQuantity":1,"oldPrice":2,"newPrice":0,"newTotal":0}'::jsonb)`;
  await db.$executeRaw`INSERT INTO "PosSaleActionAudit" VALUES ('catalog','co','store',NULL,'PERMANENT_PRICE_CHANGE','user','Σωτήρης','2026-10-22T15:50:00Z','{"sessionId":"shift","productId":"p","oldPrice":8,"newPrice":7}'::jsonb)`;
  const tables=['Sale','SaleLine','StoreTransaction','StoreOperatorAudit','PosSaleActionAudit'];
  const snapshot=async()=>Promise.all(tables.map(t=>db.$queryRawUnsafe(`SELECT to_jsonb(x) AS record FROM "${t}" x ORDER BY "id"`)));
  const before=await snapshot();
  const result=await db.$transaction(tx=>readCashEventSales(tx,scope,session),{isolationLevel:'RepeatableRead'});
  assert.equal(result.status,'AVAILABLE');assert.equal(result.findings.length,2);assert.equal(result.findings[0].code,'ZERO_VALUE_SALE');assert.equal(result.findings[0].saleId,'free');assert.equal(result.findings[0].originalPriceCents,200);assert.equal(result.findings[1].code,'CATALOG_PRICE_CHANGE_UNCONFIRMED');assert.equal(result.financialAdjustmentCents,0);
  assert.deepEqual(await snapshot(),before);
  await db.$executeRaw`UPDATE "SaleLine" SET "promotionId"=NULL WHERE "saleId"='auto'`;
  const changed=await readCashEventSales(db,scope,session);assert.notEqual(changed.evidenceHash,result.evidenceHash);assert(changed.findings.some(f=>f.saleId==='auto'&&f.code==='SALE_PRICE_REDUCTION'));
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();}
});
