import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {z} from 'zod';
import {declaredEftpos} from '../../shared/declared-eftpos.mjs';
import {verifyShiftCloseCredential} from '../src/services/shift-close-card.js';

function isolated(value=process.env.DATABASE_URL){
 try{const url=new URL(value);if(process.env.NODE_ENV!=='test'||!['postgres:','postgresql:'].includes(url.protocol)||!['localhost','127.0.0.1','postgres'].includes(url.hostname)||!/^\/(?:test(?:[_-][a-z0-9_-]+)?|[a-z0-9_-]+[_-]test(?:[_-][a-z0-9_-]+)?)$/i.test(url.pathname)||url.hash)return false;
 const seen=new Set();for(const[key,value]of url.searchParams){if(seen.has(key))return false;seen.add(key);if(key==='schema'){if(!/^[a-z_][a-z0-9_]{0,62}$/i.test(value))return false}else if(!Object.hasOwn({connection_limit:1,pool_timeout:1,statement_cache_size:1},key)||!/^\d{1,6}$/.test(value))return false}return true}catch{return false}
}
test('PIN close native fixture refuses production and URL redirection targets',()=>{
 for(const value of ['postgresql://u:p@localhost/production','postgresql://u:p@localhost/production_latest','postgresql://u:p@remote/module_test','https://localhost/module_test','postgresql://u:p@localhost/module_test?host=remote','postgresql://u:p@localhost/module_test?options=-csearch_path=public','postgresql://u:p@localhost/module_test?schema=a&schema=b','postgresql://u:p@localhost/module_test#x','postgresql://u:p@localhost/module_test?schema=invalid-name','postgresql://u:p@localhost/module_test?connection_limit=unsafe'])assert.equal(isolated(value),false);
 if(process.env.NODE_ENV==='test')for(const value of ['postgresql://u:p@localhost/test','postgres://u:p@127.0.0.1/module_test?schema=isolated_1&connection_limit=1','postgresql://u:p@postgres/test_suite?pool_timeout=10&statement_cache_size=0'])assert.equal(isolated(value),true);
 if(process.env.CI)assert.ok(isolated(),'CI must execute the real PostgreSQL PIN-close proof');
});

let prepared;
async function preparedSource(){
 if(!prepared)prepared=(async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'mws-pin-close-'));
  try{
   await mkdir(path.join(directory,'src','routes'),{recursive:true});
   await writeFile(path.join(directory,'package.json'),' {"type":"module"}');
   const source=await readFile(new URL('../src/routes/cash-control.js',import.meta.url),'utf8'),patch=await readFile(new URL('../src/patch-multi-pos-close-guard.js',import.meta.url),'utf8');
   await writeFile(path.join(directory,'src','routes','cash-control.js'),source);await writeFile(path.join(directory,'src','patch-multi-pos-close-guard.js'),patch);
   execFileSync(process.execPath,[path.join(directory,'src','patch-multi-pos-close-guard.js')],{stdio:'pipe'});
   const result=await readFile(path.join(directory,'src','routes','cash-control.js'),'utf8');
   assert.ok(result.includes('MULTI_POS_CLOSE_GUARD_V1'),'actual retained startup patch still installs its terminal guard');
   assert.ok(result.includes('verifyShiftCloseCredential(tx,req.user,session,body)'),'startup patch preserves PIN authentication');
   execFileSync(process.execPath,['--check',path.join(directory,'src','routes','cash-control.js')],{stdio:'pipe'});
   return result;
  }finally{await rm(directory,{recursive:true,force:true})}
 })();return prepared;
}
test('actual retained multi-POS startup patch preserves the PIN close route and parses',async()=>{await preparedSource()});

