import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==="test"&&["localhost","127.0.0.1","postgres"].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};

test("native settings HTTP persists one optimistic winner, isolates scope and previews saved cash rules without changing sources",{skip:!isolated()},async()=>{
 const {PrismaClient}=await import("@prisma/client"),admin=new PrismaClient(),schema="auto_settings_"+randomUUID().replaceAll("-","");
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set("schema",schema);const db=new PrismaClient({datasourceUrl:url.toString()});let server;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await db.$executeRawUnsafe('CREATE TABLE "User"("id" text primary key,"role" text)');
  await db.$executeRawUnsafe('CREATE TABLE "Store"("id" text primary key,"companyId" text,"name" text,"active" boolean,"responsibleEmail" text)');
  await db.$executeRawUnsafe('CREATE TABLE "CashControlStoreRule"("storeId" text primary key,"companyId" text,"mode" text,"deliveryTerminalPattern" text,"carryOverEnabled" boolean,"posEftposEnabled" boolean,"updatedAt" timestamptz default now())');
  await db.$executeRawUnsafe('CREATE TABLE "CashShiftSession"("id" text primary key,"companyId" text,"storeId" text,"terminalPos" text,"status" text,"openedBy" text,"openedByName" text,"openedAt" timestamptz,"closedAt" timestamptz,"variance" numeric(14,2),"updatedAt" timestamptz default now())');
  await db.$executeRaw`INSERT INTO "User" VALUES('sa','SUPER_ADMIN'),('owner','OWNER')`;
  await db.$executeRaw`INSERT INTO "Store" VALUES('s','c','LAB',true,'existing@example.invalid'),('control','c','ΕΣΤΙΑ',true,NULL),('foreign','x','FOREIGN',true,NULL),('inactive','c','INACTIVE',false,NULL)`;
  await db.$executeRaw`INSERT INTO "CashControlStoreRule"("storeId","companyId","mode","deliveryTerminalPattern","carryOverEnabled","posEftposEnabled") VALUES('s','c','FULL','DELIVERY',true,true)`;
  for(const [id,hour,next,variance] of [["morning","07","2020-01-15T15:00:00+02:00",-10],["afternoon","15","2020-01-15T23:00:00+02:00",8],["night","23","2020-01-16T07:00:00+02:00",0]])await db.$executeRaw`INSERT INTO "CashShiftSession"("id","companyId","storeId","terminalPos","status","openedBy","openedByName","openedAt","closedAt","variance") VALUES(${id},'c','s','MAIN','CLOSED','employee','Employee',${new Date(`2020-01-15T${hour}:00:00+02:00`)},${new Date(next)},${variance})`;
  // Complete the other six business days of this Monday–Sunday week.
  for(const day of ["2020-01-13","2020-01-14","2020-01-16","2020-01-17","2020-01-18","2020-01-19"]){
   const next=new Date(Date.parse(day+"T12:00:00Z")+86400000).toISOString().slice(0,10);
   for(const [slot,hour,end] of [[0,"07","15"],[1,"15","23"],[2,"23","07"]])await db.$executeRaw`INSERT INTO "CashShiftSession"("id","companyId","storeId","terminalPos","status","openedBy","openedByName","openedAt","closedAt","variance") VALUES(${day+"-"+slot},'c','s','MAIN','CLOSED','employee','Employee',${new Date(day+"T"+hour+":00:00+02:00")},${new Date((slot===2?next:day)+"T"+end+":00:00+02:00")},0)`;
  }
  const {ensureAutomaticReportSettingsSchema}=await import("../src/services/automatic-report-settings.js");await ensureAutomaticReportSettingsSchema(db);
  const snapshot=async()=>({shifts:await db.$queryRaw`SELECT * FROM "CashShiftSession" ORDER BY "id"`,stores:await db.$queryRaw`SELECT * FROM "Store" ORDER BY "id"`,rules:await db.$queryRaw`SELECT * FROM "CashControlStoreRule" ORDER BY "storeId"`});
  const before=await snapshot(),express=(await import("express")).default,{createAutomaticReportSettingsRouter}=await import("../src/routes/automatic-report-settings.js");
  const app=express();app.use(express.json());app.use((req,res,next)=>{const id=req.headers["x-test-actor"];if(!id)return res.sendStatus(401);req.user={id};next()});app.use("/companies/:companyId/stores/:storeId/report-settings",createAutomaticReportSettingsRouter(db));app.use((e,req,res,next)=>res.status(500).json({error:e.message}));
  server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));
  const base=`http://127.0.0.1:${server.address().port}/companies/c/stores/s/report-settings`;
  const request=async(path=base,method="GET",body,actor="sa")=>{const response=await fetch(path,{method,headers:{"content-type":"application/json",...(actor?{"x-test-actor":actor}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,cache:response.headers.get("cache-control"),body:response.status===401?null:await response.json()}};
  let previewVersion=0;
  const initial=await request();assert.equal(initial.status,200);assert.equal(initial.cache,"no-store");assert.equal(initial.body.settings,null);assert.equal(initial.body.dispatchEnabled,false);assert.deepEqual(initial.body.observedTerminals,["MAIN"]);
  const config={dayStartHour:7,secondShiftStartHour:15,thirdShiftStartHour:23,terminals:[{terminalPos:"MAIN",requiredSlots:[1,2,3]}],cashRule:initial.body.cashRule};
  assert.equal((await request(base+"/preview","POST",{day:"2020-01-15",expectedVersion:previewVersion})).body.code,"REPORT_SETTINGS_REQUIRED");
  const first=await Promise.all([request(base,"PUT",{expectedVersion:0,configuration:config}),request(base,"PUT",{expectedVersion:0,configuration:config})]);assert.deepEqual(first.map(r=>r.status).sort(),[200,409]);
  const reopened=await request();assert.equal(reopened.body.settings.version,1);assert.deepEqual(reopened.body.settings.configuration,config);
  previewVersion=1;const preview=await request(base+"/preview","POST",{day:"2020-01-15",expectedVersion:previewVersion});assert.equal(preview.status,200);assert.equal(preview.body.ready,true);assert.equal(preview.body.sourceReadiness,"READY");assert.equal(preview.body.financialFinality,"PROVISIONAL");assert.equal(preview.body.financialReconciliationComplete,false);assert.deepEqual(preview.body.financialLimitations,["DOCUMENT_PAYMENT_RECONCILIATION_NOT_VERIFIED","CASH_REVIEW_EXPLANATIONS_NOT_VERIFIED","PHYSICAL_CASH_AND_CONTROL_BALANCES_NOT_VERIFIED"]);assert.equal(preview.body.settingsVersion,1);assert.equal(preview.body.deliveryStatus,"PREVIEW_ONLY");assert.equal(preview.body.groups[0].netVariance,-2);assert.equal(preview.body.groups[0].rows[0].variance,-10);
  assert.equal((await request(base+"/preview","POST",{day:"2020-01-15",expectedVersion:previewVersion,configuration:config})).status,400);
  const weeklyBody={day:"2020-01-15",expectedVersion:1,frequency:"WEEKLY"};
  const weekly=await request(base+"/preview","POST",weeklyBody);
  assert.equal(weekly.status,200);assert.equal(weekly.body.ready,true);assert.equal(weekly.body.sourceReadiness,"READY");assert.equal(weekly.body.financialFinality,"PROVISIONAL");assert.equal(weekly.body.financialReconciliationComplete,false);assert.deepEqual(weekly.body.financialLimitations,preview.body.financialLimitations);assert.equal(weekly.body.kind,"WEEKLY_CASH_PREVIEW");assert.equal(weekly.body.sourceCount,21);assert.equal(weekly.body.dayReadiness.length,7);assert.equal(weekly.body.period.fromDay,"2020-01-13");assert.equal(weekly.body.period.toDay,"2020-01-19");assert.equal(weekly.body.period.to,"2020-01-20T05:00:00.000Z");
  assert.equal((await request(base+"/preview","POST",{...weeklyBody,frequency:"MONTHLY"})).status,400);
  assert.equal((await request(base+"/preview","POST",weeklyBody,"owner")).status,403);
  await db.$executeRaw`UPDATE "CashShiftSession" SET "status"='OPEN',"closedAt"=NULL WHERE "id"='2020-01-19-2'`;
  const sundayOpen=await request(base+"/preview","POST",weeklyBody);assert.equal(sundayOpen.body.groups,null);assert.equal(sundayOpen.body.sourceReadiness,"HOLD");assert.equal(sundayOpen.body.financialFinality,"PROVISIONAL");assert.equal(sundayOpen.body.financialReconciliationComplete,false);assert.deepEqual(sundayOpen.body.financialLimitations,preview.body.financialLimitations);assert.ok(sundayOpen.body.holds.some(h=>h.day==="2020-01-19"&&h.code==="THIRD_SHIFT_OPEN"));
  await db.$executeRaw`UPDATE "CashShiftSession" SET "status"='CLOSED',"closedAt"=${new Date("2020-01-20T07:00:00+02:00")} WHERE "id"='2020-01-19-2'`;
  const updates=await Promise.all([request(base,"PUT",{expectedVersion:1,configuration:config}),request(base,"PUT",{expectedVersion:1,configuration:config})]);assert.deepEqual(updates.map(r=>r.status).sort(),[200,409]);assert.equal((await request()).body.settings.version,2);assert.equal((await request(base+"/preview","POST",{day:"2020-01-15",expectedVersion:1})).body.code,"REPORT_SETTINGS_CHANGED");previewVersion=2;
  for(const actor of ["owner","missing"]){assert.equal((await request(base,"GET",undefined,actor)).status,403);assert.equal((await request(base,"PUT",{expectedVersion:2,configuration:config},actor)).status,403);assert.equal((await request(base+"/preview","POST",{day:"2020-01-15",expectedVersion:previewVersion},actor)).status,403)}
  assert.equal((await request(base,"GET",undefined,null)).status,401);
  for(const path of [base.replace("/companies/c/","/companies/x/"),base.replace("/stores/s/","/stores/foreign/"),base.replace("/stores/s/","/stores/inactive/")])assert.equal((await request(path)).status,404);
  const control=await request(base.replace("/stores/s/","/stores/control/"));assert.equal(control.body.settings,null);assert.equal(control.body.cashRule.mode,"DIFFERENCE_ONLY");
  const bad={expectedVersion:2,configuration:{...config,terminals:[{terminalPos:"MAIN",requiredSlots:[1]}]}};assert.equal((await request(base,"PUT",bad)).status,400);
  assert.deepEqual(await snapshot(),before);
  await db.$executeRaw`UPDATE "CashControlStoreRule" SET "mode"='DIFFERENCE_ONLY',"carryOverEnabled"=false,"posEftposEnabled"=false WHERE "storeId"='s'`;
  const changed=await request(base+"/preview","POST",{day:"2020-01-15",expectedVersion:previewVersion});assert.equal(changed.body.groups,null);assert.ok(changed.body.holds.some(h=>h.code==="CASH_RULE_CHANGED"));assert.equal((await request(base,"PUT",{expectedVersion:2,configuration:config})).body.code,"CASH_RULE_CHANGED");
  const refreshed=await request(),confirmed={...config,cashRule:refreshed.body.cashRule};assert.equal((await request(base,"PUT",{expectedVersion:2,configuration:confirmed})).body.settings.version,3);previewVersion=3;assert.equal((await request(base+"/preview","POST",{day:"2020-01-15",expectedVersion:previewVersion})).body.ready,true);
  await db.$executeRaw`UPDATE "CashShiftSession" SET "status"='OPEN',"closedAt"=NULL WHERE "id"='night'`;
  const open=await request(base+"/preview","POST",{day:"2020-01-15",expectedVersion:previewVersion});assert.equal(open.body.ready,false);assert.equal(open.body.sourceReadiness,"HOLD");assert.equal(open.body.financialFinality,"PROVISIONAL");assert.equal(open.body.financialReconciliationComplete,false);assert.deepEqual(open.body.financialLimitations,preview.body.financialLimitations);assert.equal(open.body.groups,null);assert.ok(open.body.holds.some(h=>h.code==="THIRD_SHIFT_OPEN"));
  const count=await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "AutomaticReportSettings"`;assert.equal(count[0].count,1);
  const platform=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");assert.ok(platform.indexOf('router.use(auth)')<platform.indexOf('createAutomaticReportSettingsRouter(prisma)'));assert.ok(platform.indexOf('Απαιτείται πρόσβαση Platform Super Admin.')<platform.indexOf('createAutomaticReportSettingsRouter(prisma)'));
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
