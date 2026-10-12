import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {readFile} from "node:fs/promises";
import {ensureCustomerOperatorCardSchema,linkCustomerOperatorCard,findLinkedOperatorCustomer} from "../src/lib/customer-operator-card.js";
import {workCardHash} from "../src/workforce-card-code.js";
import {customerAudience} from "../../shared/customer-discount.mjs";
import express from "express";
import {z} from "zod";

const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==="test"&&["localhost","127.0.0.1","postgres"].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test("native work-card link is unique, scoped, current, revocable and does not alter credentials or finances",{skip:!isolated()},async()=>{
  const {PrismaClient}=await import("@prisma/client"),admin=new PrismaClient(),schema=`operator_customer_card_test_${crypto.randomUUID().replaceAll("-","")}`;
  const url=new URL(process.env.DATABASE_URL);url.searchParams.set("schema",schema);const db=new PrismaClient({datasourceUrl:url.toString()});
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for(const sql of [
      'CREATE TABLE "Customer"("id" text primary key,"companyId" text,"active" boolean,"discountAudience" text,"balance" numeric,"points" numeric,"memberCard" text)',
      'CREATE TABLE "Store"("id" text primary key,"companyId" text,"active" boolean)',
      'CREATE TABLE "Employee"("id" text primary key,"storeId" text,"active" boolean)',
      'CREATE TABLE "StoreOperatorCredential"("id" text primary key,"companyId" text,"storeId" text,"employeeId" text,"displayName" text,"cardCodeHash" text,"cardCodeLast4" text,"active" boolean,"role" text,"pinHash" text)',
      'CREATE TABLE "StoreOperatorAudit"("id" text primary key,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb)',
      'CREATE TABLE "Sale"("id" text)', 'CREATE TABLE "StockMovement"("id" text)', 'CREATE TABLE "CustomerLedger"("id" text)',
    ])await db.$executeRawUnsafe(sql);
    await db.$executeRawUnsafe(`INSERT INTO "Customer" VALUES ('staff','company',TRUE,'STAFF',3,7,'MEMBER1'),('other','company',TRUE,'STAFF',0,0,'MEMBER2'),('doctor','company',TRUE,'DOCTOR',0,0,'MEMBER3'),('foreign','foreign',TRUE,'STAFF',9,2,'MEMBER4')`);
    await db.$executeRawUnsafe(`INSERT INTO "Store" VALUES ('store','company',TRUE),('sibling','company',TRUE),('foreign-store','foreign',TRUE)`);
    await db.$executeRawUnsafe(`INSERT INTO "Employee" VALUES ('employee','store',TRUE),('sibling-employee','sibling',TRUE),('foreign-employee','foreign-store',TRUE)`);
    for(const [id,company,store,employee] of [["credential","company","store","employee"],["sibling","company","sibling","sibling-employee"],["foreign-credential","foreign","foreign-store","foreign-employee"]])await db.$executeRaw`INSERT INTO "StoreOperatorCredential" VALUES (${id},${company},${store},${employee},${id},${workCardHash("MW2ABCDEF1234567890")},'7890',TRUE,'EMPLOYEE','original-pin-hash')`;
    const before=await db.$queryRaw`SELECT * FROM "StoreOperatorCredential" ORDER BY "id"`,customersBefore=await db.$queryRaw`SELECT * FROM "Customer" ORDER BY "id"`;
    const scope={companyId:"company",storeId:"store",customerId:"staff",actorId:"owner",credentialId:"credential"};
    await ensureCustomerOperatorCardSchema(db);
    const routeSource=await readFile(new URL("../src/routes/customer-operator-cards.js",import.meta.url),"utf8");
    const router=new Function("Router","z","prisma","ensureCustomerOperatorCardSchema","linkCustomerOperatorCard",routeSource.replace(/^import .*;\n/gm,"").replace("export default router;","return router;"))(express.Router,z,db,ensureCustomerOperatorCardSchema,linkCustomerOperatorCard);
    const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={id:"owner",role:req.headers["x-test-role"]||"OWNER",companyId:"company",tokenType:req.headers["x-test-token-type"]||"COMPANY"};next()});app.use("/api/customer-control",router);app.use((e,req,res,next)=>res.status(e.name==="ZodError"?400:e.status||500).json({error:e.message}));
    const server=await new Promise(resolve=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s))}),origin=`http://127.0.0.1:${server.address().port}`;
    try{
      const path="/api/customer-control/stores/store/operator-card-options";
      const options=await fetch(origin+path);assert.equal(options.status,200);const data=await options.json();assert.equal(data.items.length,1);assert.deepEqual(Object.keys(data.items[0]).sort(),["cardCodeLast4","credentialId","displayName","linkedCustomerId"]);
      assert.equal((await fetch(origin+path,{headers:{"x-test-role":"EMPLOYEE"}})).status,403);
      assert.equal((await fetch(origin+path,{headers:{"x-test-role":"MANAGER","x-test-token-type":"STORE_OPERATOR"}})).status,403);
      assert.equal((await fetch(origin+"/api/customer-control/stores/foreign-store/operator-card-options")).status,404);
      assert.equal((await fetch(origin+"/api/customer-control/foreign/operator-card?storeId=store")).status,404);
      assert.equal((await fetch(origin+"/api/customer-control/staff/operator-card",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({storeId:"store",credentialId:"credential",role:"MANAGER"})})).status,400);
    }finally{await new Promise(resolve=>server.close(resolve))}
    await assert.rejects(linkCustomerOperatorCard(db,{...scope,customerId:"foreign"}),e=>e.status===404);
    await assert.rejects(linkCustomerOperatorCard(db,{...scope,credentialId:"sibling"}),e=>e.status===404);
    await assert.rejects(linkCustomerOperatorCard(db,{...scope,credentialId:"foreign-credential"}),e=>e.status===404);
    await assert.rejects(linkCustomerOperatorCard(db,{...scope,customerId:"doctor"}),e=>e.status===409);
    const race=await Promise.allSettled([linkCustomerOperatorCard(db,scope),linkCustomerOperatorCard(db,{...scope,customerId:"other"})]);
    assert.equal(race.filter(r=>r.status==="fulfilled").length,1);assert.equal(race.find(r=>r.status==="rejected").reason.status,409);
    const winner=(await db.$queryRaw`SELECT "customerId" FROM "CustomerOperatorCardLink" WHERE "credentialId"='credential'`)[0].customerId;
    const winningScope={...scope,customerId:winner};
    assert.deepEqual(await findLinkedOperatorCustomer(db,scope,"mw2-abcdef1234567890"),[{id:winner}]);
    assert.deepEqual(await findLinkedOperatorCustomer(db,scope,"μς2αβψδεφ1234567890"),[{id:winner}]);
    assert.deepEqual(await findLinkedOperatorCustomer(db,{...scope,storeId:"sibling"},"MW2ABCDEF1234567890"),[]);
    assert.deepEqual(await findLinkedOperatorCustomer(db,{...scope,companyId:"foreign"},"MW2ABCDEF1234567890"),[]);
    const auditBefore=(await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "StoreOperatorAudit"`)[0].n;
    await linkCustomerOperatorCard(db,winningScope);assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "StoreOperatorAudit"`)[0].n,auditBefore);
    for(const [table,id] of [["StoreOperatorCredential","credential"],["Employee","employee"],["Customer",winner]]){
      await db.$executeRawUnsafe(`UPDATE "${table}" SET "active"=FALSE WHERE "id"=$1`,id);
      assert.deepEqual(await findLinkedOperatorCustomer(db,scope,"MW2ABCDEF1234567890"),[]);
      await db.$executeRawUnsafe(`UPDATE "${table}" SET "active"=TRUE WHERE "id"=$1`,id);
    }
    await db.$executeRaw`UPDATE "Customer" SET "discountAudience"='DOCTOR' WHERE "id"=${winner}`;
    assert.deepEqual(await findLinkedOperatorCustomer(db,scope,"MW2ABCDEF1234567890"),[]);
    await db.$executeRaw`UPDATE "Customer" SET "discountAudience"='STAFF' WHERE "id"=${winner}`;
    await db.$executeRaw`UPDATE "StoreOperatorCredential" SET "cardCodeHash"=${workCardHash("MW2FEDCBA0987654321")} WHERE "id"='credential'`;
    assert.deepEqual(await findLinkedOperatorCustomer(db,scope,"MW2ABCDEF1234567890"),[]);
    assert.deepEqual(await findLinkedOperatorCustomer(db,scope,"MW2FEDCBA0987654321"),[{id:winner}]);
    await db.$executeRaw`UPDATE "StoreOperatorCredential" SET "cardCodeHash"=${workCardHash("MW2ABCDEF1234567890")} WHERE "id"='credential'`;
    await linkCustomerOperatorCard(db,{...winningScope,credentialId:null});
    assert.deepEqual(await findLinkedOperatorCustomer(db,scope,"MW2ABCDEF1234567890"),[]);
    await linkCustomerOperatorCard(db,{...scope,customerId:winner==="staff"?"other":"staff"});
    const linkedBeforeRollback=await db.$queryRaw`SELECT * FROM "CustomerOperatorCardLink" ORDER BY "customerId"`;
    await db.$executeRawUnsafe(`CREATE FUNCTION reject_work_card_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'isolated late audit failure'; END $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(`CREATE TRIGGER reject_work_card_audit BEFORE INSERT ON "StoreOperatorAudit" FOR EACH ROW EXECUTE FUNCTION reject_work_card_audit()`);
    await assert.rejects(linkCustomerOperatorCard(db,{...scope,customerId:winner==="staff"?"other":"staff",credentialId:null}),/isolated late audit failure/);
    assert.deepEqual(await db.$queryRaw`SELECT * FROM "CustomerOperatorCardLink" ORDER BY "customerId"`,linkedBeforeRollback);
    assert.deepEqual(await db.$queryRaw`SELECT * FROM "StoreOperatorCredential" ORDER BY "id"`,before);
    assert.deepEqual(await db.$queryRaw`SELECT * FROM "Customer" ORDER BY "id"`,customersBefore);
    for(const table of ["Sale","StockMovement","CustomerLedger"])assert.equal((await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "${table}"`))[0].n,0);
    const audits=await db.$queryRaw`SELECT "details" FROM "StoreOperatorAudit"`;
    assert.ok(audits.length>=3);assert.ok(!JSON.stringify(audits).includes("MW2ABCDEF"));assert.ok(!JSON.stringify(audits).includes("original-pin-hash"));
  }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});

