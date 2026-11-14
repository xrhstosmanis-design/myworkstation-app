import {readCashExpenseEvidence,cashExpenseFindings} from "../src/services/cash-expense-evidence.js";
import {readCashReviewState,confirmedExplanationBalance} from "../src/services/cash-review-balance.js";
import {partitionCashAuditEvents} from "../src/services/cash-audit-association.js";
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {cashReportPeriod,cashReportRowDay} from "../../client/src/lib/cash-report-period.js";
import {resolveCashReportPeriod,mapCashReportRows} from "../src/services/cash-report-period.js";
import {businessPictureCalendarRange} from "../src/business-picture-dates.js";
import {z} from "zod";

test("cash periods use Monday–Sunday and complete calendar months across year/leap boundaries",()=>{
  assert.deepEqual([cashReportPeriod({period:"WEEK",date:"2026-01-01"}).from,cashReportPeriod({period:"WEEK",date:"2026-01-01"}).to],["2025-12-29","2026-01-04"]);
  assert.equal(cashReportPeriod({period:"MONTH",date:"2024-02-15"}).to,"2024-02-29");
  assert.equal(cashReportPeriod({period:"MONTH",date:"2026-02-15"}).to,"2026-02-28");
});
test("legacy daily callers and explicit ranges resolve to the same period in both views",()=>{
  assert.equal(resolveCashReportPeriod({},"2026-10-16").from,"2026-10-16");
  assert.deepEqual(resolveCashReportPeriod({from:"2026-10-12",to:"2026-10-16"},"2026-10-16"),{...cashReportPeriod({period:"CUSTOM",from:"2026-10-12",to:"2026-10-16"}),sessionId:null});
  assert.equal(resolveCashReportPeriod({period:"SHIFT",date:"2026-10-16",sessionId:"chosen"}).sessionId,"chosen");
  assert.throws(()=>resolveCashReportPeriod({period:"SHIFT",date:"2026-10-16"}),/βάρδια/);
});
test("invalid dates, inverted or overlong intervals never become empty or partial reports",()=>{
  for(const date of ["2026-02-29","2026-04-31","2026-13-01","1999-12-31","2101-01-01",""])assert.throws(()=>cashReportPeriod({date}));
  assert.throws(()=>resolveCashReportPeriod({period:"CUSTOM",from:"2026-10-16",to:"2026-10-12"}),e=>e.status===400);
  assert.throws(()=>cashReportPeriod({period:"CUSTOM",from:"2025-01-01",to:"2026-01-02"}),/366/);
});
test("Athens row dates and DST periods keep local dates rather than fixed UTC days",()=>{
  assert.equal(cashReportRowDay("2026-10-15T22:30:00Z"),"2026-10-16");
  for(const [date,hours] of [["2026-03-29",23],["2026-10-25",25]]){
    const period=cashReportPeriod({date}),range=businessPictureCalendarRange(period.from,period.to);
    assert.equal((+range.to-+range.from+1)/3600000,hours);
  }
});
test("actual platform investigation remains provisional even when legacy audit reads succeed",async()=>{
  const source=readFileSync(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
  const body=source.slice(source.indexOf("function platformCashAuditAmount("),source.indexOf("function companyView("));
  const investigate=new Function("prisma","partitionCashAuditEvents","readCashReviewState","readCashExpenseEvidence","cashExpenseFindings",body+";return platformCashInvestigation;")({$queryRaw:async()=>[]},partitionCashAuditEvents,readCashReviewState,readCashExpenseEvidence,cashExpenseFindings);
  const row={companyId:"c",storeId:"s",sessionId:"shift",openedAt:new Date("2026-10-15T04:00Z"),closedAt:new Date("2026-10-15T12:00Z"),variance:0};
  const result=await investigate(row,{operator:true,actions:true,safety:true,purchaseDocuments:true});
  assert.equal(result.completed,false);
  assert.deepEqual(result.pendingChecks,["SALE_LINE_DUPLICATES","CROSS_PERIOD_SHIFT_CHAIN","OWNER_TRANSFER_RECIPIENT"]);
  const missing=await investigate(row,{});
  assert(missing.pendingChecks.includes("POS_ACTION_EVENTS"));
  const unavailable=new Function("prisma","partitionCashAuditEvents","readCashReviewState","readCashExpenseEvidence","cashExpenseFindings",body+";return platformCashInvestigation;")({$queryRaw:async()=>{throw Error("isolated unavailable source")}},partitionCashAuditEvents,readCashReviewState,readCashExpenseEvidence,cashExpenseFindings);
  const failed=await unavailable(row,{operator:true,actions:true,safety:true,purchaseDocuments:true});
  assert.equal(failed.completed,false);assert.equal(failed.findings.filter(x=>x.code==="AUDIT_SOURCE_UNAVAILABLE").length,4);
});

test("registered platform report binds the selected interval and refuses partial 501-shift totals",async()=>{
  const source=readFileSync(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
  const route=source.slice(source.indexOf('router.get("/cash-control/daily"'),source.indexOf('router.get("/cash-control/shortages"'));
  let handler,overflow=false;const calls=[];
  const db={$queryRaw:async(strings,...values)=>{
    const sql=strings.join("?");calls.push({sql,values});
    return sql.includes('FROM "CashShiftSession"')&&overflow?Array.from({length:501},()=>({})):[];
  }};
  new Function("router","prisma","z","ensureCashControlSchema","resolveCashReportPeriod","mapCashReportRows",route)({get:(_path,fn)=>{handler=fn}},db,z,async()=>{},resolveCashReportPeriod,mapCashReportRows);
  const invoke=async query=>{let status=200,body,error;await handler({query},{status(value){status=value;return this},json(value){body=value}},err=>{error=err});if(error)throw error;return{status,body};};
  let result=await invoke({period:"WEEK",date:"2026-10-16",storeId:"STORE-A"});
  assert.equal(result.body.from,"2026-10-12");assert.equal(result.body.to,"2026-10-18");
  assert(calls[0].values.includes("2026-10-12"));assert(calls[0].values.includes("2026-10-18"));assert(calls[0].values.includes("STORE-A"));
  assert.match(calls[0].sql,/date_trunc\('minute'/); // 23:59:59 belongs to the displayed last minute.
  overflow=true;result=await invoke({period:"MONTH",date:"2026-10-16"});
  assert.equal(result.status,422);assert.match(result.body.error,/μερικά σύνολα/);assert.equal(result.body.totals,undefined);
  const count=calls.length;await assert.rejects(invoke({period:"CUSTOM",from:"2026-10-16",to:"2026-10-12"}));assert.equal(calls.length,count);
});

test("long cash intervals inspect at most two shifts concurrently while retaining row order",async()=>{
  let active=0,maximum=0;
  const rows=Array.from({length:100},(_,id)=>id);
  const result=await mapCashReportRows(rows,async row=>{active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setImmediate(resolve));active--;return row*2;});
  assert.equal(maximum,2);assert.deepEqual(result,rows.map(row=>row*2));
  assert.deepEqual(await mapCashReportRows([],()=>{throw Error("must not execute")}),[]);
});

const isolatedCashDatabase=(()=>{
  try{
    const url=new URL(process.env.DATABASE_URL);
    return process.env.NODE_ENV==="test"&&["localhost","127.0.0.1","postgres"].includes(url.hostname)&&/test/i.test(url.pathname);
  }catch{return false}
})();

test("PostgreSQL shortage export assigns the overnight shift to its Athens opening day",{skip:!isolatedCashDatabase},async()=>{
  const {PrismaClient}=await import("@prisma/client");
  const {randomUUID}=await import("node:crypto");
  const schema="cash_night_"+randomUUID().replaceAll("-","");
  const url=new URL(process.env.DATABASE_URL);
  url.searchParams.set("schema",schema);
  const admin=new PrismaClient();
  const db=new PrismaClient({datasourceUrl:url.toString()});
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await db.$executeRawUnsafe('CREATE TABLE "Company" ("id" text PRIMARY KEY,"name" text)');
    await db.$executeRawUnsafe('CREATE TABLE "Store" ("id" text PRIMARY KEY,"name" text,"companyId" text)');
    await db.$executeRawUnsafe('CREATE TABLE "CashShiftSession" ("id" text,"storeId" text,"companyId" text,"status" text,"openedAt" timestamptz,"closedAt" timestamptz,"shiftLabel" text,"terminalPos" text,"openedByName" text,"closedByName" text,"variance" numeric,"cardVariance" numeric)');
    await db.$executeRaw`INSERT INTO "Company" VALUES ('c','Company')`;
    await db.$executeRaw`INSERT INTO "Store" VALUES ('a','A','c'),('b','B','c'),('other','Other','c')`;
    await db.$executeRaw`INSERT INTO "CashShiftSession" ("id","storeId","companyId","status","openedAt","closedAt","variance","cardVariance")
      VALUES ('night','a','c','CLOSED','2026-11-13 22:00+02','2026-11-14 06:00+02',-19,0),
        ('morning','b','c','CLOSED','2026-11-14 06:00+02','2026-11-14 14:00+02',-4,0),
        ('excluded','other','c','CLOSED','2026-11-13 22:00+02','2026-11-14 06:00+02',-8,0)`;
    const source=readFileSync(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
    const start=source.indexOf('router.get("/cash-control/shortages"');
    const end=source.indexOf('}catch(error){next(error)}});',start);
    const route=source.slice(start,end+'}catch(error){next(error)}});'.length);
    let handler;
    new Function("router","prisma","z",route)({get:(_path,fn)=>{handler=fn}},db,z);
    const search=async(date,dateBasis="SHIFT_OPENED_CALENDAR_DAY")=>{
      let body,error;
      await handler({query:{from:date,to:date,dateBasis,storeIds:"a,b"}},{json(value){body=value}},err=>{error=err});
      if(error)throw error;
      return body;
    };
    const opening=await search("2026-11-13");
    assert.deepEqual(opening.rows.map(row=>[row.sessionId,row.date,row.closedAt.toISOString(),row.shortage]),[
      ["night","2026-11-13","2026-11-14T04:00:00.000Z",19],
    ]);
    assert.deepEqual((await search("2026-11-14")).rows.map(row=>row.sessionId),["morning"]);
    assert.deepEqual((await search("2026-11-14","SHIFT_CLOSED_CALENDAR_DAY")).rows.map(row=>row.sessionId),["night","morning"]);
  }finally{
    await db.$disconnect();
    try{await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)}
    finally{await admin.$disconnect()}
  }
});
