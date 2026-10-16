import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {mappingConfirmationUserId} from "../src/lib/supplier-mapping-confirmation-actor.js";
const source=await readFile(new URL("../src/routes/purchase-orders.js",import.meta.url),"utf8");
const learning=source.slice(source.indexOf("async function learnConfirmedLineCorrection("),source.indexOf("\nconst auditLineState="));
const learn=new Function("n","id","mappingConfirmationUserId",learning+";return learnConfirmedLineCorrection;")(v=>Number(v||0),randomUUID,mappingConfirmationUserId);
const native=(()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==="test"&&["localhost","127.0.0.1","postgres"].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}})();
test("POS credential, including a collision with User ID, never enters User lookup or foreign key",async()=>{
 let calls=0;const tx={$queryRaw:async()=>{calls++;return[{id:"collision"}]}};
 for(const actor of [{id:"operator",tokenType:"STORE_OPERATOR"},{id:"collision",tokenType:"STORE_OPERATOR",role:"SUPER_ADMIN"},null]){
  assert.equal(await mappingConfirmationUserId(tx,{actor,companyId:"c"}),null);
 }assert.equal(calls,0);
});
test("normal account lookup is constrained by company and platform exception is explicit",async()=>{
 let observed;const tx={$queryRaw:async(strings,...values)=>{observed={sql:strings.join("?"),values};return[{id:"owner"}]}};
 assert.equal(await mappingConfirmationUserId(tx,{actor:{id:"owner",role:"OWNER"},companyId:"c"}),"owner");
 assert.match(observed.sql,/"companyId"=/);assert.deepEqual(observed.values,["owner","c",false]);
 await mappingConfirmationUserId(tx,{actor:{id:"owner",role:"SUPER_ADMIN"},companyId:"c"});assert.equal(observed.values[2],true);
 assert.equal(await mappingConfirmationUserId({$queryRaw:async()=>[]},{actor:{id:"deleted"},companyId:"c"}),null);
});
test("actual learning skips incomplete mappings and propagates genuine write failures",async()=>{
 let queries=0;assert.equal(await learn({$queryRaw:async()=>{queries++}},{companyId:"c",supplierId:"s",line:{supplierCode:"",productId:"p"},actor:{id:"u"}}),false);assert.equal(queries,0);
 const error=new Error("real write failed");await assert.rejects(()=>learn({$executeRaw:async()=>{throw error}},{companyId:"c",supplierId:"s",line:{supplierCode:"CODE",productId:"p",quantity:1},actor:{id:"op",tokenType:"STORE_OPERATOR"}}),e=>e===error);
 assert.match(source,/line:corrected,actor:req\.user/);
 assert.match(source,/"operatorId"[^\n]*req\.user\.operatorId\|\|null[^\n]*req\.user\.id/);
});
async function fixture(){
 const {PrismaClient}=await import("@prisma/client");const admin=new PrismaClient(),schema="mapping_actor_"+randomUUID().replaceAll("-","");
 await admin.$executeRawUnsafe('CREATE SCHEMA "'+schema+'"');const url=new URL(process.env.DATABASE_URL);url.searchParams.set("schema",schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 await db.$executeRawUnsafe('CREATE TABLE "User"("id" text PRIMARY KEY,"companyId" text)');
 await db.$executeRawUnsafe(`CREATE TABLE "SupplierProductMapping"("id" text PRIMARY KEY,"companyId" text,"supplierId" text,"supplierItemCode" text,"productId" text,"lastDescription" text,"unitsPerPackage" numeric,"lastUnitCost" numeric,"lastDiscount1" numeric,"lastDiscount2" numeric,"lastDiscount3" numeric,"lastExcisePerInvoiceUnit" numeric,"lastMarkupPercent" numeric,"usageCount" int,"confirmedByUserId" text REFERENCES "User"("id"),"confirmedAt" timestamptz,"lastSeenAt" timestamptz,"createdAt" timestamptz,"updatedAt" timestamptz,UNIQUE("companyId","supplierId","supplierItemCode"))`);
 await db.$executeRawUnsafe('CREATE TABLE "PurchaseOrderLine"("id" text PRIMARY KEY,"grossAmount" numeric)');
 await db.$executeRawUnsafe('CREATE TABLE "StoreOperatorAudit"("id" text PRIMARY KEY,"operatorId" text,"actorId" text,"details" jsonb)');
 await db.$executeRawUnsafe(`INSERT INTO "User" VALUES('owner','c'),('platform','platform-company'),('foreign','other'),('collision','other');`);
 await db.$executeRawUnsafe(`INSERT INTO "PurchaseOrderLine" VALUES('original',10),('control',99)`);
 return {db,close:async()=>{await db.$disconnect();await admin.$executeRawUnsafe('DROP SCHEMA "'+schema+'" CASCADE');await admin.$disconnect()}};
}
const line={supplierCode:"CODE",productId:"p",description:"Synthetic item",quantity:4,unitCost:2.22,discount1:5.5,discount2:0,discount3:0,exciseTotal:0,markupPercent:34.985,stockUnitsPerInvoiceUnit:1};
test("native actual learning: real User FK rejects legacy operator; POS insert/update and Backoffice attribution succeed without losing original audit identity",{skip:!native},async()=>{
 const f=await fixture();try{
  await assert.rejects(()=>f.db.$executeRaw`INSERT INTO "SupplierProductMapping"("id","confirmedByUserId") VALUES('legacy','operator')`,/foreign key/);
  for(const [actor,expected]of [[{id:"operator",operatorId:"operator",tokenType:"STORE_OPERATOR"},null],[{id:"owner",role:"OWNER"},"owner"],[{id:"collision",tokenType:"STORE_OPERATOR"},null],[{id:"foreign",role:"OWNER"},null],[{id:"deleted",role:"OWNER"},null],[{id:"platform",role:"SUPER_ADMIN"},"platform"]]){
   await f.db.$transaction(async tx=>{
    await tx.$executeRaw`UPDATE "PurchaseOrderLine" SET "grossAmount"=9.48 WHERE "id"='original'`;
    assert.equal(await learn(tx,{companyId:"c",supplierId:"supplier",line,actor}),true);
    await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" VALUES(${randomUUID()},${actor.operatorId||null},${actor.id},${JSON.stringify({stockChanged:false})}::jsonb)`;
   });
   const rows=await f.db.$queryRaw`SELECT * FROM "SupplierProductMapping" WHERE "supplierItemCode"='CODE'`;assert.equal(rows.length,1);assert.equal(rows[0].confirmedByUserId,expected);assert.equal(Number(rows[0].lastDiscount1),5.5);assert.equal(Number(rows[0].lastUnitCost),2.22);
  }
  const audits=await f.db.$queryRaw`SELECT * FROM "StoreOperatorAudit" WHERE "operatorId"='operator'`;assert.equal(audits.length,1);assert.equal(audits[0].actorId,"operator");
  const rows=await f.db.$queryRaw`SELECT * FROM "PurchaseOrderLine" ORDER BY "id"`;assert.equal(Number(rows.find(x=>x.id==="control").grossAmount),99);
 }finally{await f.close()}
});
test("native real failure rolls line, mapping and audit back together; no swallowing or FK weakening",{skip:!native},async()=>{
 const f=await fixture();try{
  await assert.rejects(()=>f.db.$transaction(async tx=>{
   await tx.$executeRaw`UPDATE "PurchaseOrderLine" SET "grossAmount"=9.48 WHERE "id"='original'`;
   await learn(tx,{companyId:"c",supplierId:"supplier",line,actor:{id:"operator",tokenType:"STORE_OPERATOR"}});
   await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" VALUES('a','operator','operator','{}'::jsonb)`;
   throw new Error("downstream audit/control failure");
  }),/downstream audit/);
  assert.equal(Number((await f.db.$queryRaw`SELECT "grossAmount" FROM "PurchaseOrderLine" WHERE "id"='original'`)[0].grossAmount),10);
  assert.equal((await f.db.$queryRaw`SELECT * FROM "SupplierProductMapping"`).length,0);assert.equal((await f.db.$queryRaw`SELECT * FROM "StoreOperatorAudit"`).length,0);
 }finally{await f.close()}
});
