import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createCashReconciliationRepository} from '../src/services/cash-reconciliation-repository.js';
import {readAutomaticCashPreviewInTransaction} from '../src/services/automatic-report-source.js';
import {buildAutomaticCashPayload} from '../src/services/automatic-report-cash-payload.js';
import {reportWallTime} from '../src/services/automatic-report-policy.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('isolated postgres reviewed offset and confirmations feed exact business shifts without writes',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='cash_auto_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
 const db=new PrismaClient({datasourceUrl:url.toString()}),scope={companyId:'co',storeId:'store',generation:'0'},actor={id:'actor',fullName:'Χρήστος Μάνης'},period={from:'2026-10-21',to:'2026-10-22'};
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "Company"("id" text primary key,"active" boolean)',
   'CREATE TABLE "Store"("id" text primary key,"companyId" text,"name" text,"active" boolean)',
   'CREATE TABLE "User"("id" text primary key,"companyId" text,"fullName" text,"role" text,"mustChangePassword" boolean)',
   'CREATE TABLE "StoreLifecycleFence"("storeId" text primary key,"companyId" text,"generation" bigint,"maintenance" boolean,"retired" boolean)',
   'CREATE TABLE "CashControlStoreRule"("storeId" text primary key,"companyId" text,"mode" text,"deliveryTerminalPattern" text,"carryOverEnabled" boolean,"posEftposEnabled" boolean,"updatedAt" timestamp default NOW())',
   'CREATE TABLE "AutomaticReportSettings"("storeId" text primary key,"companyId" text,"version" integer)',
   'CREATE TABLE "CashShiftSession"("id" text primary key,"companyId" text,"storeId" text,"terminalPos" text,"status" text,"openedBy" text,"openedByName" text,"shiftLabel" text,"openedAt" timestamp,"closedAt" timestamp,"variance" numeric(14,2),"cardVariance" numeric(14,2),"openingOperational" numeric(14,2),"actualOperational" numeric(14,2),"updatedAt" timestamp default NOW())',
   'CREATE TABLE "StoreTransaction"("id" text primary key,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric(14,2),"description" text,"subtractFromShift" boolean default true,"attachmentData" text,"occurredAt" timestamp,"createdAt" timestamp default NOW(),"reversedAt" timestamp)',
   'CREATE TABLE "CashControlReview"("id" text,"companyId" text,"storeId" text,"sessionId" text,"decision" text,"amount" numeric,"note" text,"actorId" text,"actorName" text,"snapshotJson" jsonb,"createdAt" timestamp)',
   'CREATE TABLE "WorkforceAuditLog"("id" text primary key,"companyId" text,"storeId" text,"actorUserId" text,"action" text,"entityType" text,"entityId" text,"afterJson" jsonb,"createdAt" timestamp default NOW())'
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "Company" VALUES ('co',true),('foreign',true)`;
  await db.$executeRaw`INSERT INTO "Store" VALUES ('store','co','LAB',true),('other','foreign','Other',true)`;
  await db.$executeRaw`INSERT INTO "User" VALUES ('actor','co','Χρήστος Μάνης','SUPER_ADMIN',false)`;
  await db.$executeRaw`INSERT INTO "StoreLifecycleFence" VALUES ('store','co',0,false,false)`;
  await db.$executeRaw`INSERT INTO "CashControlStoreRule" ("storeId","companyId","mode","deliveryTerminalPattern","carryOverEnabled","posEftposEnabled") VALUES ('store','co','FULL','DELIVERY',true,true)`;
  await db.$executeRaw`INSERT INTO "AutomaticReportSettings" VALUES ('store','co',1)`;
  for(const [id,day,hour,endDay,endHour,cash,card] of [['a','2026-10-21',7,'2026-10-21',15,-10,200],['b','2026-10-21',15,'2026-10-21',23,8,0],['c','2026-10-21',23,'2026-10-22',7,0,0],['d','2026-10-22',7,'2026-10-22',15,0,0]]){
   const opened=new Date(reportWallTime(day,7).getTime()+(hour-7)*3600000),closed=new Date(reportWallTime(endDay,7).getTime()+(endHour-7)*3600000);
   await db.$executeRaw`INSERT INTO "CashShiftSession" ("id","companyId","storeId","terminalPos","status","openedBy","openedByName","shiftLabel","openedAt","closedAt","variance","cardVariance","openingOperational","actualOperational") VALUES (${id},'co','store','MAIN','CLOSED',${'employee-'+id},${'Χειριστής '+id},'Βάρδια',${opened},${closed},${cash},${card},100,100)`;
  }
  await db.$executeRaw`INSERT INTO "CashShiftSession" ("id","companyId","storeId","terminalPos","status","openedByName","openedAt","closedAt","variance","cardVariance") VALUES ('foreign','foreign','other','MAIN','CLOSED','Other','2026-10-21 04:00','2026-10-21 12:00',0,0)`;
  const repo=createCashReconciliationRepository(db),initial=await repo.read(scope,period),a=initial.rows.find(x=>x.sessionId==='a'),b=initial.rows.find(x=>x.sessionId==='b');
  const make=(head,data)=>({requestId:randomUUID(),head,generation:'0',period,data});
  let current=await repo.apply(scope,actor,make(initial.head,{kind:'OFFSET',previousSessionId:'a',nextSessionId:'b',previousHash:a.sourceHash,nextHash:b.sourceHash,amountCents:200,countingErrorConfirmed:true,note:'Επαληθεύτηκε λάθος καταμέτρησης.'}));
  for(const id of ['a','b','c']){const r=current.rows.find(x=>x.sessionId===id);current=await repo.apply(scope,actor,make(current.head,{kind:'CONFIRM',sessionId:id,sourceHash:r.sourceHash,planHash:r.planHash,note:'Ελέγχθηκαν οι κινήσεις βάρδιας.',reviewed:true}));}
  const before=await db.$queryRaw`SELECT * FROM "CashShiftSession" ORDER BY "id"`,beforeReview=await db.$queryRaw`SELECT * FROM "CashControlReview"`,beforeAudit=await db.$queryRaw`SELECT * FROM "WorkforceAuditLog" ORDER BY "id"`;
  const configuration={dayStartHour:7,secondShiftStartHour:15,thirdShiftStartHour:23,terminals:[{terminalPos:'MAIN',requiredSlots:[1,2,3]}],cashRule:{mode:'FULL',deliveryTerminalPattern:'DELIVERY',carryOverEnabled:true,posEftposEnabled:true},reviewedReconciliation:true};
  const input={actorId:'actor',companyId:'co',storeId:'store',day:'2026-10-21',configuration,settingsVersion:1,now:new Date('2026-10-22T09:00:00+03:00')};
  const read=()=>db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');return readAutomaticCashPreviewInTransaction(tx,input)},{isolationLevel:'RepeatableRead',timeout:30000});
  const p=await read();assert.equal(p.ready,true);assert.equal(p.reviewedCash.status,'READY');assert.deepEqual(p.reviewedCash.report.rows.map(r=>r.sessionId),['a','b','c']);assert.equal(p.reviewedCash.report.totals.shortageCents,800);assert.equal(p.reviewedCash.report.totals.surplusCents,600);assert.equal(p.reviewedCash.report.rows[0].cardCents,20000);
  const payload=buildAutomaticCashPayload({preview:p,companyId:'co',storeId:'store',settingsVersion:1});assert.equal(buildAutomaticCashPayload({preview:await read(),companyId:'co',storeId:'store',settingsVersion:1}).payloadFingerprint,payload.payloadFingerprint);
  await assert.rejects(db.$transaction(tx=>repo.readSelectedInTransaction(tx,scope,period,['foreign'])),e=>e.code==='CASH_RECONCILIATION_NOT_FOUND');
  assert.deepEqual(await db.$queryRaw`SELECT * FROM "CashShiftSession" ORDER BY "id"`,before);assert.deepEqual(await db.$queryRaw`SELECT * FROM "CashControlReview"`,beforeReview);assert.deepEqual(await db.$queryRaw`SELECT * FROM "WorkforceAuditLog" ORDER BY "id"`,beforeAudit);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