test("actual audience scanner resolves the linked customer while retaining ordinary audience and unlinked work cards",async()=>{
  const source=await readFile(new URL("../src/routes/store-pos.js",import.meta.url),"utf8"),start=source.indexOf('router.post("/stores/:storeId/audience-card/scan"'),end=source.indexOf('router.post("/stores/:storeId/customer-card/scan"',start);
  let handler,linked=[{id:"staff"}],members=[],legacy=false,worker=false,saved;
  const db={$queryRaw:async sql=>{const text=sql.join("");if(text.includes('FROM "Customer"'))return members;if(text.includes('FROM "AudienceDiscountCard"'))return legacy?[{audience:"NURSE",label:"Audience",cardLast4:"9999"}]:[];return worker?[{label:"Unlinked staff"}]:[]},$executeRaw:async()=>1};
  new Function("router","prisma","z","crypto","assertStore","storeFor","normalizeAudienceCard","normalizeWorkCard","requirePosAudienceEnabled","ensureAudienceCardTable","findLinkedOperatorCustomer","resolveCustomer","customerAudience","audienceCardHash","workCardHash","workCardLast4","saveAudienceSelection",source.slice(start,end))(
    {post(path,fn){handler=fn}},db,z,crypto,()=>{},async()=>({id:"store"}),v=>String(v).replace(/[^A-Za-z0-9]/g,"").toUpperCase(),v=>String(v),async()=>{},async()=>{},async()=>linked,async(req,id)=>({id,name:"Named staff",discountAudience:"STAFF",discountPercent:20,memberCard:"MEMBER-SECRET"}),customerAudience,()=>"hash",()=>"workhash",()=>"7890",async(req,id,a)=>saved=a);
  const call=async()=>{let result,status=200;await handler({user:{id:"cashier",companyId:"company"},params:{storeId:"store"},body:{cardCode:"MW2ABCDEF1234567890"}},{status(v){status=v;return this},json(v){result=v}},e=>{throw e});return {result,status}};
  let r=await call();assert.equal(r.result.customer.id,"staff");assert.equal(r.result.customer.discountPercent,20);assert.equal(r.result.customer.memberCard,undefined);assert.equal(saved,"STAFF");
  linked=[];legacy=true;r=await call();assert.equal(r.result.audience,"NURSE");assert.equal(r.result.customer,null);
  legacy=false;worker=true;r=await call();assert.equal(r.result.audience,"STAFF");assert.equal(r.result.label,"Unlinked staff");assert.equal(r.result.customer,null);
  linked=[{id:"staff"}];members=[{id:"someone-else"}];assert.equal((await call()).status,409);
});

