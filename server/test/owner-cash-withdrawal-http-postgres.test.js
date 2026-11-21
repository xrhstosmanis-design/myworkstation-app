import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import {createOwnerWithdrawalRouter} from '../src/routes/owner-cash-withdrawal.js';
import {enforceBackofficeStaff} from '../src/services/backoffice-staff-access.js';
import {installStaffActionPolicy} from './helpers/backoffice-staff-actions-fixture.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native registered HTTP withdrawal admits owner/SA/explicit responsible grant and refuses missing/revoked grants, implicit roles, modules and foreign stores',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='withdrawal_http_test_'+crypto.randomUUID().replaceAll('-','');const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});let server;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await db.$executeRawUnsafe('CREATE TABLE "Store"("id" text primary key,"companyId" text,"active" boolean default true)');
  await db.$executeRawUnsafe("INSERT INTO \"Store\" VALUES ('store','company',true),('control','company',true),('foreign','other',true)");
  const staff=await installStaffActionPolicy(db,{companyId:'company',storeId:'store',capabilities:['payments.read','shifts.read']});
  await db.$executeRawUnsafe('ALTER TABLE "StorePaidModule" ADD COLUMN "companyId" text');
  await db.$executeRawUnsafe("UPDATE \"BackofficeStaffGrant\" SET \"profile\"='MANAGER'");
  await db.$executeRawUnsafe(`INSERT INTO "User" ("id","companyId","role","fullName") VALUES ('owner','company','OWNER','Virtual Owner'),('sa','platform','SUPER_ADMIN','Virtual SA')`);
  await db.$executeRawUnsafe(`INSERT INTO "UserSession"("id","userId","expiresAt") VALUES ('owner-session','owner',now()+interval '1 hour'),('sa-session','sa',now()+interval '1 hour')`);
  for(const sql of [
   'CREATE TABLE "CashShiftSession"("id" text primary key,"companyId" text,"storeId" text,"status" text,"terminalPos" text,"openedBy" text,"openedByName" text,"openedAt" timestamptz,"closedAt" timestamptz,"expectedOperational" numeric(14,2),"actualOperational" numeric(14,2),"variance" numeric(14,2),"nextOpeningTotal" numeric(14,2),"updatedAt" timestamptz)',
   'CREATE TABLE "StoreTransaction"("id" text primary key,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric(14,2),"description" text,"subtractFromShift" boolean,"paymentMethod" text,"actorId" text,"actorName" text,"occurredAt" timestamptz,"createdAt" timestamptz,"reversedAt" timestamptz)',
   `INSERT INTO "CashShiftSession" VALUES ('shift','company','store','CLOSED','MAIN','operator','Virtual','2026-01-01T20:00:00Z','2026-01-02T04:00:00Z',160.70,81.52,-79.18,81.52,now())`
  ])await db.$executeRawUnsafe(sql);
  let actor=staff;const app=express();app.use(express.json());
  // The authenticated identity boundary is injected. Admission and the actual
  // registered handlers below use real PostgreSQL policy/session/grant rows.
  app.use(async(req,res,next)=>{req.user={...actor};try{await enforceBackofficeStaff(db,req,res);next()}catch(e){res.status(e.status||500).json({error:e.message})}});
  app.use('/api/transactions',createOwnerWithdrawalRouter(db));
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
  const send=async(suffix,{method='GET',body,store='store',headerStore=store}={})=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/transactions/stores/${store}/owner-withdrawals/${suffix}`,{method,headers:{'Content-Type':'application/json','x-backoffice-store-id':headerStore},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}};
  assert.equal((await send('sessions?date=2026-01-02')).status,403);
  const rights=['payments.read','shifts.read','payments.owner-withdrawal'];await db.$executeRaw`UPDATE "BackofficeStaffGrant" SET "capabilities"=${JSON.stringify(rights)}::jsonb`;
  assert.equal((await send('sessions?date=2026-01-02')).status,200);
  assert.equal((await send('sessions?date=2026-01-02',{store:'control',headerStore:'store'})).status,403);
  assert.equal((await send('sessions?date=2026-01-02',{store:'foreign'})).status,403);
  const packet={sessionId:'shift',amount:80,occurredAt:'2026-01-02T00:00:00Z',reason:'Omitted owner withdrawal',idempotencyKey:crypto.randomUUID()};
  const preview=await send('preview',{method:'POST',body:packet});assert.equal(preview.status,200,JSON.stringify(preview));const body={...packet,expectedSnapshot:preview.body.expectedSnapshot};
  await db.$executeRawUnsafe('UPDATE "BackofficeStaffGrant" SET "active"=false');assert.equal((await send('confirm',{method:'POST',body})).status,403);
  assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "StoreTransaction"`)[0].count,0);
  await db.$executeRawUnsafe('UPDATE "BackofficeStaffGrant" SET "active"=true');const confirmed=await send('confirm',{method:'POST',body});assert.equal(confirmed.status,201,JSON.stringify(confirmed));assert.equal(confirmed.body.after.variance,0.82);
  assert.equal((await send('confirm',{method:'POST',body})).body.duplicate,true);
  for(const role of ['MANAGER','ADMIN','EMPLOYEE']){actor={id:'owner',companyId:'company',role,sessionId:'owner-session',sessionVersion:0,tokenType:'BACKOFFICE_USER'};assert.equal((await send('preview',{method:'POST',body:packet})).status,403);}
  for(const [id,role] of [['owner','OWNER'],['sa','SUPER_ADMIN']]){
   actor={id,companyId:'company',role,sessionId:id+'-session',sessionVersion:0,tokenType:'BACKOFFICE_USER'};
   const own={...packet,amount:1,idempotencyKey:crypto.randomUUID()},p=await send('preview',{method:'POST',body:own});assert.equal(p.status,200,JSON.stringify(p));assert.equal((await send('confirm',{method:'POST',body:{...own,expectedSnapshot:p.body.expectedSnapshot}})).status,201);
  }
  assert.equal((await send('sessions?date=2026-01-02',{store:'foreign'})).status,404);
  await db.$executeRawUnsafe(`INSERT INTO "StorePaidModule"("companyId","storeId","moduleKey","active") VALUES ('company','store','CASH_CONTROL',false)`);
  assert.equal((await send('sessions?date=2026-01-02')).status,403);
  const [s]=await db.$queryRaw`SELECT * FROM "CashShiftSession" WHERE "id"='shift'`;assert.equal(Number(s.variance),2.82);assert.equal(Number(s.actualOperational),81.52);assert.equal(Number(s.nextOpeningTotal),81.52);
  assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "StoreTransaction"`)[0].count,3);
  assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "StoreOperatorAudit" WHERE "eventType"='OWNER_CASH_WITHDRAWAL_RECORDED'`)[0].count,3);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();}
});
