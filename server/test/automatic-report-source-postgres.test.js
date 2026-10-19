import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readAutomaticDailyCashPreview} from "../src/services/automatic-report-source.js";
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==="test"&&["localhost","127.0.0.1","postgres"].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};

test("native automatic cash reader uses selected scope, overnight opening boundaries and unchanged original records",{skip:!isolated()},async()=>{
 const {PrismaClient}=await import("@prisma/client"),admin=new PrismaClient(),schema="auto_report_"+randomUUID().replaceAll("-","");
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set("schema",schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await db.$executeRawUnsafe('CREATE TABLE "User"("id" text primary key,"role" text)');
  await db.$executeRawUnsafe('CREATE TABLE "Store"("id" text primary key,"companyId" text,"name" text,"active" boolean)');
  await db.$executeRawUnsafe('CREATE TABLE "CashControlStoreRule"("storeId" text primary key,"companyId" text,"mode" text,"deliveryTerminalPattern" text,"carryOverEnabled" boolean,"posEftposEnabled" boolean,"updatedAt" timestamptz default now())');
  await db.$executeRawUnsafe('CREATE TABLE "CashShiftSession"("id" text primary key,"companyId" text,"storeId" text,"terminalPos" text,"status" text,"openedBy" text,"openedByName" text,"openedAt" timestamptz,"closedAt" timestamptz,"variance" numeric(14,2),"updatedAt" timestamptz default now())');
  await db.$executeRaw`INSERT INTO "User" VALUES('sa','SUPER_ADMIN'),('owner','OWNER')`;
  await db.$executeRaw`INSERT INTO "Store" VALUES('s','c','LAB',true),('control','c','CONTROL',true),('other','x','FOREIGN',true),('inactive','c','INACTIVE',false)`;
  await db.$executeRaw`INSERT INTO "CashControlStoreRule"("storeId","companyId","mode","deliveryTerminalPattern","carryOverEnabled","posEftposEnabled") VALUES('s','c','FULL','DELIVERY',true,true)`;
  const insert=async(id,company,store,terminal,open,close,variance,status="CLOSED")=>db.$executeRaw`INSERT INTO "CashShiftSession"("id","companyId","storeId","terminalPos","status","openedBy","openedByName","openedAt","closedAt","variance") VALUES(${id},${company},${store},${terminal},${status},'employee','Employee',${new Date(open)},${close?new Date(close):null},${variance})`;
  for(const [id,hour,next,amount] of [["morning","07","2026-10-15T15:00:00+03:00",-10],["afternoon","15","2026-10-15T23:00:00+03:00",8],["night","23","2026-10-16T07:00:00+03:00",0]])await insert(id,"c","s","MAIN",`2026-10-15T${hour}:00:00+03:00`,next,amount);
  await insert("delivery","c","s","DELIVERY","2026-10-15T07:00:00+03:00","2026-10-15T15:00:00+03:00",20);
  await insert("previous","c","s","MAIN","2026-10-14T23:00:00+03:00","2026-10-15T07:00:00+03:00",999);
  await insert("next","c","s","MAIN","2026-10-16T07:00:00+03:00",null,null,"OPEN");
  await insert("control","c","control","MAIN","2026-10-15T07:00:00+03:00",null,null,"OPEN");
  await insert("foreign","x","s","MAIN","2026-10-15T07:00:00+03:00",null,null,"OPEN");
  const args={actorId:"sa",companyId:"c",storeId:"s",day:"2026-10-15",configuration:{terminals:["MAIN",{terminalPos:"DELIVERY",requiredSlots:[1]}]},now:new Date("2026-10-16T08:00:00+03:00")};
  // Capture all fixture records, including foreign-company/store and separate
  // terminal controls, so readiness reads cannot silently mutate source state.
  const snapshot=()=>db.$queryRaw`SELECT * FROM "CashShiftSession" ORDER BY "id"`;
  const fullSnapshot=async()=>({
   sessions:await snapshot(),
   users:await db.$queryRaw`SELECT * FROM "User" ORDER BY "id"`,
   stores:await db.$queryRaw`SELECT * FROM "Store" ORDER BY "id"`,
   rules:await db.$queryRaw`SELECT * FROM "CashControlStoreRule" ORDER BY "storeId"`
  });
  const before=await snapshot(),report=await readAutomaticDailyCashPreview(db,args);
  assert.equal(report.ready,true);assert.equal(report.sourceCount,4);
  assert.equal(report.sourceReadiness,"READY");assert.equal(report.financialFinality,"PROVISIONAL");assert.equal(report.financialReconciliationComplete,false);assert.deepEqual(report.financialLimitations,["DOCUMENT_PAYMENT_RECONCILIATION_NOT_VERIFIED","CASH_REVIEW_EXPLANATIONS_NOT_VERIFIED","PHYSICAL_CASH_AND_CONTROL_BALANCES_NOT_VERIFIED"]);
  const store=report.groups.find(g=>g.cashChain==="STORE"),delivery=report.groups.find(g=>g.cashChain==="DELIVERY");
  assert.deepEqual([store.originalShortage,store.originalSurplus,store.offset,store.netVariance],[10,8,8,-2]);assert.equal(delivery.netVariance,20);
  assert.deepEqual(await snapshot(),before);
  for(const change of [{actorId:"owner"},{companyId:"x"},{storeId:"inactive"},{storeId:"other"}])await assert.rejects(readAutomaticDailyCashPreview(db,{...args,...change}),e=>[403,404].includes(e.status));
  const fullBefore=await fullSnapshot();
  // Fixture-only change: two CLOSED MAIN sessions now overlap although each
  // opening slot is present. DELIVERY's legitimate concurrency stays untouched.
  await db.$executeRaw`UPDATE "CashShiftSession" SET "closedAt"=${new Date("2026-10-15T23:00:00+03:00")} WHERE "id"='morning'`;
  try{
   const overlappingBefore=await fullSnapshot(),overlapping=await readAutomaticDailyCashPreview(db,args);
   assert.equal(overlapping.ready,false);assert.equal(overlapping.groups,null);assert.equal(overlapping.sourceReadiness,"HOLD");
   assert.equal(overlapping.financialFinality,"PROVISIONAL");assert.equal(overlapping.financialReconciliationComplete,false);
   assert.equal(overlapping.deliveryStatus,"PREVIEW_ONLY");assert.equal(overlapping.employeeLiabilityAdjusted,false);
   assert.deepEqual(overlapping.financialLimitations,report.financialLimitations);assert.equal(overlapping.sourceCount,4);
   const hold=overlapping.holds.find(h=>h.code==="SOURCE_SCOPE_OR_ID_INVALID"&&h.overlappingSessionId);
   assert.ok(hold,"same-terminal closed overlap must hold the whole daily preview");assert.equal(hold.terminalPos,"MAIN");assert.equal(hold.sessionId,"afternoon");assert.equal(hold.overlappingSessionId,"morning");
   assert.deepEqual(await fullSnapshot(),overlappingBefore);
  }finally{
   await db.$executeRaw`UPDATE "CashShiftSession" SET "closedAt"=${new Date("2026-10-15T15:00:00+03:00")} WHERE "id"='morning'`;
  }
  assert.deepEqual(await snapshot(),before);
  assert.deepEqual(await fullSnapshot(),fullBefore);
  const restored=await readAutomaticDailyCashPreview(db,args);
  assert.equal(restored.ready,true);assert.equal(restored.sourceReadiness,"READY");assert.deepEqual(restored.groups,report.groups);
  assert.deepEqual(await fullSnapshot(),fullBefore);
  assert.deepEqual(await snapshot(),before);
  await db.$executeRaw`UPDATE "CashShiftSession" SET "status"='OPEN',"closedAt"=NULL,"variance"=NULL WHERE "id"='night'`;
  const open=await readAutomaticDailyCashPreview(db,args);assert.equal(open.ready,false);assert.equal(open.groups,null);assert.equal(open.sourceReadiness,"HOLD");assert.equal(open.financialFinality,"PROVISIONAL");assert.equal(open.financialReconciliationComplete,false);assert.deepEqual(open.financialLimitations,report.financialLimitations);assert.ok(open.holds.some(h=>h.code==="THIRD_SHIFT_OPEN"));
  await db.$executeRaw`UPDATE "CashShiftSession" SET "status"='CLOSED',"closedAt"=${new Date("2026-10-16T07:00:00+03:00")},"variance"=0 WHERE "id"='night'`;
  await insert("carried","c","s","MAIN","2026-10-14T23:00:00+03:00",null,null,"OPEN");
  const carried=await readAutomaticDailyCashPreview(db,args);assert.equal(carried.ready,false);assert.ok(carried.holds.some(h=>h.code==="SOURCE_SCOPE_OR_ID_INVALID"));
  await db.$executeRaw`DELETE FROM "CashShiftSession" WHERE "id"='carried'`;
  await insert("malformed","c","s","MAIN","2026-10-14T23:00:00+03:00",null,0);
  const malformed=await readAutomaticDailyCashPreview(db,args);assert.equal(malformed.ready,false);assert.equal(malformed.groups,null);
  await db.$executeRaw`DELETE FROM "CashShiftSession" WHERE "id"='malformed'`;
  await db.$executeRaw`DELETE FROM "CashControlStoreRule" WHERE "storeId"='s'`;
  const missing=await readAutomaticDailyCashPreview(db,args);assert.equal(missing.ready,false);assert.equal(missing.groups,null);assert.ok(missing.holds.some(h=>h.code==="CASH_RULE_NOT_CONFIGURED"));
  assert.deepEqual(await snapshot(),before);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