test("actual member-card scan returns linked STAFF customer without changing login identity or leaking card",async()=>{
  const source=await readFile(new URL("../src/routes/store-pos.js",import.meta.url),"utf8"),start=source.indexOf('router.post("/stores/:storeId/customer-card/scan"'),end=source.indexOf('router.post("/stores/:storeId/customer-receipt-recovery"',start);
  const {z}=await import("zod");let handler,enabled=true,memberIds=[],linkedIds=[{id:"staff"}],selection,queries=0;
  const user={id:"cashier",role:"EMPLOYEE",companyId:"company",storeId:"store",tokenType:"STORE_OPERATOR"};
  const db={$queryRaw:async()=>memberIds,$executeRaw:async()=>{queries++;return 1}};
  new Function("router","prisma","z","crypto","assertStore","storeFor","normalizeAudienceCard","resolveCustomer","readPosAudienceSettings","customerAudience","saveAudienceSelection","findLinkedOperatorCustomer","normalizeWorkCard",source.slice(start,end))(
    {post(path,fn){handler=fn}},db,z,crypto,(req,id)=>{if(req.user.storeId!==id)throw Object.assign(Error("store"),{status:403})},async()=>({id:"store"}),v=>String(v).replace(/[^A-Za-z0-9]/g,"").toUpperCase(),async(req,id)=>({id,name:"Named staff",discountAudience:"STAFF",discountPercent:20,memberCard:"MEMBER-SECRET"}),async()=>({enabled}),customerAudience,async(req,id,a)=>selection=a,async(db,s,card)=>{assert.equal(s.companyId,"company");assert.equal(s.storeId,"store");assert.equal(card,"MW2ABCDEF1234567890");return linkedIds},v=>String(v).replace(/[^A-Za-z0-9]/g,"").toUpperCase());
  const call=async()=>{let data,status=200;await handler({user,params:{storeId:"store"},body:{cardCode:"MW2ABCDEF1234567890"}},{status(v){status=v;return this},json(v){data=v}},e=>{throw e});return {data,status}};
  let r=await call();assert.equal(r.data.customer.id,"staff");assert.equal(r.data.customer.discountPercent,20);assert.equal(r.data.customer.memberCard,undefined);assert.equal(selection,"STAFF");assert.equal(user.id,"cashier");assert.equal(user.role,"EMPLOYEE");
  enabled=false;r=await call();assert.equal(selection,"NORMAL");assert.equal(r.data.customer.id,"staff");
  memberIds=[{id:"different-customer"}];assert.equal((await call()).status,404);assert.equal(queries,2);
  memberIds=[];linkedIds=[];assert.equal((await call()).status,404);
});
