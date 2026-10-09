import assert from "node:assert/strict";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import {PrismaClient} from "@prisma/client";

// Check every destination before connecting, importing workers or requesting.
const base=new URL(process.env.E2E_BASE_URL||"http://127.0.0.1:8080");
const database=new URL(process.env.DATABASE_URL);
assert.equal(process.env.NODE_ENV,"test");assert.equal(process.env.MWS_CUSTOMER_DEMO_PREPARATION_ENABLED,"true");
for(const u of [base,database])assert.ok(["127.0.0.1","localhost"].includes(u.hostname));
assert.equal(base.protocol,"http:");assert.equal(base.pathname,"/");
for(const key of ["username","password","search","hash"])assert.equal(base[key],"");
assert.equal(database.pathname,"/myworkstation_test");
const db=new PrismaClient(),run=crypto.randomUUID(),demos=[],fixturePassword=`fixture-${run}`;
const originalFetch=globalThis.fetch;
let workerPrisma;
const http=async(path,token,method="GET",body)=>{
  const response=await originalFetch(new URL(path,base),{method,redirect:"manual",headers:{...(token?{authorization:`Bearer ${token}`}:{ }),...(body?{"content-type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
  return {status:response.status,body:await response.json()};
};
const actor=async(companyId,role="OWNER")=>{
  const user=await db.user.create({data:{companyId,role,email:`runtime-${role.toLowerCase()}-${crypto.randomUUID()}@example.invalid`,fullName:"Synthetic runtime actor",passwordHash:await bcrypt.hash(fixturePassword,4),mustChangePassword:false}});
  const session=await db.userSession.create({data:{userId:user.id,expiresAt:new Date(Date.now()+600000)}});
  const claims={id:user.id,email:user.email,companyId,role:role==="SUPER_ADMIN"?"OWNER":role,isSuperAdmin:role==="SUPER_ADMIN",platformRole:role,sessionId:session.id,sessionVersion:user.sessionVersion,tokenType:"BACKOFFICE_USER"};
  return {user,claims,token:jwt.sign(claims,process.env.JWT_SECRET,{expiresIn:"10m"})};
};
const balances=async demo=>{
  const [row]=await db.$queryRaw`SELECT
    (SELECT COUNT(*)::int FROM "Sale" WHERE "companyId"=${demo.companyId}) AS sales,
    (SELECT COUNT(*)::int FROM "Payment" p JOIN "Sale" s ON s."id"=p."saleId" WHERE s."companyId"=${demo.companyId}) AS payments,
    (SELECT COUNT(*)::int FROM "StockMovement" WHERE "storeId"=${demo.storeId}) AS movements,
    (SELECT COUNT(*)::int FROM "StoreTransaction" WHERE "companyId"=${demo.companyId}) AS transactions,
    (SELECT COUNT(*)::int FROM "CashShiftSession" WHERE "companyId"=${demo.companyId}) AS shifts,
    (SELECT SUM("currentStock") FROM "StoreProduct" WHERE "storeId"=${demo.storeId})::text AS stock`;
  return row;
};
try{
  assert.equal((await db.$queryRaw`SELECT current_database() AS name`)[0].name,"myworkstation_test");
  const {prisma}=await import("../src/prisma.js");workerPrisma=prisma;
  const {claimFastBackground,ensurePosInvoiceBackgroundWorkerSchema}=await import("../src/routes/commerce-pos-v244.js");
  const {runMyDataReceivingSweep,syncMyDataStore}=await import("../src/routes/commerce-mydata-inbox.js");
  const {closeStaleWorkforceAttendance}=await import("../src/workers/workforce-auto-out.js");
  const {ensureRbsCapDriverV1RequestSchema}=await import("../src/rbs-capdriver-v1-requests.js");
  const {finalizeConfirmedCardRequest,finalizeDispatchedCashRequest}=await import("../src/rbs-capdriver-v1-sale-finalize.js");
  const {ensureExtendedModulesSchema}=await import("../src/extended-modules-bootstrap.js");
  const {ensureStoreIntegrationSchema}=await import("../src/store-integration-bootstrap.js");
  await ensureExtendedModulesSchema();
  await ensureStoreIntegrationSchema();
  await ensurePosInvoiceBackgroundWorkerSchema();
  await ensureRbsCapDriverV1RequestSchema(db);
  // Cloud tables are lazily created by the real public health handler; earlier
  // flows need not have visited it. This destination was verified above.
  assert.equal((await http("/api/cloud/v1/health")).status,200);
  const control=await db.company.create({data:{name:"Runtime ordinary control",active:true,licenseStatus:"ACTIVE"}});
  const store=await db.store.create({data:{companyId:control.id,name:"Runtime ordinary control",cashCloseEmailEnabled:false}});
  const productId=`runtime-control-${run}`;
  await db.$executeRaw`INSERT INTO "Product" ("id","companyId","name","sku","salePrice","active") VALUES (${productId},${control.id},'Untouched control',${productId},3.25,TRUE)`;
  await db.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock","active") VALUES (${productId},${store.id},${productId},3.25,123,TRUE)`;
  const controlStock=()=>db.$queryRaw`SELECT p."salePrice",p."active",sp."currentStock",sp."updatedAt" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" WHERE p."id"=${productId}`;
  const beforeControl=await controlStock();
  const sa=await actor(control.id,"SUPER_ADMIN"),owner=await actor(control.id);
  assert.equal((await http("/api/license/current",owner.token)).status,200);
  const ordinaryLogin=await http("/api/auth/login",null,"POST",{email:owner.user.email,password:fixturePassword});assert.equal(ordinaryLogin.status,200);
  assert.equal(jwt.verify(ordinaryLogin.body.token,process.env.JWT_SECRET).companyId,control.id);
  for(const name of ["A","B"]){
    const result=await http("/api/platform/customer-demos",sa.token,"POST",{requestKey:crypto.randomUUID(),displayName:`Runtime demo ${name}`,days:14});
    assert.equal(result.status,201,JSON.stringify(result.body));const demo=result.body.demo;demos.push(demo);
    // Deliberately inject unsafe normal settings in this isolated DB only.
    await db.company.update({where:{id:demo.companyId},data:{active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+86400000)}});
    await db.store.update({where:{id:demo.storeId},data:{active:true,cashCloseEmailEnabled:true,responsibleEmail:"fixture@example.invalid"}});
    for(const moduleKey of ["STORE_MODE","INVENTORY","DOCUMENTS","AI_READER","CONNECTOR_RBS","VIDEO_EVENTS","NETLINK_PREPAID"])await db.companyModule.create({data:{companyId:demo.companyId,moduleKey,active:true}});
    await db.customerDemo.update({where:{id:demo.demoId},data:{status:"ACTIVE"}});
    demo.actor=await actor(demo.companyId);
    demo.deviceId=crypto.randomUUID();
    await db.$executeRaw`INSERT INTO "CloudDevice" ("id","companyId","storeId","deviceKey","name","platform","status","tokenVersion","lastSeenAt") VALUES (${demo.deviceId},${demo.companyId},${demo.storeId},${crypto.randomUUID()},'Synthetic demo device','WINDOWS_RBS_CAPDRIVER_V1','ACTIVE',1,NOW())`;
    // The signed device claims intentionally lie about its tenant; persisted device wins.
    demo.deviceToken=jwt.sign({tokenType:"STORE_DEVICE",deviceId:demo.deviceId,tokenVersion:1,companyId:control.id,storeId:store.id},`${process.env.JWT_SECRET}:STORE_DEVICE`,{expiresIn:"10m"});
    demo.jobId=crypto.randomUUID();
    const handoff=JSON.stringify({posHandoff:{primaryJobId:demo.jobId,pageJobIds:[demo.jobId],fullReader:"ASSISTANT"}});
    await db.$executeRaw`INSERT INTO "AiReaderJob" ("id","companyId","storeId","stage","status","resultJson") VALUES (${demo.jobId},${demo.companyId},${demo.storeId},'POS_BACKGROUND','POS_QUEUED',${handoff}::jsonb)`;
    await db.$executeRaw`INSERT INTO "PosInvoiceBackgroundTask" ("jobId","companyId","storeId","state","availableAt") VALUES (${demo.jobId},${demo.companyId},${demo.storeId},'QUEUED',NOW())`;
    await db.$executeRaw`INSERT INTO "StoreIntegrationCredential" ("id","companyId","storeId","kind","providerName","environment","credentialsEnc","enabled","externalCallsEnabled") VALUES (${crypto.randomUUID()},${demo.companyId},${demo.storeId},'MYDATA','Injected synthetic config','PRODUCTION','fixture-not-a-credential',TRUE,TRUE)`;
    const employee=await db.workforceEmployee.create({data:{companyId:demo.companyId,baseStoreId:demo.storeId,fullName:"Synthetic demo employee"}});
    demo.attendance=await db.workforceAttendanceSession.create({data:{companyId:demo.companyId,storeId:demo.storeId,employeeId:employee.id,startedAt:new Date(Date.now()-13*3600000),status:"OPEN"}});
    demo.before=await balances(demo);
    demo.beforeDevice=(await db.$queryRaw`SELECT "status","lastSeenAt","tokenVersion" FROM "CloudDevice" WHERE "id"=${demo.deviceId}`)[0];
  }
  assert.notEqual(demos[0].companyId,demos[1].companyId);assert.notEqual(demos[0].storeId,demos[1].storeId);
  for(const demo of demos){
    demo.rbsId=crypto.randomUUID();
    await db.$executeRaw`INSERT INTO "RbsCapDriverV1Request" ("id","companyId","storeId","terminalPos","clientTransactionId","requestHash","paymentMethod","total","commandText","commandHash") VALUES (${demo.rbsId},${demo.companyId},${demo.storeId},'DEMO',${crypto.randomUUID()},'fixture-only','CASH',1,'INERT FIXTURE - NO FISCAL COMMAND','fixture-only')`;
    demo.beforeRbs=(await db.$queryRaw`SELECT "status","claimedAt","dispatchedAt","saleId" FROM "RbsCapDriverV1Request" WHERE "id"=${demo.rbsId}`)[0];
    for(const paymentMethod of ["CASH","CARD","IRIS","MIXED","CREDIT"]){
      const r=await http(`/api/store-pos/stores/${demo.storeId}/checkout`,demo.actor.token,"POST",{paymentMethod,items:[{productId:`${demo.companyId}-product-DEMO-001`,quantity:1}],installable:true,isDemo:false});
      assert.equal(r.status,403);assert.equal(r.body.code,"CUSTOMER_DEMO_RUNTIME_LOCKED");
    }
    for(const [path,method,body] of [["/api/netlink/menu","GET"],["/api/commerce/documents/mydata/sync","POST",{storeId:store.id}],["/api/commerce/ai-reader/jobs/opaque/ai-recheck","POST",{force:true}],["/api/platform/internet-product-search","GET"],["/api/unknown/future-provider","POST",{enabled:true}]]){
      assert.equal((await http(path,demo.actor.token,method,body)).status,403);
    }
    // A real backing session in a demo is rejected even if a signed claim names a real control.
    const forged=jwt.sign({...demo.actor.claims,companyId:control.id,storeId:store.id},process.env.JWT_SECRET,{expiresIn:"10m"});
    assert.equal((await http("/api/license/current",forged)).status,403);
    const beforeLoginSessions=await db.userSession.count({where:{userId:demo.actor.user.id}});
    const login=await http("/api/auth/login",null,"POST",{email:demo.actor.user.email,password:fixturePassword});assert.equal(login.status,403);assert.match(login.body.error,/Το demo βρίσκεται σε προετοιμασία/);
    assert.equal(await db.userSession.count({where:{userId:demo.actor.user.id}}),beforeLoginSessions);
    for(const path of ["/api/cloud/v1/device/bootstrap","/api/cloud/v1/device/changes"]){const r=await http(path,demo.deviceToken);assert.equal(r.status,403);assert.equal(r.body.code,"CUSTOMER_DEMO_OUTBOUND_BLOCKED");}
    for(const path of ["/api/cloud/v1/device/rbs-capdriver-v1/next","/api/cloud/v1/device/video/heartbeat"]){const r=await http(path,demo.deviceToken,"POST",{});assert.equal(r.status,403);assert.equal(r.body.code,"CUSTOMER_DEMO_OUTBOUND_BLOCKED");}
    assert.equal((await http(`/api/operators/stores/${demo.storeId}/terminal/activate`,null,"POST",{})).status,403);
    assert.equal((await http(`/api/platform/companies/%63ustomer-demo-${demo.demoId}`,sa.token,"PATCH",{active:true})).status,409);
    assert.equal((await http(`/api/public/online/${demo.storeId}`,null)).status,403);
    await assert.rejects(finalizeConfirmedCardRequest(demo.rbsId),e=>e.code==="CUSTOMER_DEMO_OUTBOUND_BLOCKED");
    await assert.rejects(finalizeDispatchedCashRequest(demo.rbsId),e=>e.code==="CUSTOMER_DEMO_OUTBOUND_BLOCKED");
  }
  let outbound=0;
  globalThis.fetch=async()=>{outbound++;throw new Error("No provider transport permitted in demo worker probe")};
  // Revoked and expired tasks retain the same identities, cannot be repaired,
  // claimed or dispatched, even with injected active company/store settings.
  const revoked=await http(`/api/platform/customer-demos/${demos[0].demoId}/revoke`,sa.token,"POST",{});assert.equal(revoked.status,200);
  await db.customerDemo.update({where:{id:demos[1].demoId},data:{createdAt:new Date(Date.now()-15*86400000),expiresAt:new Date(Date.now()-86400000),status:"PREPARED"}});
  await ensurePosInvoiceBackgroundWorkerSchema();assert.equal(await claimFastBackground(),null);
  let warnings=0;const warn=console.warn;console.warn=()=>warnings++;
  try{await runMyDataReceivingSweep()}finally{console.warn=warn}
  assert.equal(warnings,0,"myDATA worker must successfully exclude targets, not hide an error");
  for(const demo of demos)assert.throws(()=>syncMyDataStore({user:{companyId:demo.companyId},body:{storeId:demo.storeId}}),e=>e.code==="CUSTOMER_DEMO_OUTBOUND_BLOCKED");
  assert.equal(outbound,0);globalThis.fetch=originalFetch;
  const ordinaryEmployee=await db.workforceEmployee.create({data:{companyId:control.id,baseStoreId:store.id,fullName:"Ordinary worker control"}});
  const ordinaryAttendance=await db.workforceAttendanceSession.create({data:{companyId:control.id,storeId:store.id,employeeId:ordinaryEmployee.id,startedAt:new Date(Date.now()-13*3600000),status:"OPEN"}});
  await closeStaleWorkforceAttendance();
  const ordinaryAfter=await db.workforceAttendanceSession.findUnique({where:{id:ordinaryAttendance.id}});
  assert.equal(ordinaryAfter.status,"NEEDS_APPROVAL");assert.equal(ordinaryAfter.workedMinutes,720);assert.ok(ordinaryAfter.clockOutEntryId);
  assert.equal(await db.workforceAuditLog.count({where:{companyId:control.id,entityId:ordinaryAttendance.id,action:"WORKFORCE_AUTO_OUT_12H"}}),1);
  for(const demo of demos){
    assert.deepEqual(await balances(demo),demo.before);
    assert.deepEqual(await db.workforceAttendanceSession.findUnique({where:{id:demo.attendance.id}}),demo.attendance);
    assert.deepEqual((await db.$queryRaw`SELECT "status","lastSeenAt","tokenVersion" FROM "CloudDevice" WHERE "id"=${demo.deviceId}`)[0],demo.beforeDevice);
    assert.deepEqual((await db.$queryRaw`SELECT "status","claimedAt","dispatchedAt","saleId" FROM "RbsCapDriverV1Request" WHERE "id"=${demo.rbsId}`)[0],demo.beforeRbs);
    const [task]=await db.$queryRaw`SELECT "state","attemptCount","leaseToken" FROM "PosInvoiceBackgroundTask" WHERE "jobId"=${demo.jobId}`;
    assert.deepEqual(task,{state:"QUEUED",attemptCount:0,leaseToken:null});
    assert.equal((await http("/api/license/current",demo.actor.token)).status,403);
  }
  assert.equal((await http("/api/license/current",owner.token)).status,200);assert.deepEqual(await controlStock(),beforeControl);
  const list=await http("/api/platform/customer-demos",sa.token);assert.equal(list.status,200);
  assert.ok(list.body.demos.every(d=>d.installable===false));
  assert.equal(list.body.demos.find(d=>d.demoId===demos[0].demoId).status,"REVOKED");assert.equal(list.body.demos.find(d=>d.demoId===demos[1].demoId).status,"EXPIRED");
  console.log(JSON.stringify({observedAt:new Date().toISOString(),result:"Customer demo closed runtime PostgreSQL + HTTP PASS",demoTenants:2,outboundCalls:outbound,checks:["active-settings injection","owner login/session tenant","opaque persisted device scope","all payment modes denied","RBS queue/finalizer unchanged","revoked/expired pending jobs unclaimed","myDATA sweep excluded","demo attendance unchanged","ordinary attendance worker preserved","ordinary stock/price/auth unchanged"],runtimeActivation:"NOT IMPLEMENTED",windowsAcceptance:"NOT TESTED"}));
}finally{
  globalThis.fetch=originalFetch;
  for(const demo of demos){await db.store.update({where:{id:demo.storeId},data:{active:false,cashCloseEmailEnabled:false}});await db.company.update({where:{id:demo.companyId},data:{active:false,licenseStatus:"SUSPENDED"}});}
  await db.$disconnect();if(workerPrisma)await workerPrisma.$disconnect();
}
