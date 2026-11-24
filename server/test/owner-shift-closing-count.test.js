import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {recordPendingClosingCount} from "../src/routes/owner-shifts.js";

const owner={id:"owner",role:"OWNER",companyId:"A"};
const count={storeId:"S",drawer:12,custody:30,coins:2.5,safe:100,eftposTotal:0,note:"Καταμέτρηση κατά το κλείσιμο"};
const noQuery={async $transaction(){assert.fail("should reject before opening the transaction");}};

test("post-close count rejects unauthorized, incomplete or inexact input before touching the database",async()=>{
  for(const user of [{...owner,role:"MANAGER"},{...owner,tokenType:"STORE_OPERATOR"},{...owner,companyId:null}]){
    await assert.rejects(recordPendingClosingCount(noQuery,user,"shift",count),{status:403});
  }
  for(const input of [{...count,drawer:" "},{...count,custody:null},{...count,coins:-1},{...count,safe:1.111},{...count,storeId:""}]){
    await assert.rejects(recordPendingClosingCount(noQuery,owner,"shift",input),{name:"ZodError"});
  }
});

const canUseDatabase=()=>{
  try{
    const url=new URL(process.env.DATABASE_URL);
    return process.env.NODE_ENV==="test"&&["localhost","127.0.0.1","postgres"].includes(url.hostname)&&/test/i.test(url.pathname);
  }catch{return false;}
};

test("native count completes one pending store shift atomically and leaves next-session opening unchanged",{skip:!canUseDatabase()},async()=>{
  const {PrismaClient}=await import("@prisma/client");
  const admin=new PrismaClient(),schema="closing_count_"+randomUUID().replaceAll("-","");
  const url=new URL(process.env.DATABASE_URL);
  url.searchParams.set("schema",schema);
  const db=new PrismaClient({datasourceUrl:url.toString()});
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await db.$executeRawUnsafe('CREATE TABLE "Store" ("id" text PRIMARY KEY,"companyId" text,"name" text)');
    await db.$executeRawUnsafe(`CREATE TABLE "CashShiftSession" (
      "id" text PRIMARY KEY,"companyId" text,"storeId" text,"status" text,"closedAt" timestamptz,"closedBy" text,
      "terminalPos" text,"expectedOperational" numeric,"cardSales" numeric,"openingOperational" numeric,
      "expectedOpeningOperational" numeric,"openingVariance" numeric,"closingDrawer" numeric,"closingCustody" numeric,
      "closingCoins" numeric,"closingSafe" numeric,"actualOperational" numeric,"variance" numeric,"nextOpeningTotal" numeric,
      "eftposTotal" numeric,"cardVariance" numeric,"closeReconciliationStatus" text,"updatedAt" timestamptz)`);
    await db.$executeRawUnsafe(`CREATE TABLE "CashControlStoreRule" (
      "companyId" text,"storeId" text,"mode" text,"deliveryTerminalPattern" text,"carryOverEnabled" boolean,
      "posEftposEnabled" boolean,"updatedAt" timestamptz)`);
    await db.$executeRawUnsafe(`CREATE TABLE "StoreOperatorAudit" (
      "id" text PRIMARY KEY,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb)`);
    await db.$executeRawUnsafe(`INSERT INTO "Store" VALUES ('S','A','Store'),('T','A','Store T'),('F','B','Foreign')`);
    await db.$executeRawUnsafe(`INSERT INTO "CashControlStoreRule" VALUES ('A','T','DIFFERENCE_ONLY','DELIVERY',false,false,NOW())`);
    await db.$executeRawUnsafe(`INSERT INTO "CashShiftSession"
      ("id","companyId","storeId","status","closedAt","closedBy","terminalPos","expectedOperational","cardSales","openingOperational","closeReconciliationStatus")
      VALUES ('shift','A','S','CLOSED','2026-11-22 17:00+00','closer','MAIN',40,20,10,'AWAITING_COUNT'),
      ('sibling','A','T','CLOSED','2026-11-22 17:30+00','closer','MAIN',40,20,10,'AWAITING_COUNT'),
      ('foreign','B','F','CLOSED','2026-11-22 17:30+00','closer','MAIN',40,20,10,'AWAITING_COUNT'),
      ('next','A','S','OPEN',NULL,NULL,'MAIN',NULL,NULL,19,NULL)`);
    await assert.rejects(recordPendingClosingCount(db,owner,"shift",{...count,storeId:"T"}),{status:404});
    await assert.rejects(recordPendingClosingCount(db,owner,"foreign",{...count,storeId:"F"}),{status:404});
    await assert.rejects(recordPendingClosingCount(db,owner,"next",count),{status:409});
    await assert.rejects(recordPendingClosingCount(db,owner,"shift",{...count,eftposTotal:undefined}),{status:400});
    const results=await Promise.allSettled([
      recordPendingClosingCount(db,owner,"shift",count),
      recordPendingClosingCount(db,owner,"shift",count)
    ]);
    const success=results.find(result=>result.status==="fulfilled");
    assert.equal(results.filter(result=>result.status==="fulfilled").length,1);
    assert.equal(results.find(result=>result.status==="rejected")?.reason.status,409);
    assert.equal(success.value.actualOperational,44.5);
    assert.equal(success.value.nextOpeningTotal,44.5);
    assert.equal(success.value.variance,4.5);
    assert.equal(success.value.cardVariance,20);
    assert.equal(success.value.closingSafe,100);
    assert.equal(success.value.closedBy,"closer");
    assert.equal(success.value.closedAt.toISOString(),"2026-11-22T17:00:00.000Z");
    assert.equal(success.value.closeReconciliationStatus,"COUNTED");
    let audit=await db.$queryRaw`SELECT "eventType","actorId","details" FROM "StoreOperatorAudit"`;
    assert.equal(audit.length,1);
    assert.equal(audit[0].eventType,"SHIFT_CLOSING_COUNT_RECORDED");
    assert.equal(audit[0].actorId,owner.id);
    assert.equal(audit[0].details.note,count.note);
    assert.equal(audit[0].details.eftposTotal,0);
    const later=(await db.$queryRaw`SELECT "openingOperational","expectedOpeningOperational","openingVariance"
        FROM "CashShiftSession" WHERE "id"='next'`)[0];
    assert.equal(Number(later.openingOperational),19);
    assert.equal(later.expectedOpeningOperational,null);
    assert.equal(later.openingVariance,null);
    const superAdmin={...owner,id:"super",role:"SUPER_ADMIN"};
    const differenceOnly=await recordPendingClosingCount(db,superAdmin,"sibling",{...count,storeId:"T",eftposTotal:undefined});
    assert.equal(differenceOnly.eftposTotal,null);
    assert.equal(differenceOnly.cardVariance,null);
    assert.equal(differenceOnly.closeReconciliationStatus,"COUNTED");
    audit=await db.$queryRaw`SELECT "actorId" FROM "StoreOperatorAudit" WHERE "eventType"='SHIFT_CLOSING_COUNT_RECORDED'`;
    assert.deepEqual(audit.map(row=>row.actorId).sort(),["owner","super"]);
  }finally{
    await db.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
  }
});
