import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==="test"&&["localhost","127.0.0.1","postgres"].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test("native PostgreSQL consumption source isolates company/store/kind, Greek midnight and future events without double counting",{skip:!isolated()},async()=>{
 const {PrismaClient}=await import("@prisma/client"),admin=new PrismaClient(),schema="voice_consumption_"+randomUUID().replaceAll("-","");
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set("schema",schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await db.$executeRawUnsafe('CREATE TABLE "PosSaleActionAudit"("id" text primary key,"companyId" text,"storeId" text,"createdAt" timestamptz,"actionType" text,"actorName" text,"details" jsonb)');
  const details=JSON.stringify({items:[{name:"ΝΕΡΟ 500ML",sku:"2269",quantity:1.5,unitPrice:.5,value:.75,privateKey:"PRIVATE"}],secret:"PRIVATE"});
  for(const [id,company,store,kind,date] of [
   ["inside","c","s","SELF_CONSUMPTION","2026-10-09T21:00:00Z"],["late","c","s","SELF_CONSUMPTION","2026-10-10T20:59:59Z"],
   ["early","c","s","SELF_CONSUMPTION","2026-10-09T20:59:59Z"],["next","c","s","SELF_CONSUMPTION","2026-10-10T21:00:00Z"],
   ["control","c","control","SELF_CONSUMPTION","2026-10-10T10:00:00Z"],["foreign","x","s","SELF_CONSUMPTION","2026-10-10T10:00:00Z"],
   ["destruction","c","s","PRODUCT_DESTRUCTION","2026-10-10T10:00:00Z"],["sale","c","s","SALE_CASH","2026-10-10T10:00:00Z"]
  ])await db.$executeRaw`INSERT INTO "PosSaleActionAudit" VALUES(${id},${company},${store},${new Date(date)},${kind},'Χειριστής',${details}::jsonb)`;
  const {readAssistantConsumption}=await import("../src/services/assistant-consumption.js"),scope={companyId:"c",storeId:"s",companyName:"Company",storeName:"LAB"},args={kind:"SELF_CONSUMPTION",from:"2026-10-10",to:"2026-10-10",product:null};
  const report=await readAssistantConsumption(args,scope,{db,now:new Date("2026-10-11T18:00:00Z")});assert.deepEqual(report.rows.map(r=>r.eventId),["late","inside"]);assert.equal(report.totals.referenceValue,1.5);assert.doesNotMatch(JSON.stringify(report),/PRIVATE|privateKey|secret/);
  const incomplete=await readAssistantConsumption(args,scope,{db,now:new Date("2026-10-10T10:00:00Z")});assert.equal(incomplete.incompletePeriod,true);assert.deepEqual(incomplete.rows.map(r=>r.eventId),["inside"]);
  assert.equal((await readAssistantConsumption({...args,kind:"PRODUCT_DESTRUCTION"},scope,{db,now:new Date("2026-10-11")})).rows[0].eventId,"destruction");
  assert.equal((await readAssistantConsumption({...args,product:"μη υπάρχον"},scope,{db,now:new Date("2026-10-11")})).result,"no_records");
  const rows=await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "PosSaleActionAudit"`;assert.equal(rows[0].count,8);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
