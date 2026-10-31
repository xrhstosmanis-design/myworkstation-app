import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import express from 'express';
import {createServer} from 'node:http';
import {createCashReconciliationRepository} from '../src/services/cash-reconciliation-repository.js';
import {createCashReconciliationRouter} from '../src/routes/cash-reconciliation.js';
import {paperKey,intentId,completionId} from '../src/services/cash-paper-contract.js';
import {scopeKey,hash,actionId,requestHash} from '../src/services/cash-reconciliation-contract.js';
import {readReconciliationSources} from '../src/services/cash-reconciliation-source.js';
import {projectReconciliation} from '../src/services/cash-reconciliation-report.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};

test('native original handoff HTTP lifecycle: concurrent once-only replies, both-half freshness, close/reopen and unchanged finance/control',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='cash_handoff_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});let server;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "Company"("id" text primary key,"active" boolean)',
   'CREATE TABLE "Store"("id" text primary key,"companyId" text,"name" text,"active" boolean)',
   'CREATE TABLE "User"("id" text primary key,"companyId" text,"fullName" text,"role" text,"mustChangePassword" boolean)',
   'CREATE TABLE "StoreLifecycleFence"("storeId" text primary key,"companyId" text,"generation" bigint,"maintenance" boolean,"retired" boolean)',
   'CREATE TABLE "CashControlStoreRule"("storeId" text,"companyId" text,"mode" text,"deliveryTerminalPattern" text,"carryOverEnabled" boolean,"posEftposEnabled" boolean,"updatedAt" timestamp)',
   'CREATE TABLE "CashShiftSession"("id" text primary key,"companyId" text,"storeId" text,"terminalPos" text,"status" text,"openedBy" text,"openedByName" text,"shiftLabel" text,"openedAt" timestamptz,"closedAt" timestamptz,"variance" numeric,"cardVariance" numeric,"openingDrawer" numeric,"openingCustody" numeric,"openingCoins" numeric,"openingOperational" numeric,"closingDrawer" numeric,"closingCustody" numeric,"closingCoins" numeric,"actualOperational" numeric,"expectedOperational" numeric,"cashSales" numeric,"expenses" numeric,"cardSales" numeric,"eftposTotal" numeric,"updatedAt" timestamp)',
   'CREATE TABLE "StoreTransaction"("id" text primary key,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric,"description" text,"subtractFromShift" boolean,"attachmentData" text,"occurredAt" timestamptz,"createdAt" timestamptz,"reversedAt" timestamptz)',
   'CREATE TABLE "CashControlReview"("id" text,"companyId" text,"storeId" text,"sessionId" text,"decision" text,"amount" numeric,"note" text,"actorId" text,"actorName" text,"snapshotJson" jsonb,"createdAt" timestamp)',
   'CREATE TABLE "WorkforceAuditLog"("id" text primary key,"companyId" text,"storeId" text,"actorUserId" text,"action" text,"entityType" text,"entityId" text,"afterJson" jsonb,"createdAt" timestamp default NOW())'
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "Company" VALUES ('co',true),('foreign',true)`;
  await db.$executeRaw`INSERT INTO "Store" VALUES ('store','co','LAB',true),('control','foreign','Control',true)`;
  await db.$executeRaw`INSERT INTO "User" VALUES ('actor','co','Synthetic auditor','SUPER_ADMIN',false)`;
  await db.$executeRaw`INSERT INTO "StoreLifecycleFence" VALUES ('store','co',0,false,false)`;
  for(const [id,store,company,cash,opened,closed]of [['a','store','co',100,'2026-10-21T06:00Z','2026-10-21T14:00Z'],['b','store','co',219,'2026-10-21T14:01Z','2026-10-21T22:00Z'],['control','control','foreign',7,'2026-10-21T06:00Z','2026-10-21T14:00Z']])await db.$executeRaw`INSERT INTO "CashShiftSession" VALUES (${id},${company},${store},'MAIN','CLOSED',${'operator-'+id},${id},'Βάρδια',${new Date(opened)},${new Date(closed)},0,0,${cash},0,0,${cash},${cash},0,0,${cash},${cash},0,0,0,0,NOW())`;
  const finance=async()=>({sessions:await db.$queryRaw`SELECT to_jsonb(s) row FROM "CashShiftSession" s ORDER BY "id"`,transactions:await db.$queryRaw`SELECT to_jsonb(t) row FROM "StoreTransaction" t ORDER BY "id"`,reviews:await db.$queryRaw`SELECT * FROM "CashControlReview"`}),before=await finance();
  const scope={companyId:'co',storeId:'store',generation:'0'},period={from:'2026-10-21',to:'2026-10-21'},repository=createCashReconciliationRepository(db);let current=await repository.read(scope,period);
  assert.equal(current.handoffRegister.issues.length,1);assert.deepEqual(current.rows.map(r=>r.sessionId),['a']);assert.equal(current.handoffRegister.issues[0].differenceCents,11900);const initial=structuredClone(current.rows);
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={id:'actor',companyId:'co',role:'SUPER_ADMIN'};next()});app.use(createCashReconciliationRouter({db}));server=createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
  const make=(status='OPEN',note='Συγκεκριμένη απάντηση για την αρχική παράδοση.')=>{const q=current.handoffRegister.issues[0];return {requestId:randomUUID(),generation:'0',head:current.head,period,data:{kind:'HANDOFF_ISSUE',issueId:q.id,previousSessionId:q.previousSessionId,nextSessionId:q.nextSessionId,previousHash:q.previousHash,nextHash:q.nextHash,issueFingerprint:q.fingerprint,reportHash:current.reportHash,status,note,reviewed:true}};};
  const post=async(r,store='store')=>{const response=await fetch(origin+`/stores/${store}/reviews`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(r)});return {status:response.status,body:await response.json()};};
  const requests=[make(),make()],race=await Promise.all(requests.map(r=>post(r)));assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);const winner=race.findIndex(r=>r.status===200);current=race[winner].body;
  assert.equal((await post(requests[winner])).body.reused,true);assert.equal((await post({...requests[winner],data:{...requests[winner].data,note:'Αλλαγμένη απάντηση με την ίδια ταυτότητα.'}})).body.code,'CASH_RECONCILIATION_REPLAY_CHANGED');
  const close=await post(make('CLOSED'));assert.equal(close.status,200);current=close.body;assert.equal(current.handoffRegister.issues[0].status,'CLOSED');assert.deepEqual(current.rows,JSON.parse(JSON.stringify(initial)));assert.match(current.text,/απόκλιση/);
  const held=make();await db.$executeRaw`UPDATE "CashShiftSession" SET "openingOperational"=220 WHERE "id"='b'`;
  current=await repository.read(scope,period);assert.equal(current.handoffRegister.issues[0].status,'RECHECK_REQUIRED');const denied=await post({...held,data:{...held.data,reportHash:current.reportHash}});assert.equal(denied.status,409);assert.equal(denied.body.code,'CASH_HANDOFF_ISSUE_SOURCE_CHANGED');
  await db.$executeRaw`UPDATE "CashShiftSession" SET "openingOperational"=219 WHERE "id"='b'`;
  current=await repository.read(scope,period);const heldPrevious=make();await db.$executeRaw`UPDATE "CashShiftSession" SET "actualOperational"=101 WHERE "id"='a'`;
  current=await repository.read(scope,period);assert.equal((await post({...heldPrevious,data:{...heldPrevious.data,reportHash:current.reportHash}})).body.code,'CASH_HANDOFF_ISSUE_SOURCE_CHANGED');
  await db.$executeRaw`UPDATE "CashShiftSession" SET "actualOperational"=100 WHERE "id"='a'`;current=await repository.read(scope,period);
  assert([404,409].includes((await post(make(),'control')).status));assert.equal((await post({...make(),generation:'1'})).status,409);
  await db.$executeRaw`UPDATE "User" SET "role"='EMPLOYEE' WHERE "id"='actor'`;assert.equal((await post(make())).status,403);await db.$executeRaw`UPDATE "User" SET "role"='SUPER_ADMIN' WHERE "id"='actor'`;
  const reopened=await post(make('OPEN'));assert.equal(reopened.status,200);current=reopened.body;assert.equal(current.handoffRegister.issues[0].repliesCount,3);assert.equal(current.handoffRegister.issues[0].status,'OPEN');assert.equal(current.historyTotal,3);assert.equal(current.history[1].handoff.status,'CLOSED');
  assert.deepEqual(current.rows,JSON.parse(JSON.stringify(initial)));assert.deepEqual(await finance(),before);assert.equal((await db.$queryRaw`SELECT COUNT(*)::int n FROM "WorkforceAuditLog" WHERE "storeId"='control'`)[0].n,0);
  await db.$executeRaw`UPDATE "StoreLifecycleFence" SET "maintenance"=true WHERE "storeId"='store'`;assert.equal((await post(make())).status,409);assert.equal((await db.$queryRaw`SELECT COUNT(*)::int n FROM "WorkforceAuditLog"`)[0].n,3);
 }finally{if(server)await new Promise(r=>server.close(r));await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();}
});

test('native automatic arithmetic reads real original fields and keeps document issues, original finance and control unchanged',{skip:!isolated()},async()=>{
 let issueServer;
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='cash_auto_arithmetic_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "Store"("id" text primary key,"companyId" text,"name" text)',
   'CREATE TABLE "CashControlStoreRule"("storeId" text,"companyId" text,"mode" text,"deliveryTerminalPattern" text,"carryOverEnabled" boolean,"posEftposEnabled" boolean,"updatedAt" timestamp)',
   'CREATE TABLE "CashShiftSession"("id" text primary key,"companyId" text,"storeId" text,"terminalPos" text,"status" text,"openedBy" text,"openedByName" text,"shiftLabel" text,"openedAt" timestamptz,"closedAt" timestamptz,"variance" numeric(14,2),"cardVariance" numeric(14,2),"openingDrawer" numeric,"openingCustody" numeric,"openingCoins" numeric,"openingOperational" numeric,"closingDrawer" numeric,"closingCustody" numeric,"closingCoins" numeric,"actualOperational" numeric,"expectedOperational" numeric,"cashSales" numeric,"expenses" numeric,"cardSales" numeric,"eftposTotal" numeric,"updatedAt" timestamp)',
   'CREATE TABLE "StoreTransaction"("id" text primary key,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric(14,2),"description" text,"subtractFromShift" boolean,"attachmentData" text,"occurredAt" timestamptz,"createdAt" timestamptz,"reversedAt" timestamptz)',
   'CREATE TABLE "CashControlReview"("id" text,"companyId" text,"storeId" text,"sessionId" text,"decision" text,"amount" numeric,"note" text,"actorId" text,"actorName" text,"snapshotJson" jsonb,"createdAt" timestamp)'
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "Store" VALUES ('store','co','LAB'),('control','other','Control')`;
  for(const [id,store,company,opening,closing,cash,expenses,card,variance,opened,closed] of [
   ['a','store','co',100,95,25,25,20,-5,'2026-10-21T06:00Z','2026-10-21T14:00Z'],
   ['b','store','co',95,95,0,0,0,0,'2026-10-21T14:01Z','2026-10-21T22:00Z'],
   ['control','control','other',0,0,0,0,0,0,'2026-10-21T06:00Z','2026-10-21T14:00Z']
  ])await db.$executeRaw`INSERT INTO "CashShiftSession" VALUES (${id},${company},${store},'MAIN','CLOSED',${'employee-'+id},${id},'Βάρδια',${new Date(opened)},${new Date(closed)},${variance},0,${opening},0,0,${opening},${closing},0,0,${closing},${opening+cash-expenses},${cash},${expenses},${card},${card},NOW())`;
  for(const [id,type,amount,reversed] of [['cash','SALE_CASH',25,false],['expense','OTHER_EXPENSE',25,false],['card','SALE_CARD',20,false],['reversed','SALE_CASH',100,true]])await db.$executeRaw`INSERT INTO "StoreTransaction" VALUES (${id},'co','store','a',${type},${amount},'Original',true,NULL,'2026-10-21 10:00Z','2026-10-21 10:00Z',${reversed?new Date('2026-10-21T11:00Z'):null})`;
  const before=await db.$queryRaw`SELECT to_jsonb(s) AS row FROM "CashShiftSession" s ORDER BY "id"`,txBefore=await db.$queryRaw`SELECT to_jsonb(t) AS row FROM "StoreTransaction" t ORDER BY "id"`;
  const scope={companyId:'co',storeId:'store'},period={from:'2026-10-21',to:'2026-10-21'};
  const read=async()=>projectReconciliation(await readReconciliationSources(db,scope,period),[]);
  const report=await read(),a=report.rows.find(r=>r.sessionId==='a');
  assert.equal(a.automaticAudit.status,'CALCULATED');assert.equal(a.automaticAudit.cashVarianceCents,-500);assert.equal(a.automaticAudit.bankCardVarianceCents,0);assert.equal(a.reviewed,false);assert.equal(a.remainingCents,-500);assert.equal(a.offsetCents,0);assert.equal(a.automaticallyCalculated,true);assert.equal(report.calculatedResult.shortageCents,500);assert.equal(report.calculatedResult.automaticCount,1);assert.equal(report.calculatedResult.pending,0);assert.deepEqual(report.rows.map(r=>r.sessionId),['a'],'the 22:00 UTC handoff closes on the next Greek calendar day and is context only');assert(report.context.some(r=>r.sessionId==='b'));
  assert.match(report.text,/έξοδο 25,00.*χωρίς παραστατικό/);assert(!report.rows.some(r=>r.sessionId==='control'));assert.equal(report.totals.shortageCents,0);
  assert.deepEqual(await db.$queryRaw`SELECT to_jsonb(s) AS row FROM "CashShiftSession" s ORDER BY "id"`,before);assert.deepEqual(await db.$queryRaw`SELECT to_jsonb(t) AS row FROM "StoreTransaction" t ORDER BY "id"`,txBefore);
  assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "CashControlReview"`)[0].n,0);
  // Exercise the real continuation writer on the same automatic source and preserve the document question.
  await db.$executeRawUnsafe('ALTER TABLE "Store" ADD COLUMN "active" boolean DEFAULT true');
  await db.$executeRawUnsafe('CREATE TABLE "Company"("id" text primary key,"active" boolean)');
  await db.$executeRawUnsafe('CREATE TABLE "StoreLifecycleFence"("storeId" text primary key,"companyId" text,"generation" bigint,"maintenance" boolean,"retired" boolean)');
  await db.$executeRawUnsafe('CREATE TABLE "WorkforceAuditLog"("id" text primary key,"companyId" text,"storeId" text,"actorUserId" text,"action" text,"entityType" text,"entityId" text,"afterJson" jsonb,"createdAt" timestamp default NOW())');
  await db.$executeRaw`INSERT INTO "Company" VALUES ('co',true),('other',true)`;
  await db.$executeRaw`INSERT INTO "StoreLifecycleFence" VALUES ('store','co',0,false,false)`;
  await db.$executeRawUnsafe('CREATE TABLE "User"("id" text primary key,"companyId" text,"fullName" text,"role" text,"mustChangePassword" boolean)');
  await db.$executeRaw`INSERT INTO "User" VALUES ('actor','co','Synthetic auditor','SUPER_ADMIN',false)`;
  const repository=createCashReconciliationRepository(db),writeScope={...scope,generation:'0'},actor={id:'actor',fullName:'Synthetic auditor'};
  let current=await repository.read(writeScope,period);
  const request={requestId:randomUUID(),generation:'0',head:current.head,period,data:{kind:'CHECKPOINT',resumeFrom:'2026-10-22',reportHash:current.reportHash,pendingNotes:['Έξοδο25EUR: αναμονή παραστατικού.'],note:'Συνέχεια μετά τον αυτόματο αριθμητικό έλεγχο.',reviewed:true}};
  const saved=await repository.apply(writeScope,actor,request);assert.equal(saved.checkpoint.resumeFrom,'2026-10-22');assert.equal(saved.checkpoint.current,true);assert.equal(saved.rows[0].reviewed,false);assert.equal(saved.rows[0].automaticallyCalculated,true);assert.match(saved.text,/χωρίς παραστατικό/);assert.match(saved.text,/αναμονή παραστατικού/);
  assert.equal((await repository.apply(writeScope,actor,request)).reused,true);
  const records=await db.$queryRaw`SELECT "afterJson" FROM "WorkforceAuditLog" WHERE "entityType"='CASH_RECONCILIATION'`;
  assert.equal(records.length,1);assert.deepEqual(records[0].afterJson.proof.pendingSessions,[]);
  await assert.rejects(repository.apply(writeScope,actor,{...request,requestId:randomUUID()}),e=>e.code==='CASH_RECONCILIATION_STALE_HEAD');
  await assert.rejects(repository.apply(writeScope,actor,{...request,requestId:randomUUID(),head:saved.head,data:{...request.data,reportHash:'f'.repeat(64)}}),e=>e.code==='CASH_RECONCILIATION_SOURCE_CHANGED');
  const lastPeriod={from:'2026-10-22',to:'2026-10-22'},last=await repository.read(writeScope,lastPeriod);
  assert(last.rows.some(r=>r.sessionId==='b'&&!r.automaticallyCalculated));
  await assert.rejects(repository.apply(writeScope,actor,{...request,requestId:randomUUID(),head:saved.head,period:lastPeriod,data:{...request.data,resumeFrom:'2026-10-23',reportHash:last.reportHash}}),e=>e.code==='CASH_RECONCILIATION_CHECKPOINT_INVALID');
  assert.deepEqual(await db.$queryRaw`SELECT to_jsonb(s) AS row FROM "CashShiftSession" s ORDER BY "id"`,before);assert.deepEqual(await db.$queryRaw`SELECT to_jsonb(t) AS row FROM "StoreTransaction" t ORDER BY "id"`,txBefore);
  // Real registered HTTP lifecycle: each reply binds one original expense, not its amount.
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={id:'actor',companyId:'co',role:'SUPER_ADMIN'};next()});app.use(createCashReconciliationRouter({db}));issueServer=createServer(app);await new Promise(resolve=>issueServer.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${issueServer.address().port}`;
  current=await repository.read(writeScope,period);
  const makeIssue=(status,note='Ελέγχθηκε το πρωτότυπο της συγκεκριμένης κίνησης.')=>{const q=current.issueRegister.issues.find(q=>q.transactionId==='expense');return {requestId:randomUUID(),generation:'0',head:current.head,period,data:{kind:'ISSUE',issueId:q.id,sessionId:q.sessionId,sourceHash:q.sourceHash,issueFingerprint:q.fingerprint,reportHash:current.reportHash,status,note,reviewed:true}};};
  const post=async(request,store='store')=>{const response=await fetch(origin+`/stores/${store}/reviews`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});return {status:response.status,body:await response.json()};};
  const raceRequests=[makeIssue('OPEN'),makeIssue('OPEN','Ανεξάρτητη ταυτόχρονη απάντηση στην ίδια κίνηση.')],race=await Promise.all(raceRequests.map(r=>post(r)));
  assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);const winner=race.findIndex(r=>r.status===200);current=race[winner].body;assert.equal((await post(raceRequests[winner])).body.reused,true);
  const savedIssue=current.issueRegister.issues.find(q=>q.transactionId==='expense');assert.equal(savedIssue.status,'OPEN');assert.equal(savedIssue.repliesCount,1);
  const close=await post(makeIssue('CLOSED'));assert.equal(close.status,200);current=close.body;assert.equal(current.issueRegister.issues.find(q=>q.transactionId==='expense').status,'CLOSED');assert.equal(current.rows[0].reviewed,false);assert.equal(current.rows[0].automaticallyCalculated,true);assert.equal(current.rows[0].remainingCents,-500);assert.equal(current.rows[0].cardCents,0);assert.equal(current.checkpoint.current,false,'a new answer changes the report snapshot, not the saved continuation notes');assert.deepEqual(current.checkpoint.pendingNotes,request.data.pendingNotes);
  const held=makeIssue('OPEN');await db.$executeRaw`UPDATE "StoreTransaction" SET "amount"=26 WHERE "id"='expense'`;
  const changedIssue=await repository.read(writeScope,period);assert.equal(changedIssue.issueRegister.issues.find(q=>q.transactionId==='expense').status,'RECHECK_REQUIRED');
  const stale=await post({...held,data:{...held.data,reportHash:changedIssue.reportHash}});assert.equal(stale.status,409);assert.equal(stale.body.code,'CASH_ISSUE_SOURCE_CHANGED');
  await db.$executeRaw`UPDATE "StoreTransaction" SET "amount"=25 WHERE "id"='expense'`;
  current=await repository.read(writeScope,period);
  assert([404,409].includes((await post(makeIssue('OPEN'),'control')).status));
  assert.equal((await post({...makeIssue('OPEN'),generation:'1'})).status,409);
  await db.$executeRaw`UPDATE "User" SET "role"='EMPLOYEE' WHERE "id"='actor'`;assert.equal((await post(makeIssue('OPEN'))).status,403);await db.$executeRaw`UPDATE "User" SET "role"='SUPER_ADMIN' WHERE "id"='actor'`;
  const reopened=await post(makeIssue('OPEN','Η συγκεκριμένη εκκρεμότητα ανοίγει ξανά για τεκμηρίωση.'));assert.equal(reopened.status,200);current=reopened.body;assert.equal(current.issueRegister.issues.find(q=>q.transactionId==='expense').status,'OPEN');assert.equal(current.issueRegister.issues.find(q=>q.transactionId==='expense').repliesCount,3);
  assert.deepEqual(await db.$queryRaw`SELECT to_jsonb(s) AS row FROM "CashShiftSession" s ORDER BY "id"`,before);assert.deepEqual(await db.$queryRaw`SELECT to_jsonb(t) AS row FROM "StoreTransaction" t ORDER BY "id"`,txBefore);assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "CashControlReview"`)[0].n,0);
  assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "WorkforceAuditLog" WHERE "storeId"='control'`)[0].n,0);
  await db.$executeRaw`UPDATE "CashShiftSession" SET "closingDrawer"=94 WHERE "id"='a'`;
  const changed=await read(),changedA=changed.rows.find(r=>r.sessionId==='a');assert.equal(changedA.automaticAudit.status,'INCOMPLETE');assert.equal(changedA.automaticallyCalculated,false);assert.equal(changedA.recheck,true);assert.equal(changed.calculatedResult.automaticCount,0);assert.equal(changed.calculatedResult.pending,1);assert.notEqual(changed.reportHash,report.reportHash);assert.equal(changedA.sourceHash,a.sourceHash,'new snapshot cannot rewrite old manual review identity');assert.equal(changedA.planHash,a.planHash);
  current=await repository.read(writeScope,period);
  await assert.rejects(repository.apply(writeScope,actor,{...request,requestId:randomUUID(),head:current.head,data:{...request.data,reportHash:current.reportHash}}),e=>e.code==='CASH_RECONCILIATION_CHECKPOINT_INVALID');
  assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "WorkforceAuditLog" WHERE "entityType"='CASH_RECONCILIATION'`)[0].n,4,'held requests never add audit records');
  assert.deepEqual((await db.$queryRaw`SELECT to_jsonb(s) AS row FROM "CashShiftSession" s WHERE "id"='control'`)[0].row,before.find(x=>x.row.id==='control').row);
 }finally{if(issueServer)await new Promise(resolve=>issueServer.close(resolve));await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
test('native reviewed cash: real source/HTTP, serialized two-client once-only offsets, paper allocation, stale sources and checkpoint with immutable finance/control',{skip:!isolated()},async()=>{
 const {PrismaClient,Prisma}=await import('@prisma/client'),admin=new PrismaClient(),schema='cash_reconcile_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
 const db=new PrismaClient({datasourceUrl:url.toString()}),other=new PrismaClient({datasourceUrl:url.toString()}),scope={companyId:'co',storeId:'store',generation:'0'},actor={id:'actor',fullName:'Χρήστος Μάνης'},period={from:'2026-10-21',to:'2026-10-23'};let server;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "Company"("id" text primary key,"active" boolean)',
   'CREATE TABLE "Store"("id" text primary key,"companyId" text,"name" text,"active" boolean)',
   'CREATE TABLE "User"("id" text primary key,"companyId" text,"fullName" text,"role" text,"mustChangePassword" boolean)',
   'CREATE TABLE "StoreLifecycleFence"("storeId" text primary key,"companyId" text,"generation" bigint,"maintenance" boolean,"retired" boolean)',
   'CREATE TABLE "CashControlStoreRule"("storeId" text primary key,"companyId" text,"mode" text,"deliveryTerminalPattern" text,"carryOverEnabled" boolean,"posEftposEnabled" boolean,"updatedAt" timestamp default NOW())',
   'CREATE TABLE "CashShiftSession"("id" text primary key,"companyId" text,"storeId" text,"terminalPos" text,"status" text,"openedBy" text,"openedByName" text,"shiftLabel" text,"openedAt" timestamp,"closedAt" timestamp,"variance" numeric(14,2),"cardVariance" numeric(14,2),"openingOperational" numeric(14,2),"actualOperational" numeric(14,2),"updatedAt" timestamp default NOW())',
   'CREATE TABLE "StoreTransaction"("id" text primary key,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric(14,2),"description" text,"subtractFromShift" boolean default true,"attachmentData" text,"occurredAt" timestamp,"createdAt" timestamp default NOW(),"reversedAt" timestamp)',
   'CREATE TABLE "CashControlReview"("id" text,"companyId" text,"storeId" text,"sessionId" text,"decision" text,"amount" numeric,"note" text,"actorId" text,"actorName" text,"snapshotJson" jsonb,"createdAt" timestamp)',
   'CREATE TABLE "StoreChatMessage"("id" text primary key,"companyId" text,"storeId" text,"attachmentName" text,"attachmentMimeType" text,"attachmentSize" integer,"attachmentChecksum" text,"attachmentData" text)',
   'CREATE TABLE "WorkforceAuditLog"("id" text primary key,"companyId" text,"storeId" text,"actorUserId" text,"action" text,"entityType" text,"entityId" text,"afterJson" jsonb,"createdAt" timestamp default NOW())',
   'CREATE TABLE "Sale"("id" text,"total" numeric)', 'CREATE TABLE "Payment"("id" text,"amount" numeric)'
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "Company" VALUES ('co',true),('foreign',true)`;
  await db.$executeRaw`INSERT INTO "Store" VALUES ('store','co','Κατάστημα Δοκιμής',true),('control','co','Control',true),('foreign','foreign','Foreign',true)`;
  await db.$executeRaw`INSERT INTO "User" VALUES ('actor','co','Χρήστος Μάνης','SUPER_ADMIN',false)`;
  await db.$executeRaw`INSERT INTO "StoreLifecycleFence" VALUES ('store','co',0,false,false)`;
  await db.$executeRaw`INSERT INTO "CashControlStoreRule" ("storeId","companyId","mode","deliveryTerminalPattern","carryOverEnabled","posEftposEnabled") VALUES ('store','co','FULL','DELIVERY',true,true)`;
  for(const [id,day,cash,card,name]of [['a',21,-87,200,'Χρυσάνθη'],['b',22,80,-10,'Γιάννης'],['c',23,-10,0,'Χρυσάνθη']])await db.$executeRaw`INSERT INTO "CashShiftSession" ("id","companyId","storeId","terminalPos","status","openedBy","openedByName","shiftLabel","openedAt","closedAt","variance","cardVariance","openingOperational","actualOperational") VALUES (${id},'co','store','MAIN','CLOSED',${'operator-'+id},${name},'Πρωινή',${new Date(`2026-10-${day}T06:00Z`)},${new Date(`2026-10-${day}T14:00Z`)},${cash},${card},100,100)`;
  await db.$executeRaw`INSERT INTO "CashShiftSession" ("id","companyId","storeId","terminalPos","status","openedByName","openedAt") VALUES ('d','co','store','MAIN','OPEN','Next','2026-10-24 06:00')`;
  for(const [id,company,store,terminal]of [['control','co','control','MAIN'],['foreign','foreign','foreign','MAIN'],['delivery','co','store','DELIVERY']])await db.$executeRaw`INSERT INTO "CashShiftSession" ("id","companyId","storeId","terminalPos","status","openedByName","openedAt","closedAt","variance","cardVariance") VALUES (${id},${company},${store},${terminal},'CLOSED','Control','2026-10-20 06:00','2026-10-20 14:00',0,0)`;
  await db.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","occurredAt") VALUES ('expense','co','store','c','OTHER_EXPENSE',12.34,'2026-10-23 10:00')`;
  await db.$executeRaw`INSERT INTO "Sale" VALUES ('control',9)`;await db.$executeRaw`INSERT INTO "Payment" VALUES ('control',9)`;
  const bytes=Buffer.from('%PDF-synthetic-paper'),checksum=createHash('sha256').update(bytes).digest('hex'),key=paperKey(scope,checksum);
  await db.$executeRaw`INSERT INTO "StoreChatMessage" VALUES ('paper','co','store','paper.pdf','application/pdf',${bytes.length},${checksum},${bytes.toString('base64')})`;
  const raw={dateText:'23/10/2026',documentDate:'2026-10-23',operatorText:'Χρυσάνθη',shiftText:null,lines:[{kind:'EXPENSE',label:'Έξοδο',amountText:'12,34',quantityText:null,timeText:'10:00',uncertain:false}],notes:[]};
  for(const [id,action,status,extra]of [[intentId(key),'CASH_PAPER_REQUESTED','PENDING',{}],[completionId(key),'CASH_PAPER_COMPLETED','EXTRACTED_UNVERIFIED',{raw}]])await db.$executeRaw`INSERT INTO "WorkforceAuditLog" ("id","companyId","storeId","actorUserId","action","entityType","entityId","afterJson") VALUES (${id},'co','store','actor',${action},'CASH_PAPER_READING',${key},${JSON.stringify({version:1,generation:'0',checksum,messageId:'paper',actorName:'Fixture reader',status,...extra})}::jsonb)`;
  const financial=async()=>({sessions:await db.$queryRaw`SELECT * FROM "CashShiftSession" ORDER BY "id"`,transactions:await db.$queryRaw`SELECT * FROM "StoreTransaction" ORDER BY "id"`,reviews:await db.$queryRaw`SELECT * FROM "CashControlReview"`,sales:await db.$queryRaw`SELECT * FROM "Sale"`,payments:await db.$queryRaw`SELECT * FROM "Payment"`}),before=await financial(),originals=await db.$queryRaw`SELECT * FROM "StoreChatMessage"`;
  const repository=createCashReconciliationRepository(db),repositoryB=createCashReconciliationRepository(other),initial=await repository.read(scope,period),a=initial.rows.find(r=>r.sessionId==='a'),b=initial.rows.find(r=>r.sessionId==='b');
  assert.deepEqual(initial.rows.map(r=>r.remainingCents),[-8700,8000,-1000]);assert.equal(initial.totals.pending,3);assert(!JSON.stringify(initial).includes('foreign'));
  const offset={kind:'OFFSET',previousSessionId:'a',nextSessionId:'b',previousHash:a.sourceHash,nextHash:b.sourceHash,amountCents:2000,countingErrorConfirmed:true,note:'Επαληθεύτηκε λάθος καταμέτρησης.'},make=(head,data)=>({requestId:randomUUID(),generation:'0',head,period,data});
  const requests=[make(initial.head,offset),make(initial.head,offset)],race=await Promise.allSettled([repository.apply(scope,actor,requests[0]),repositoryB.apply(scope,actor,requests[1])]);
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.find(r=>r.status==='rejected').reason.code,'CASH_RECONCILIATION_STALE_HEAD');
  const winner=race.findIndex(r=>r.status==='fulfilled'),replay=await repositoryB.apply(scope,actor,requests[winner]);assert.equal(replay.reused,true);assert.equal(replay.rows.find(r=>r.sessionId==='a').remainingCents,-6700);assert.equal(replay.rows.find(r=>r.sessionId==='b').remainingCents,6000);assert.equal(replay.rows[0].cardCents,20000);
  await assert.rejects(repository.apply(scope,actor,{...requests[winner],data:{...offset,amountCents:7999}}),e=>e.code==='CASH_RECONCILIATION_REPLAY_CHANGED');
  let current=replay;const save=async data=>current=await repository.apply(scope,actor,make(current.head,data));
  const row=id=>[...current.rows,...current.context].find(r=>r.sessionId===id);
  await assert.rejects(save({...offset,amountCents:1}),e=>e.code==='CASH_RECONCILIATION_PAIR_ALREADY_REVIEWED');
  await save({kind:'REVOKE',targetId:replay.actionId,note:'Αναιρείται η μερική καταμέτρηση.'});
  await save({...offset,amountCents:8000});assert.equal(row('a').remainingCents,-700);assert.equal(row('b').remainingCents,0);
  await assert.rejects(save({...offset,nextSessionId:'c',nextHash:row('c').sourceHash}),e=>e.code==='CASH_RECONCILIATION_PAIR_INVALID');
  await assert.rejects(save({...offset,nextSessionId:'delivery',nextHash:'a'.repeat(64)}),e=>e.code==='CASH_RECONCILIATION_PAIR_INVALID');
  await assert.rejects(save({...offset,previousSessionId:'c',previousHash:row('c').sourceHash,nextSessionId:'d',nextHash:row('d').sourceHash}),e=>e.code==='CASH_RECONCILIATION_PAIR_INVALID');
  for(const id of ['a','b'])await save({kind:'CONFIRM',sessionId:id,sourceHash:row(id).sourceHash,planHash:row(id).planHash,note:'Ελέγχθηκαν οι κινήσεις και η καταμέτρηση.',reviewed:true});
  assert.equal(current.totals.shortageCents,700);assert.equal(current.totals.pending,1);assert.match(current.text,/ΜΑΝΗΣ ΧΡΗΣΤΟΣ/);
  await assert.rejects(save({kind:'CONFIRM',sessionId:'c',sourceHash:row('c').sourceHash,planHash:row('c').planHash,note:'Δεν έχει κλείσει η επόμενη βάρδια.',reviewed:true}),e=>e.code==='CASH_RECONCILIATION_SOURCE_CHANGED');
  await assert.rejects(save({kind:'CHECKPOINT',resumeFrom:'2026-10-24',reportHash:current.reportHash,pendingNotes:[],note:'Έλεγχος μέχρι την τελευταία βάρδια.',reviewed:true}),e=>e.code==='CASH_RECONCILIATION_CHECKPOINT_INVALID');
  await save({kind:'CHECKPOINT',resumeFrom:'2026-10-23',reportHash:current.reportHash,pendingNotes:['Αναμονή επόμενης βάρδιας της Χρυσάνθης.'],note:'Καταγράφηκε το σημείο συνέχειας.',reviewed:true});assert.equal(current.checkpoint.current,true);
  const association={kind:'ASSOCIATE',messageId:'paper',checksum,sourceKey:key,line:0,sessionId:'c',sourceHash:row('c').sourceHash,transactionId:'expense',confirmedKind:'EXPENSE',confirmedDate:'2026-10-23',confirmedAmountCents:1234,operatorContext:'Χρυσάνθη · Πρωινή',note:'Συγκρίθηκε το πρωτότυπο με την κίνηση.',reviewed:true};
  await assert.rejects(save({...association,confirmedAmountCents:1200}),e=>e.code==='CASH_RECONCILIATION_TRANSACTION_MISMATCH');
  await save(association);assert.equal(current.checkpoint.current,false);assert.equal(row('a').remainingCents,-700);
  await assert.rejects(save({...association,sessionId:'a',sourceHash:row('a').sourceHash,transactionId:null}),e=>e.code==='CASH_RECONCILIATION_LINE_USED');
  assert.deepEqual(await financial(),before);assert.deepEqual(await db.$queryRaw`SELECT * FROM "StoreChatMessage"`,originals);
  // Historical metadata stays available beyond the old 500-record threshold;
  // these isolated archived confirmations never enter the selected cash rows.
  const scopeId=scopeKey(scope),archive=[];let previousHead=current.head;
  const existing=(await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "WorkforceAuditLog" WHERE "entityType"='CASH_RECONCILIATION'`)[0].count;
  for(let i=0;i<501;i++){
    const requestId=randomUUID(),data={kind:'CONFIRM',sessionId:'archived-'+i,sourceHash:'a'.repeat(64),planHash:'b'.repeat(64),note:'Αρχειοθετημένος δοκιμαστικός έλεγχος.',reviewed:true},proof={period},id=actionId(scopeId,requestId),sequence=existing+i+1,digest=requestHash({generation:'0',period,data});
    const detail={version:1,generation:'0',sequence,previousHead,requestId,requestHash:digest,data,proof,actorName:'Archive fixture'};detail.head=hash({id,sequence,previousHead,requestHash:digest,data,proof,actorName:detail.actorName});previousHead=detail.head;
    archive.push(Prisma.sql`(${id},'co','store','actor','CASH_RECONCILIATION_REVIEWED','CASH_RECONCILIATION',${scopeId},${JSON.stringify(detail)}::jsonb,NOW())`);
  }
  await db.$executeRaw(Prisma.sql`INSERT INTO "WorkforceAuditLog" ("id","companyId","storeId","actorUserId","action","entityType","entityId","afterJson","createdAt") VALUES ${Prisma.join(archive)}`);
  const latest=await repository.read(scope,period,{requestId:requests[winner].requestId}),oldPage=await repository.read(scope,period,{historyPage:10});
  assert.equal(latest.requestStatus,'APPLIED');assert.equal(latest.history.length,50);assert(latest.historyTotal>500);assert(oldPage.history.length>0);assert(!oldPage.history.some(h=>latest.history.some(n=>n.id===h.id)));assert.equal(latest.totals.shortageCents,700);
  // Exercise the actual registered router, current role lookup and source SQL.
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={id:'actor',companyId:'co',role:'OWNER'};next()});app.use(createCashReconciliationRouter({db}));server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  const response=await fetch(origin+'/stores/store?from=2026-10-21&to=2026-10-23');assert.equal(response.status,200);const body=await response.json();assert.equal(body.head,latest.head);assert.doesNotMatch(JSON.stringify(body),/attachmentData|JVBERi/);
  assert.match(response.headers.get('cache-control'),/no-store/);
  const postBody=make(body.head,{kind:'CHECKPOINT',resumeFrom:'2026-10-23',reportHash:body.reportHash,pendingNotes:['Αναμονή επόμενης βάρδιας.'],note:'Ενημερώθηκε το σημείο συνέχειας.',reviewed:true});
  const post=await fetch(origin+'/stores/store/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(postBody)});assert.equal(post.status,200);assert.equal((await post.json()).reused,false);
  const duplicate=await fetch(origin+'/stores/store/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(postBody)});assert.equal(duplicate.status,200);assert.equal((await duplicate.json()).reused,true);
  await db.$executeRaw`UPDATE "User" SET "role"='EMPLOYEE' WHERE "id"='actor'`;assert.equal((await fetch(origin+'/stores/store?from=2026-10-21&to=2026-10-23')).status,403);
  await db.$executeRaw`UPDATE "User" SET "role"='SUPER_ADMIN' WHERE "id"='actor'`;
  const beforeAudit=(await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "WorkforceAuditLog"`)[0].count;
  await db.$executeRaw`UPDATE "StoreChatMessage" SET "attachmentData"='Y2hhbmdlZA==' WHERE "id"='paper'`;
  const stale=await repository.read(scope,period);assert.equal(stale.rows.find(r=>r.sessionId==='c').status,'RECHECK_REQUIRED');assert.equal(stale.rows.find(r=>r.sessionId==='a').reviewed,true);assert.equal(stale.rows.find(r=>r.sessionId==='a').remainingCents,-700);
  await db.$executeRaw`UPDATE "StoreTransaction" SET "amount"=13 WHERE "id"='expense'`;assert.notEqual((await repository.read(scope,period)).rows.find(r=>r.sessionId==='c').sourceHash,row('c').sourceHash);
  await db.$executeRaw`UPDATE "StoreLifecycleFence" SET "generation"=1 WHERE "storeId"='store'`;await assert.rejects(repository.apply(scope,actor,make(current.head,offset)),e=>e.code==='STORE_LIFECYCLE_STALE_GENERATION');
  assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "WorkforceAuditLog"`)[0].count,beforeAudit,'stale/denied reads never add review rows');
  assert.deepEqual(await db.$queryRaw`SELECT * FROM "CashShiftSession" ORDER BY "id"`,before.sessions);assert.deepEqual(await db.$queryRaw`SELECT * FROM "Sale"`,before.sales);assert.deepEqual(await db.$queryRaw`SELECT * FROM "Payment"`,before.payments);assert.deepEqual(await db.$queryRaw`SELECT * FROM "CashControlReview"`,before.reviews);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await other.$disconnect();await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();}
});
