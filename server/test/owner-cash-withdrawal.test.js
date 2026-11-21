import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {ownerWithdrawalEventDescription,ownerWithdrawalSchema,withdrawalProjection,previewOwnerWithdrawal,recordOwnerWithdrawal} from '../src/services/owner-cash-withdrawal.js';
import {staffCapabilities,staffProfiles,staffRequestCapability,staffPermissionSections} from '../../shared/backoffice-staff.mjs';
import {assertOwnerWithdrawalActor} from '../src/routes/owner-cash-withdrawal.js';
const input=(extra={})=>({sessionId:'shift',amount:80,occurredAt:'2026-01-02T00:00:00Z',reason:'Omitted owner withdrawal',idempotencyKey:crypto.randomUUID(),...extra});
const closed={id:'shift',companyId:'company',storeId:'store',status:'CLOSED',openedAt:'2026-01-01T20:00:00Z',closedAt:'2026-01-02T04:00:00Z',expectedOperational:160.70,actualOperational:81.52,variance:-79.18,nextOpeningTotal:81.52};
test('historical withdrawal subtracts full amount and preserves genuine surplus and original count',()=>{
 const before=structuredClone(closed),value=withdrawalProjection(closed,input());
 assert.deepEqual(value,{before:{expectedOperational:160.7,actualOperational:81.52,variance:-79.18},after:{expectedOperational:80.7,actualOperational:81.52,variance:0.82}});assert.deepEqual(closed,before);
});
test('historical withdrawal refuses invalid precision, missing preview, out-of-shift/future times and inconsistent closure',async()=>{
 for(const amount of [0,-1,Infinity,NaN,1.234])assert.equal(ownerWithdrawalSchema.safeParse(input({amount})).success,false);
 for(const occurredAt of ['2026-01-01T19:59:59Z','2026-01-02T04:00:01Z'])assert.throws(()=>withdrawalProjection(closed,input({occurredAt})),/ώρα/);
 assert.throws(()=>withdrawalProjection({...closed,variance:0},input()),/έλεγχο/);
 assert.throws(()=>withdrawalProjection(closed,input({amount:200})),/υπερβαίνει/);
 assert.throws(()=>withdrawalProjection({...closed,status:'OPEN',closedAt:null},input({occurredAt:'2026-01-02T00:00:00Z'}),new Date('2026-01-01T23:00:00Z')),/μέλλον/);
 await assert.rejects(recordOwnerWithdrawal({}, {companyId:'company',storeId:'store',user:{id:'owner'},verify:async()=>{}},input()),/προεπισκόπηση/);
});
test('responsible-user permission is explicit, store-scoped and absent from default profiles',()=>{
 assert.ok(staffCapabilities.includes('payments.owner-withdrawal'));
 for(const profile of Object.values(staffProfiles))assert.ok(!profile.capabilities.includes('payments.owner-withdrawal'));
 const action=staffPermissionSections.flatMap(s=>s.actions).find(a=>a.key==='payments.owner-withdrawal');assert.deepEqual(action.requires,['payments.read','shifts.read']);
 for(const [method,path] of [['GET','sessions'],['POST','preview'],['POST','confirm']])assert.equal(staffRequestCapability(method,`/api/transactions/stores/store/owner-withdrawals/${path}`,{}),'payments.owner-withdrawal');
 for(const [method,path] of [['DELETE','confirm'],['GET','confirm'],['POST','sessions'],['POST','confirm/foreign']])assert.notEqual(staffRequestCapability(method,`/api/transactions/stores/store/owner-withdrawals/${path}`,{}),'payments.owner-withdrawal');
});
test('service requires an authenticated transaction verifier before reading or writing',async()=>{
 await assert.rejects(previewOwnerWithdrawal({}, {companyId:'company',storeId:'store',user:{id:'owner'}},input()),/εξουσιοδοτημένη/);
});
test('entry rejects operator and implicit manager/admin roles and keeps delegated scope exact',()=>{
 for(const role of ['MANAGER','ADMIN','EMPLOYEE','CASHIER'])assert.throws(()=>assertOwnerWithdrawalActor({id:'actor',role},'store'),/Απαιτείται/);
 assert.throws(()=>assertOwnerWithdrawalActor({role:'OWNER',tokenType:'STORE_OPERATOR'},'store'),/δικαίωμα/);
 assert.throws(()=>assertOwnerWithdrawalActor({staffAccess:true,storeId:'foreign'},'store'),/κατάστημα/);
 assert.doesNotThrow(()=>assertOwnerWithdrawalActor({role:'OWNER'},'store'));
 assert.doesNotThrow(()=>assertOwnerWithdrawalActor({role:'SUPER_ADMIN'},'store'));
 // Actual delegated grants are checked transactionally by requireStaffAction.
 assert.doesNotThrow(()=>assertOwnerWithdrawalActor({staffAccess:true,storeId:'store',role:'EMPLOYEE'},'store'));
});
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native PostgreSQL withdrawal atomically updates original closed shift, audit and replay without changing next opening',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='withdrawal_test_'+crypto.randomUUID().replaceAll('-','');
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "CashShiftSession"("id" text primary key,"companyId" text,"storeId" text,"status" text,"terminalPos" text,"openedBy" text,"openedByName" text,"openedAt" timestamptz,"closedAt" timestamptz,"expectedOperational" numeric(14,2),"actualOperational" numeric(14,2),"variance" numeric(14,2),"nextOpeningTotal" numeric(14,2),"updatedAt" timestamptz)',
   'CREATE TABLE "StoreTransaction"("id" text primary key,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric(14,2),"description" text,"subtractFromShift" boolean,"paymentMethod" text,"actorId" text,"actorName" text,"occurredAt" timestamptz,"createdAt" timestamptz,"reversedAt" timestamptz)',
   'CREATE TABLE "StoreOperatorAudit"("id" text primary key,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb,"createdAt" timestamptz)',
   `INSERT INTO "CashShiftSession" VALUES ('shift','company','store','CLOSED','MAIN','operator','Virtual','2026-01-01T20:00:00Z','2026-01-02T04:00:00Z',160.70,81.52,-79.18,81.52,now()),('control','company','other','CLOSED','MAIN','operator','Control','2026-01-01T20:00:00Z','2026-01-02T04:00:00Z',30,30,0,30,now())`
  ])await db.$executeRawUnsafe(sql);
  const scope={companyId:'company',storeId:'store',user:{id:'owner',fullName:'Virtual Owner'},previewKey:'isolated-preview-proof-key',verify:async()=>{}};
  const raw=input(),preview=await previewOwnerWithdrawal(db,scope,raw),body={...raw,expectedSnapshot:preview.expectedSnapshot};
  const [a,b]=await Promise.all([recordOwnerWithdrawal(db,scope,body),recordOwnerWithdrawal(db,scope,body)]);assert.equal([a,b].filter(r=>r.duplicate).length,1);
  const [shift]=await db.$queryRaw`SELECT * FROM "CashShiftSession" WHERE "id"='shift'`;
  assert.equal(Number(shift.expectedOperational),80.7);assert.equal(Number(shift.actualOperational),81.52);assert.equal(Number(shift.variance),0.82);assert.equal(Number(shift.nextOpeningTotal),81.52);assert.equal(shift.status,'CLOSED');
  const rows=await db.$queryRaw`SELECT * FROM "StoreTransaction"`,events=await db.$queryRaw`SELECT * FROM "StoreOperatorAudit"`;assert.equal(rows.length,1);assert.equal(events.length,1);assert.equal(rows[0].type,'TRANSFER_OUT');assert.equal(rows[0].occurredAt.toISOString(),raw.occurredAt.replace('Z','.000Z'));assert.ok(rows[0].createdAt>rows[0].occurredAt);assert.equal(events[0].details.result.after.variance,0.82);
  await assert.rejects(recordOwnerWithdrawal(db,scope,{...body,amount:81}),/διαφορετικά/);
  await assert.rejects(recordOwnerWithdrawal(db,scope,{...body,idempotencyKey:crypto.randomUUID()}),/άλλαξαν/);
  await assert.rejects(previewOwnerWithdrawal(db,{...scope,storeId:'other'},raw),/Δεν βρέθηκε/);
  const second=input({amount:1}),fresh=await previewOwnerWithdrawal(db,scope,second);let checks=0;
  await assert.rejects(recordOwnerWithdrawal(db,{...scope,verify:async()=>{if(++checks===2)throw Error('grant revoked')}},{...second,expectedSnapshot:fresh.expectedSnapshot}),/grant revoked/);
  assert.equal((await db.$queryRaw`SELECT * FROM "StoreTransaction"`).length,1);assert.equal((await db.$queryRaw`SELECT * FROM "StoreOperatorAudit"`).length,1);
  assert.equal(Number((await db.$queryRaw`SELECT "variance" FROM "CashShiftSession" WHERE "id"='shift'`)[0].variance),0.82);
  assert.equal(Number((await db.$queryRaw`SELECT "nextOpeningTotal" FROM "CashShiftSession" WHERE "id"='control'`)[0].nextOpeningTotal),30);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();}
});

test('Events description links original shift and operator, recording actor, Greek occurrence/registration clocks and actual residual',()=>{
 const text=ownerWithdrawalEventDescription({sessionId:'virtual-shift',shiftOperatorName:'Virtual Operator',actorName:'Virtual Owner',occurredAt:'2026-01-02T00:00:00Z',amount:80,before:{variance:-79.18},after:{variance:0.82},reason:'Omitted owner withdrawal'},'2026-01-03T08:00:00Z');
 for(const value of ['virtual-shift','Virtual Operator','Virtual Owner','80.00','-79.18','0.82','2/1/26','02:00','3/1/26','10:00','Omitted owner withdrawal'])assert.ok(text.includes(value),text);
 assert.doesNotThrow(()=>ownerWithdrawalEventDescription({},null));
});
