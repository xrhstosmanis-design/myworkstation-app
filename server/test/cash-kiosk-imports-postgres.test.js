import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import express from 'express';
import XLSX from 'xlsx';
import {createCashReconciliationRouter} from '../src/routes/cash-reconciliation.js';
import {createKioskCashImports,readKioskCashEvidence} from '../src/services/cash-kiosk-imports.js';
import {readLifecycleGeneration} from '../src/services/store-lifecycle-generation.js';
import {hash} from '../src/services/cash-reconciliation-contract.js';
import {parseKioskCashWorkbook} from '../src/services/cash-kiosk-xls.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native Kiosk import: exact originals, two-client once-only proof, fresh role/scope/lifecycle gates, revoke and immutable finance/control',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='cash_kiosk_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
 const db=new PrismaClient({datasourceUrl:url.toString()}),other=new PrismaClient({datasourceUrl:url.toString()}),scope={companyId:'co',storeId:'store',generation:'0'},actor={id:'actor',fullName:'Χρήστος Μάνης'},period={from:'2026-10-27',to:'2026-10-27'};let server;
 const when=(Date.parse('2026-10-27T21:09:17Z')-Date.UTC(1899,11,30))/86400000;
 const workbook=rows=>{const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet(rows),'Sheet1');return XLSX.write(w,{type:'buffer',bookType:'biff8'}).toString('base64');};
 const events=workbook([['Συμβάντα','Κατηγορία'],[1,'Αλλαγή Τιμής Λιανικής'],[null,'Ημερομηνία','Χειριστής','αριθμός βάρδιας','Περιγραφή'],[null,when,'ΤΑΜΕΙΟ 6',436,'Αλλαγή τιμής λιανικής για το είδος [ΕΙΔΟΣ LAB] από 2,00 € σε 0,00 € (ΤΑΜΕΙΟ 6)']]);
 const journal=workbook([['Κωδ','Ημερομηνία','Επωνυμία','Περιγραφή συναλλαγής','Κέρδος','Τζίρος πώλησης','Πίστωση','Μετρητά','Κάρτα','IRIS','Κουπόνια','προμήθ. PoS','Πληρωμή','Είσπραξη','Όψεως','Επιταγή','X','Είδη'],[123,when,null,'Πώληση λιανικής',0,0,null,0,null,null,null,null,null,null,null,null,false,1],[null,'Περιγραφή είδους','Πελάτης','ΜΜ','Ποσότητα','Λιανική','Έκπτωση','Κέρδος','ΦΠΑ %','Τιμή Μονάδος (Λ)','Μερ.Σύνολο'],[null,'ΕΙΔΟΣ LAB',null,'TEM',1,2,100,0,24,0,0]]);
 const body=(data,binding)=>({requestId:randomUUID(),generation:'0',period,fileName:binding.kind+'.xls',contentData:data,binding,selectedStoreConfirmed:true});
 const originalBody=body(events,{kind:'EVENTS'});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "Company"("id" text primary key,"active" boolean)',
   'CREATE TABLE "Store"("id" text primary key,"companyId" text,"name" text,"active" boolean)',
   'CREATE TABLE "User"("id" text primary key,"companyId" text,"fullName" text,"role" text,"mustChangePassword" boolean)',
   'CREATE TABLE "StoreLifecycleFence"("storeId" text primary key,"companyId" text,"generation" bigint,"maintenance" boolean,"retired" boolean)',
   'CREATE TABLE "DocumentAttachment"("id" text primary key,"companyId" text,"storeId" text,"documentType" text,"filename" text,"mimeType" text,"storageKey" text,"checksum" text,"contentData" text,"createdAt" timestamp default NOW())',
   'CREATE TABLE "WorkforceAuditLog"("id" text primary key,"companyId" text,"storeId" text,"actorUserId" text,"action" text,"entityType" text,"entityId" text,"afterJson" jsonb,"createdAt" timestamp default NOW())',
   'CREATE TABLE "Sale"("id" text primary key,"total" numeric)',
   'CREATE TABLE "Payment"("id" text primary key,"amount" numeric)',
   'CREATE TABLE "CashShiftSession"("id" text primary key,"cash" numeric,"card" numeric,"iris" numeric,"count" integer)',
   'CREATE TABLE "StoreTransaction"("id" text primary key,"amount" numeric)',
   'CREATE TABLE "ProductStock"("id" text primary key,"quantity" numeric)',
   'CREATE TABLE "StoreChatMessage"("id" text primary key,"body" text)'
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "Company" VALUES ('co',true),('foreign',true)`;
  await db.$executeRaw`INSERT INTO "Store" VALUES ('store','co','LAB',true),('control','co','Control',true),('foreign','foreign','Foreign',true)`;
  await db.$executeRaw`INSERT INTO "User" VALUES ('actor','co','Χρήστος Μάνης','SUPER_ADMIN',false)`;
  await db.$executeRaw`INSERT INTO "StoreLifecycleFence" VALUES ('store','co',0,false,false)`;
  await db.$executeRaw`INSERT INTO "Sale" VALUES ('protected',7)`;await db.$executeRaw`INSERT INTO "Payment" VALUES ('protected',7)`;await db.$executeRaw`INSERT INTO "CashShiftSession" VALUES ('protected',4,3,0,2),('control',5,0,0,1)`;
  await db.$executeRaw`INSERT INTO "StoreTransaction" VALUES ('protected',7)`;await db.$executeRaw`INSERT INTO "ProductStock" VALUES ('protected',10)`;await db.$executeRaw`INSERT INTO "StoreChatMessage" VALUES ('protected','unchanged')`;
  const financial=async()=>hash(await Promise.all(['Sale','Payment','CashShiftSession','StoreTransaction','ProductStock','StoreChatMessage'].map(table=>db.$queryRawUnsafe(`SELECT * FROM "${table}" ORDER BY "id"`))));
  const before=await financial(),service=createKioskCashImports(db),second=createKioskCashImports(other);
  const outcomes=await Promise.all([service.importFile(scope,actor,originalBody,async()=>{}),second.importFile(scope,actor,originalBody,async()=>{})]);
  assert.equal(outcomes.filter(r=>!r.reused).length,1);assert.equal(outcomes[0].sourceId,outcomes[1].sourceId);
  assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "DocumentAttachment"`)[0].count,1);
  assert.equal((await db.$queryRaw`SELECT "contentData" FROM "DocumentAttachment"`)[0].contentData.split(',')[1],events);
  const aliasBody={...originalBody,requestId:randomUUID()};const alias=await service.importFile(scope,actor,aliasBody,async()=>{});assert.equal(alias.reused,true);assert.equal(alias.sourceId,outcomes[0].sourceId);
  await assert.rejects(service.importFile(scope,actor,{...aliasBody,fileName:'changed-alias.xls'},async()=>{}),e=>e.code==='CASH_KIOSK_REPLAY_CHANGED');
  await assert.rejects(service.importFile(scope,actor,{...originalBody,fileName:'changed.xls'},async()=>{}),e=>e.code==='CASH_KIOSK_REPLAY_CHANGED');
  const app=express();app.use(express.json({limit:'12mb'}));app.use((req,res,next)=>{req.user={id:'actor',companyId:'co',role:'SUPER_ADMIN'};next();});app.use(createCashReconciliationRouter({db,repository:{generation:async s=>(await readLifecycleGeneration(db,s)).generation}}));server=createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
  const post=async(path,data)=>{const r=await fetch(origin+'/stores/store/kiosk-sources'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
  const journalBody=body(journal,{kind:'JOURNAL',kioskShiftId:'436',kioskOperator:'ΤΑΜΕΙΟ 6'});
  let r=await post('',journalBody);assert.equal(r.status,200,JSON.stringify(r.body));const journalId=r.body.sourceId;
  const evidence=await readKioskCashEvidence(db,scope,period);assert.equal(evidence.status,'AVAILABLE');assert.equal(evidence.findings.filter(f=>f.code==='ZERO_VALUE_SALE').length,1);assert.equal(evidence.findings.filter(f=>f.code==='PRICE_APPLICATION_UNCONFIRMED').length,1);assert.equal(evidence.financialAdjustmentCents,0);
  assert.equal(await readKioskCashEvidence(db,scope,{from:'2026-10-28',to:'2026-10-28'}),null);
  const list=await fetch(origin+'/stores/store/kiosk-sources?from=2026-10-27&to=2026-10-27');assert.equal(list.status,200);assert.match(list.headers.get('cache-control'),/no-store/);const listed=await list.json();assert.equal(listed.sources.length,2);assert.doesNotMatch(JSON.stringify(listed),/contentData|ΕΙΔΟΣ LAB|documentHash/);
  assert.equal((await post('',{...journalBody,requestId:randomUUID(),binding:{kind:'JOURNAL',kioskShiftId:'999',kioskOperator:'ΤΑΜΕΙΟ 6'}})).status,409);
  await db.$executeRaw`UPDATE "User" SET "role"='EMPLOYEE' WHERE "id"='actor'`;assert.equal((await post('',journalBody)).status,403);await db.$executeRaw`UPDATE "User" SET "role"='OWNER' WHERE "id"='actor'`;
  assert.equal((await fetch(origin+'/stores/foreign/kiosk-sources?from=2026-10-27&to=2026-10-27')).status,404);await db.$executeRaw`UPDATE "User" SET "role"='SUPER_ADMIN' WHERE "id"='actor'`;
  const auditBeforeRace=(await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "WorkforceAuditLog"`)[0].count;
  const raceImports=createKioskCashImports(db,{parse:async(...args)=>{const doc=await parseKioskCashWorkbook(...args);await db.$executeRaw`UPDATE "User" SET "role"='EMPLOYEE' WHERE "id"='actor'`;return doc;}});
  app.use('/race',createCashReconciliationRouter({db,imports:raceImports,repository:{generation:async s=>(await readLifecycleGeneration(db,s)).generation}}));
  const revokedDuringParse=await fetch(origin+'/race/stores/store/kiosk-sources',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...journalBody,requestId:randomUUID()})});assert.equal(revokedDuringParse.status,403);
  assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "WorkforceAuditLog"`)[0].count,auditBeforeRace);await db.$executeRaw`UPDATE "User" SET "role"='SUPER_ADMIN' WHERE "id"='actor'`;
  const originalFiles=await db.$queryRaw`SELECT * FROM "DocumentAttachment" ORDER BY "id"`;
  const revoke={requestId:randomUUID(),generation:'0',sourceId:journalId,reason:'Δοκιμή αφαίρεσης πηγής από την ανάλυση.'};r=await post('/revoke',revoke);assert.equal(r.status,200);assert.equal((await post('/revoke',revoke)).body.reused,true);
  assert.equal((await readKioskCashEvidence(db,scope,period)).status,'UNAVAILABLE');assert.deepEqual(await db.$queryRaw`SELECT * FROM "DocumentAttachment" ORDER BY "id"`,originalFiles);
  r=await post('',{...journalBody,requestId:randomUUID()});assert.equal(r.status,200);assert.equal((await readKioskCashEvidence(db,scope,period)).status,'AVAILABLE');
  r=await post('/revoke',{requestId:randomUUID(),generation:'0',sourceId:outcomes[0].sourceId,reason:'Αφαίρεση για δοκιμή ανθεκτικής επανάληψης.'});assert.equal(r.status,200);
  const oldAlias=await post('',aliasBody);assert.equal(oldAlias.status,200);assert.equal(oldAlias.body.reused,true);assert.equal((await service.list(scope,period)).sources.length,1,'accepted replay cannot resurrect a deliberately revoked original');
  assert.equal((await post('',{...originalBody,requestId:randomUUID()})).status,200);
  await db.$executeRaw`UPDATE "DocumentAttachment" SET "contentData"='tampered' WHERE "documentType"='CASH_KIOSK_SOURCE' AND "filename"='JOURNAL.xls'`;assert.equal((await readKioskCashEvidence(db,scope,period)).status,'UNAVAILABLE');
  const auditCount=(await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "WorkforceAuditLog"`)[0].count;
  await db.$executeRaw`UPDATE "StoreLifecycleFence" SET "generation"=1 WHERE "storeId"='store'`;assert.equal((await post('',{...journalBody,requestId:randomUUID()})).status,409);
  assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "WorkforceAuditLog"`)[0].count,auditCount);assert.equal(await financial(),before);
  assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "DocumentAttachment" WHERE "storeId"='control'`)[0].count,0);
 }finally{if(server)await new Promise(r=>server.close(r));await other.$disconnect();await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();}
});
