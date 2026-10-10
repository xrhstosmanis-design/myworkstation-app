import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import {assertCashTransferAccess,cashTransferSchema,recordCashTransfer} from "../src/lib/store-cash-transfer.js";

const operator={id:"operator",companyId:"company",storeId:"store",fullName:"Virtual operator",role:"EMPLOYEE",tokenType:"STORE_OPERATOR",permissions:["TRANSFER_AMOUNT"]};
const body={direction:"OUT",amount:2,reason:"Virtual cash to owner",sessionId:"main",idempotencyKey:"cash-transfer-test-01"};
test("ordinary employee may only transfer OUT with current permission and own store",()=>{
 assert.doesNotThrow(()=>assertCashTransferAccess(operator,"OUT","store"));
 for(const [user,direction,store] of [[operator,"IN","store"],[operator,"OUT","other"],[{...operator,permissions:[]},"OUT","store"],[{...operator,tokenType:undefined},"IN","store"]])assert.throws(()=>assertCashTransferAccess(user,direction,store),{status:403});
 assert.doesNotThrow(()=>assertCashTransferAccess({role:"OWNER"},"IN","store"));
 for(const changes of [{amount:0},{amount:-2},{amount:0.001},{reason:" "},{sessionId:""},{idempotencyKey:"short"}])assert.equal(cashTransferSchema.safeParse({...body,...changes}).success,false);
});
test("fresh middleware denies revoked permission and employee incoming before transfer handler",()=>{
 const source=fs.readFileSync(new URL("../src/middleware/auth.js",import.meta.url),"utf8"),start=source.indexOf("function enforceStorePaymentPermissions("),end=source.indexOf("function enforceStorePosPermissions(",start);
 const enforce=vm.runInNewContext(`(${source.slice(start,end).trim()})`);
 const req={method:"POST",originalUrl:"/api/transactions/stores/store/cash-transfer",body:{direction:"OUT"}};
 let code;const res={status(v){code=v;return this},json(){return this}};
 assert.equal(enforce(req,res,[]),false);assert.equal(code,403);assert.equal(enforce(req,res,["TRANSFER_AMOUNT"]),true);
 req.body.direction="IN";assert.equal(enforce(req,res,["TRANSFER_AMOUNT"]),false);
});
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==="test"&&["localhost","127.0.0.1","postgres"].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test("native PostgreSQL cash directions, exact replay, concurrent outgoing and shift/tenant isolation",{skip:!isolated()},async()=>{
 const {PrismaClient}=await import("@prisma/client"),admin=new PrismaClient(),schema=`cash_transfer_${crypto.randomUUID().replaceAll("-","")}`;
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set("schema",schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await db.$executeRawUnsafe('CREATE TABLE "CashShiftSession"("id" text primary key,"companyId" text,"storeId" text,"terminalPos" text,"status" text,"openingOperational" numeric)');
  await db.$executeRawUnsafe('CREATE TABLE "StoreTransaction"("id" text primary key,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric,"description" text,"subtractFromShift" boolean,"paymentMethod" text,"actorId" text,"actorName" text,"reversedAt" timestamp,"occurredAt" timestamp default current_timestamp)');
  await db.$executeRawUnsafe('INSERT INTO "CashShiftSession" VALUES (\'main\',\'company\',\'store\',\'MAIN\',\'OPEN\',10),(\'control\',\'company\',\'store\',\'CONTROL\',\'OPEN\',30),(\'closed\',\'company\',\'store\',\'MAIN\',\'CLOSED\',10)');
  const run=(changes={},user=operator,terminalPos="MAIN")=>recordCashTransfer(db,{user,storeId:"store",terminalPos,body:{...body,...changes}});
  const first=await run();assert.equal(first.duplicate,false);assert.equal(first.transaction.type,"TRANSFER_OUT");assert.equal(Number(first.transaction.amount),2);assert.equal(first.transaction.subtractFromShift,false);assert.equal(first.transaction.paymentMethod,"CASH_SHIFT");
  const replay=await run();assert.equal(replay.duplicate,true);assert.equal(replay.transaction.id,first.transaction.id);
  await assert.rejects(run({amount:3}),{status:409});
  const incoming=await run({direction:"IN",amount:3,idempotencyKey:"incoming-test-01"},{...operator,tokenType:undefined,role:"OWNER"});assert.equal(incoming.transaction.type,"TRANSFER_AMOUNT");
  const pair=await Promise.allSettled([run({amount:7,idempotencyKey:"parallel-out-01"}),run({amount:7,idempotencyKey:"parallel-out-02"})]);assert.equal(pair.filter(r=>r.status==="fulfilled").length,1);assert.equal(pair.find(r=>r.status==="rejected").reason.status,409);
  for(const [changes,user,terminal] of [[{sessionId:"closed",idempotencyKey:"closed-test-01"},operator,"MAIN"],[{idempotencyKey:"terminal-test-01"},operator,"CONTROL"],[{idempotencyKey:"tenant-test-01"},{...operator,companyId:"foreign"},"MAIN"]])await assert.rejects(run(changes,user,terminal),{status:409});
  await assert.rejects(run({direction:"IN",idempotencyKey:"employee-in-01"}),{status:403});
  const rows=await db.$queryRaw`SELECT * FROM "StoreTransaction"`;assert.equal(rows.length,3);assert.ok(rows.every(r=>r.sessionId==="main"&&r.companyId==="company"&&r.storeId==="store"));assert.equal(rows.filter(r=>r.type==="TRANSFER_OUT").reduce((s,r)=>s+Number(r.amount),0),9);
  const cashSource=fs.readFileSync(new URL("../src/routes/cash-control.js",import.meta.url),"utf8"),cashStart=cashSource.indexOf("async function authoritativeShiftTotals("),cashEnd=cashSource.indexOf("async function existingAuditTables(",cashStart);
  const authoritative=vm.runInNewContext(`(${cashSource.slice(cashStart,cashEnd).trim()})`,{money:value=>Number(value||0)});
  const closeTotals=await authoritative(db,"company","store","main");assert.equal(closeTotals.transferIn,3);assert.equal(closeTotals.transferOut,9);assert.equal(closeTotals.cashSales,0);assert.equal(closeTotals.expenses,0);
  const expectedExpression=cashSource.match(/const expected=(session\.openingOperational[^;]+);/)[1];
  const expected=vm.runInNewContext(`(session,ledger)=>(${expectedExpression})`);assert.equal(expected({openingOperational:10},closeTotals),4);
  const sessions=await db.$queryRaw`SELECT * FROM "CashShiftSession"`;assert.equal(Number(sessions.find(s=>s.id==="main").openingOperational),10);assert.equal(Number(sessions.find(s=>s.id==="control").openingOperational),30);
  await db.$executeRaw`UPDATE "CashShiftSession" SET "status"='CLOSED' WHERE "id"='main'`;assert.equal((await run()).duplicate,true);await assert.rejects(run({idempotencyKey:"after-close-01"}),{status:409});
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
