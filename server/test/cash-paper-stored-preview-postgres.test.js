import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readCashChatEvidence} from '../src/services/cash-chat-evidence.js';
import {createCashPaperRepository} from '../src/services/cash-paper-repository.js';
import {paperKey,intentId,completionId,CASH_PAPER_ENTITY} from '../src/services/cash-paper-contract.js';
import {boundAutomaticPaperDiscovery,automaticPaperByteLimit,projectAutomaticPaperEvidence} from '../src/services/cash-paper-automatic.js';
import {readStoredCashPaperPreview} from '../src/services/cash-paper-stored-preview.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native stored preview: same-snapshot original validation, aggregate admission, incomplete projection and tenant/generation invariance',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='cash_stored_'+randomUUID().replaceAll('-','');
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 const scope={companyId:'c',storeId:'s',generation:'0'},bytes=Buffer.from('%PDF-1.4\nsynthetic-original\n%%EOF'),checksum=createHash('sha256').update(bytes).digest('hex');
 const raw={dateText:'01/11/2026',documentDate:'2026-11-01',operatorText:'TEST',shiftText:null,notes:[],lines:[{kind:'EXPENSE',label:'synthetic expense',amountText:'10,00',quantityText:null,timeText:'11:30',uncertain:false}]};
 const original={session:{id:'shift',companyId:'c',storeId:'s',status:'CLOSED',openedByName:'TEST',openedAt:'2026-11-01T09:00:00Z',closedAt:'2026-11-01T10:00:00Z'},sourceHash:'a'.repeat(64),transactions:[{id:'expense',type:'OTHER_EXPENSE',cashEffect:true,amountCents:1000,occurredAt:'2026-11-01T09:30:00Z'}]};
 const sessions=new Map([['shift',original]]),originalBefore=JSON.stringify(original);
 async function snapshot(){return {messages:await db.$queryRaw`SELECT * FROM "StoreChatMessage" ORDER BY "id"`,readings:await db.$queryRaw`SELECT * FROM "WorkforceAuditLog" ORDER BY "id"`,ledger:await db.$queryRaw`SELECT * FROM "StoreTransaction" ORDER BY "id"`,reviews:await db.$queryRaw`SELECT * FROM "CashControlReview" ORDER BY "id"`};}
 async function read(selectedScope=scope){
  const before=await snapshot(),validated=[];
  const result=await db.$transaction(async tx=>{
   const discovery=await readCashChatEvidence(tx,selectedScope),admitted=boundAutomaticPaperDiscovery(discovery),repository=createCashPaperRepository(tx);
   const readonly={get:repository.get,source:async(...args)=>{validated.push(args[1]);return repository.source(...args);}};
   const preview=await readStoredCashPaperPreview({repository:readonly,scope:selectedScope,discovery,admitted,byteLimit:automaticPaperByteLimit});
   const evidence=projectAutomaticPaperEvidence({scope:selectedScope,sessions,...preview,selectedIds:['shift'],period:{from:'2026-11-01',to:'2026-11-01'},storeName:'synthetic'});
   return {preview,evidence,admitted};
  },{isolationLevel:'RepeatableRead',maxWait:5000,timeout:15000});
  assert.deepEqual(await snapshot(),before);assert.equal(JSON.stringify(original),originalBefore);
  assert.equal(result.evidence.financialAdjustmentCents,0);assert.equal(result.evidence.humanApproval,false);
  return {...result,validated};
 }
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await db.$executeRawUnsafe('CREATE TABLE "StoreChatMessage"("id" text primary key,"companyId" text,"storeId" text,"category" text,"createdAt" timestamp,"attachmentName" text,"attachmentMimeType" text,"attachmentSize" integer,"attachmentChecksum" text,"attachmentData" text)');
  await db.$executeRawUnsafe('CREATE TABLE "WorkforceAuditLog"("id" text primary key,"companyId" text,"storeId" text,"entityType" text,"entityId" text,"action" text,"afterJson" jsonb,"createdAt" timestamp)');
  await db.$executeRawUnsafe('CREATE TABLE "StoreTransaction"("id" text primary key,"companyId" text,"storeId" text,"amount" numeric)');
  await db.$executeRawUnsafe('CREATE TABLE "CashControlReview"("id" text primary key,"companyId" text,"storeId" text,"amount" numeric)');
  await db.$executeRaw`INSERT INTO "StoreTransaction" VALUES ('own','c','s',10),('control','other','control',20)`;
  await db.$executeRaw`INSERT INTO "CashControlReview" VALUES ('own','c','s',0),('control','other','control',3)`;
  await db.$executeRaw`INSERT INTO "StoreChatMessage" VALUES ('good','c','s','CASH','2026-11-01 12:00','good.pdf','application/pdf',${bytes.length},${checksum},${bytes.toString('base64')})`;
  await db.$executeRaw`INSERT INTO "StoreChatMessage" VALUES ('foreign','other','control','CASH','2026-11-01 13:00','foreign.pdf','application/pdf',${bytes.length},${checksum},${bytes.toString('base64')})`;
  const key=paperKey(scope,checksum),intent={version:1,generation:'0',checksum,status:'PENDING'},completion={version:1,generation:'0',checksum,status:'EXTRACTED_UNVERIFIED',raw};
  for(const [id,action,detail] of [[intentId(key),'CASH_PAPER_REQUESTED',intent],[completionId(key),'CASH_PAPER_COMPLETED',completion]])await db.$executeRaw`INSERT INTO "WorkforceAuditLog" VALUES (${id},'c','s',${CASH_PAPER_ENTITY},${key},${action},${JSON.stringify(detail)}::jsonb,'2026-11-01 12:01')`;
  const normal=await read();assert.equal(normal.evidence.coverage.readCount,1);assert.equal(normal.evidence.items[0].status,'MATCHED');assert.equal(normal.evidence.coverage.complete,true);assert.deepEqual(normal.validated,['good']);
  // Unrelated, unread metadata must not suppress the good original. It is not
  // fetched as an original and cannot satisfy paid admission or coverage.
  await db.$executeRaw`INSERT INTO "StoreChatMessage" VALUES ('oversized','c','s','GENERAL','2026-11-01 14:00','unrelated.pdf','application/pdf',${automaticPaperByteLimit+1},${'b'.repeat(64)},'JVBERi0=')`;
  const over=await read();assert.equal(over.admitted.reason,'ATTACHMENT_BYTE_LIMIT');assert.deepEqual(over.admitted.sources,[]);
  assert.equal(over.evidence.coverage.readCount,1);assert.equal(over.evidence.coverage.complete,false);assert.equal(over.evidence.status,'INCOMPLETE');assert.equal(over.preview.discovery.status,'LIMITED');assert.deepEqual(over.validated,['good']);
  assert.equal(over.evidence.items.find(i=>i.checksum===checksum).status,'MATCHED');
  await db.$executeRaw`UPDATE "StoreChatMessage" SET "attachmentSize"=NULL WHERE "id"='oversized'`;
  const unknown=await read();assert.equal(unknown.admitted.reason,'ATTACHMENT_SIZE_UNAVAILABLE');assert.equal(unknown.evidence.coverage.readCount,1);assert.equal(unknown.evidence.coverage.complete,false);assert.deepEqual(unknown.validated,['good']);
  const nextGeneration=await read({...scope,generation:'1'});assert.equal(nextGeneration.evidence.coverage.readCount,0);assert.deepEqual(nextGeneration.validated,[]);
  const foreign=await read({...scope,companyId:'other',storeId:'control'});assert.equal(foreign.evidence.coverage.readCount,0);assert.equal(foreign.preview.papers[0].reading.status,'NOT_READ');assert.doesNotMatch(JSON.stringify(foreign.preview),/good\.pdf|synthetic expense/);
  await assert.rejects(createCashPaperRepository(db).source({...scope,storeId:'control'},'good',checksum),e=>e.code==='CASH_PAPER_NOT_FOUND');
  await db.$executeRaw`UPDATE "StoreChatMessage" SET "attachmentData"=${Buffer.from('%PDF-1.4\ntampered\n%%EOF').toString('base64')} WHERE "id"='good'`;
  const tampered=await read();assert.equal(tampered.evidence.coverage.readCount,0);assert.equal(tampered.preview.papers.find(p=>p.checksum===checksum).reading.status,'REQUIRES_REVIEW');assert.equal(tampered.evidence.coverage.complete,false);assert.doesNotMatch(JSON.stringify(tampered.preview.papers),/synthetic expense/);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();}
});