test('actual registered PIN close commits only failure guards, enforces scope and closes exactly once in PostgreSQL',{skip:!isolated(),timeout:120000},async t=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema=`shift_pin_test_${crypto.randomUUID().replaceAll('-','')}`,url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});let created=false;
 const pin='2468',user={tokenType:'STORE_OPERATOR',id:'operator',operatorId:'operator',employeeId:'employee',companyId:'company',storeId:'store',terminalPos:'POS-1',fullName:'Fixture operator',permissions:[]};
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;
  for(const sql of [
   `CREATE TABLE "Store"("id" TEXT PRIMARY KEY,"companyId" TEXT,"active" BOOLEAN,"name" TEXT,"responsibleEmail" TEXT)`,
   `CREATE TABLE "Employee"("id" TEXT PRIMARY KEY,"storeId" TEXT,"active" BOOLEAN)`,
   `CREATE TABLE "StoreOperatorCredential"("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"employeeId" TEXT,"active" BOOLEAN,"pinHash" TEXT,"cardCodeHash" TEXT)`,
   `CREATE TABLE "StoreOperatorProfile"("companyId" TEXT,"storeId" TEXT,"employeeId" TEXT,"permissions" JSONB)`,
   `CREATE TABLE "StoreOperatorLoginGuard"("id" TEXT PRIMARY KEY,"storeId" TEXT,"subjectKey" TEXT,"failedCount" INT DEFAULT 0,"windowStartedAt" TIMESTAMPTZ DEFAULT NOW(),"lockedUntil" TIMESTAMPTZ,"updatedAt" TIMESTAMPTZ DEFAULT NOW(),UNIQUE("storeId","subjectKey"))`,
   `CREATE TABLE "CashShiftSession"("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"terminalPos" TEXT,"status" TEXT,"shiftLabel" TEXT,"openedBy" TEXT,"openedByName" TEXT,"openedAt" TIMESTAMPTZ DEFAULT NOW(),"openingOperational" NUMERIC DEFAULT 10,"openingSafe" NUMERIC DEFAULT 0,"closedBy" TEXT,"closedByName" TEXT,"closedAt" TIMESTAMPTZ,"cashSales" NUMERIC DEFAULT 0,"cardSales" NUMERIC DEFAULT 0,"eftposTotal" NUMERIC DEFAULT 0,"cardVariance" NUMERIC DEFAULT 0,"duplicateReviewJson" JSONB DEFAULT '[]',"expenses" NUMERIC DEFAULT 0,"closingDrawer" NUMERIC,"closingCustody" NUMERIC,"closingCoins" NUMERIC,"closingSafe" NUMERIC,"expectedOperational" NUMERIC,"actualOperational" NUMERIC,"variance" NUMERIC,"nextOpeningTotal" NUMERIC,"closingNote" TEXT,"updatedAt" TIMESTAMPTZ DEFAULT NOW())`,
   `CREATE TABLE "StoreTransaction"("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"sessionId" TEXT,"type" TEXT,"amount" NUMERIC,"subtractFromShift" BOOLEAN DEFAULT FALSE,"reversedAt" TIMESTAMPTZ)`,
   `CREATE TABLE "StoreOperatorAudit"("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"operatorId" TEXT,"actorId" TEXT NOT NULL,"eventType" TEXT NOT NULL,"details" JSONB DEFAULT '{}',"createdAt" TIMESTAMPTZ DEFAULT NOW())`,
   // SQL-only stand-in for the unrelated Workforce callback. This proves the
   // close transaction invokes OUT once, not full Workforce business acceptance.
   `CREATE TABLE "TestAttendance"("id" BIGSERIAL PRIMARY KEY,"sessionId" TEXT,"eventType" TEXT,UNIQUE("sessionId","eventType"))`,
   `INSERT INTO "Store" VALUES('store','company',TRUE,'Fixture',NULL),('other-store','company',TRUE,'Control',NULL)`,
   `INSERT INTO "Employee" VALUES('employee','store',TRUE),('employee-2','store',TRUE)`,
   `INSERT INTO "StoreOperatorProfile" VALUES('company','store','employee','{"closeShift":true}'),('company','store','employee-2','{"closeShift":true}')`,
   `INSERT INTO "CashShiftSession"("id","companyId","storeId","terminalPos","status","shiftLabel","openedBy") VALUES('shift','company','store','POS-1','OPEN','Fixture shift','operator'),('control','company','other-store','CONTROL','OPEN','Control shift','control-operator')`,
   `INSERT INTO "StoreTransaction"("id","companyId","storeId","sessionId","type","amount") VALUES('control-tx','company','other-store','control','SALE_CASH',11.11)`
  ])await db.$executeRawUnsafe(sql);
  const hash=await bcrypt.hash(pin,4);
  await db.$executeRaw`INSERT INTO "StoreOperatorCredential"("id","companyId","storeId","employeeId","active","pinHash") VALUES ('operator','company','store','employee',TRUE,${hash}),('operator-2','company','store','employee-2',TRUE,${hash})`;
  const source=await preparedSource(),handlers=new Map();let attendanceCalls=0,mailCalls=0;
  const runtime={
   $queryRaw:db.$queryRaw.bind(db),
   $transaction:callback=>db.$transaction(callback,{maxWait:15000,timeout:30000}),
   store:{findFirst:async()=>({name:'Fixture',responsibleEmail:null})},user:{findMany:async()=>[]}
  };
  const schemaSource=source.slice(source.indexOf('const amount='),source.indexOf('const reportDateSchema='));
  const accessSource=source.slice(source.indexOf('async function requireCashAccess'),source.indexOf('async function ownedStore'));
  const terminalSource=source.slice(source.indexOf('async function requestTerminal'),source.indexOf('const amount='));
  const normalizers=source.slice(source.indexOf('function money('),source.indexOf('async function findConsecutiveDuplicateSales'));
  const totals=source.slice(source.indexOf('async function authoritativeShiftTotals'),source.indexOf('async function existingAuditTables'));
  const closeRoute=source.slice(source.indexOf('router.post("/sessions/:sessionId/close"'),source.indexOf('\nexport default router;'));
  const requireCashAccess=new Function('router','route','z','declaredEftpos','prisma','crypto','verifyShiftCloseCredential','syncOperatorWorkforceAttendance','findConsecutiveDuplicateSales','sendEmail',schemaSource+accessSource+terminalSource+normalizers+totals+closeRoute+'\nreturn requireCashAccess;')(
   {post(route,handler){handlers.set(route,handler)}},handler=>handler,z,declaredEftpos,runtime,crypto,verifyShiftCloseCredential,
   async(tx,req,storeId,eventType,sessionId)=>{attendanceCalls++;await tx.$executeRaw`INSERT INTO "TestAttendance"("sessionId","eventType") VALUES(${sessionId},${eventType})`;return {status:'FIXTURE_CLOCKED_OUT'}},
   async()=>{throw Error('unexpected duplicate scan')},async()=>{mailCalls++;throw Error('unexpected mail')}
  );
  const body={closeCredentialMethod:'PIN',pin,cashSales:999,cardSales:999,eftposTotal:0,expenses:999,drawer:0,custody:0,coins:0,safe:0};
  const invoke=async(overrides={},actor=user)=>{
   const req={params:{sessionId:'shift'},user:actor,body:{...body,...overrides},query:{},headers:{},method:'POST',originalUrl:'/api/cash/sessions/shift/close'},out={status:200},res={status(status){out.status=status;return this},json(value){out.body=value;return this}};
   try{await requireCashAccess(req,res,()=>handlers.get('/sessions/:sessionId/close')(req,res))}catch(error){out.status=error.status||500;out.body={error:error.message}}return out;
  };
  const financialSnapshot=async()=>JSON.stringify(await db.$queryRawUnsafe(`SELECT (SELECT json_agg(t ORDER BY "id") FROM "StoreTransaction" t)::text AS ledger,(SELECT row_to_json(s) FROM "CashShiftSession" s WHERE "id"='control')::text AS control,(SELECT row_to_json(s) FROM "CashShiftSession" s WHERE "id"='shift')::text AS own`));
  const before=await financialSnapshot();
  await t.test('dedicated permission, original opener, company, store, terminal and active employee refuse before effects',async()=>{
   await db.$executeRaw`UPDATE "StoreOperatorProfile" SET "permissions"='{"closeShift":false}'::jsonb WHERE "employeeId"='employee'`;
   assert.equal((await invoke()).status,403);await db.$executeRaw`UPDATE "StoreOperatorProfile" SET "permissions"='{"closeShift":true}'::jsonb WHERE "employeeId"='employee'`;
   for(const[actor,status]of [[{...user,id:'operator-2',operatorId:'operator-2',employeeId:'employee-2'},403],[{...user,companyId:'foreign'},403],[{...user,storeId:'other-store'},404],[{...user,terminalPos:'POS-2'},403]])assert.equal((await invoke({},actor)).status,status);
   await db.$executeRaw`UPDATE "Employee" SET "active"=FALSE WHERE "id"='employee'`;assert.equal((await invoke()).status,403);await db.$executeRaw`UPDATE "Employee" SET "active"=TRUE WHERE "id"='employee'`;
   await db.$executeRaw`UPDATE "StoreOperatorCredential" SET "active"=FALSE WHERE "id"='operator'`;assert.equal((await invoke()).status,403);await db.$executeRaw`UPDATE "StoreOperatorCredential" SET "active"=TRUE WHERE "id"='operator'`;
   assert.equal(await financialSnapshot(),before);assert.equal(Number((await db.$queryRaw`SELECT COUNT(*) AS count FROM "StoreOperatorLoginGuard"`)[0].count),0);assert.equal(attendanceCalls,0);assert.equal(mailCalls,0);
  });
  await t.test('concurrent wrong PINs persist five guard failures while all financial and OUT state stays unchanged',async()=>{
   const results=await Promise.all(Array.from({length:5},(_,index)=>invoke({pin:'1357',forceCloseWithShortage:index%2===0})));assert.ok(results.every(result=>result.status===401),JSON.stringify(results));
   const guard=(await db.$queryRaw`SELECT "failedCount","lockedUntil" FROM "StoreOperatorLoginGuard"`)[0];assert.equal(guard.failedCount,5);assert.ok(new Date(guard.lockedUntil)>new Date());assert.equal((await invoke()).status,429);
   assert.equal(await financialSnapshot(),before);assert.equal(Number((await db.$queryRaw`SELECT COUNT(*) AS count FROM "StoreOperatorAudit"`)[0].count),0);assert.equal(attendanceCalls,0);assert.equal(mailCalls,0);
  });
  await t.test('expired guard resets and own PIN closes a confirmed shortage exactly once with safe method audit',async()=>{
   await db.$executeRaw`UPDATE "StoreOperatorLoginGuard" SET "windowStartedAt"=NOW()-INTERVAL '20 minutes',"lockedUntil"=NOW()-INTERVAL '1 minute'`;
   assert.equal((await invoke({pin:'1357'})).status,401);assert.equal((await db.$queryRaw`SELECT "failedCount" FROM "StoreOperatorLoginGuard"`)[0].failedCount,1);
   const recount=await invoke();assert.equal(recount.status,409);assert.equal(recount.body.code,'SHIFT_RECOUNT_REQUIRED');assert.equal(attendanceCalls,0);
   const closed=await invoke({forceCloseWithShortage:true});assert.equal(closed.status,200,JSON.stringify(closed));assert.equal(closed.body.status,'CLOSED');assert.equal(Number(closed.body.cashSales),0);assert.equal(Number(closed.body.expenses),0);assert.equal(Number(closed.body.variance),-10);assert.equal(closed.body.closedBy,'operator');assert.equal(attendanceCalls,1);assert.equal(mailCalls,0);
   const audit=await db.$queryRaw`SELECT "details" FROM "StoreOperatorAudit" WHERE "eventType"='SHIFT_CLOSED_WITH_PERSONAL_PIN'`;assert.equal(audit.length,1);assert.deepEqual(audit[0].details,{sessionId:'shift',terminalPos:'POS-1',credentialMethod:'PIN'});
   assert.equal(Number((await db.$queryRaw`SELECT COUNT(*) AS count FROM "TestAttendance"`)[0].count),1);assert.equal(Number((await db.$queryRaw`SELECT COUNT(*) AS count FROM "StoreOperatorLoginGuard"`)[0].count),0);
   const after=await financialSnapshot(),auditCount=(await db.$queryRaw`SELECT COUNT(*) AS count FROM "StoreOperatorAudit"`)[0].count;assert.equal((await invoke({forceCloseWithShortage:true})).status,409);assert.equal(await financialSnapshot(),after);assert.equal((await db.$queryRaw`SELECT COUNT(*) AS count FROM "StoreOperatorAudit"`)[0].count,auditCount);assert.equal(attendanceCalls,1);
   assert.equal((await db.$queryRaw`SELECT "status" FROM "CashShiftSession" WHERE "id"='control'`)[0].status,'OPEN');assert.equal(Number((await db.$queryRaw`SELECT "amount" FROM "StoreTransaction" WHERE "id"='control-tx'`)[0].amount),11.11);
  });
 }finally{await db.$disconnect();if(created)await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
