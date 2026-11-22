import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const app=await readFile(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");
const analytics=await readFile(new URL("../../client/src/components/platform/SuperAdminChecksAnalytics.jsx",import.meta.url),"utf8");

test("Super Admin analytics opens as a dedicated filtered review page",()=>{
  assert.match(app,/import SuperAdminChecksAnalytics from "\.\/SuperAdminChecksAnalytics\.jsx"/);
  assert.match(app,/onClick=\{\(\)=>setAnalyticsResult\(\{page:true\}\)\}/);
  assert.match(app,/analyticsResult\?\.page&&<SuperAdminChecksAnalytics embedded/);
  assert.match(app,/onClose=\{\(\)=>setAnalyticsResult\(null\)\}/);
  assert.match(app,/\{\(deviceOperationsManager\|\|terminalManager\)&&<DeviceOperationsCenter[^]*?\/>\}/);
  for(const label of ["Ιδιοκτήτης / εταιρεία","Κατάστημα","Από","Έως"])assert.match(analytics,new RegExp(label));
});

test("analytics sends owner, store and date filters to the real read-only endpoint",()=>{
  assert.match(analytics,/request\("\/api\/platform\/super-admin-analytics\/execute",\{method:"POST",body:JSON\.stringify\(payload\)\}\)/);
  assert.match(analytics,/Object\.entries\(filters\)\.filter/);
  assert.match(analytics,/filters\.from&&filters\.to&&filters\.from>filters\.to/);
  assert.match(analytics,/setFilters\(current=>\(\{\.\.\.current,\.\.\.patch\}\)\)/);
});

test("bank summary follows owner and store while dates remain shift-only",()=>{
  assert.match(analytics,/companyId:filters\.companyId,storeId:filters\.storeId/);
  assert.match(analytics,/\/api\/transactions\/bank-ledger\/summary\$\{bankSuffix\}/);
  assert.match(analytics,/Οι ημερομηνίες εφαρμόζονται στις βάρδιες/);
  assert.match(analytics,/Το Ταμείο Τράπεζας είναι τρέχον λογιστικό υπόλοιπο/);
});

test("backend analytics remains filtered, audited and non-mutating",()=>{
  assert.match(route,/router\.post\("\/super-admin-analytics\/execute"/);
  assert.match(route,/await ensureCashControlSchema\(\)/);
  for(const field of ["companyId","storeId"])assert.match(route,new RegExp(`${field}:z\\.string\\(\\)\\.trim\\(\\)\\.optional\\(\\)`));
  for(const field of ["from","to"])assert.ok(route.includes(`${field}:z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional()`),field);
  assert.match(route,/s\."companyId"=\$\{body\.companyId\|\|null\}/);
  assert.match(route,/s\."storeId"=\$\{body\.storeId\|\|null\}/);
  assert.match(route,/\(s\."closedAt" AT TIME ZONE 'Europe\/Athens'\)::date>=\$\{body\.from\|\|null\}::date/);
  assert.match(route,/\(s\."closedAt" AT TIME ZONE 'Europe\/Athens'\)::date<=\$\{body\.to\|\|null\}::date/);
  assert.match(route,/event:"SUPER_ADMIN_AUTOMATIC_PROTECTION_CHECK_EXECUTED"/);
  assert.match(route,/readOnly:true,automaticEmployeeAccusation:false/);
  assert.match(analytics,/Μόνο για ανάγνωση/);
  assert.match(analytics,/δεν αποδίδει αυτόματα ευθύνη σε εργαζόμενο/);
});

test("legacy analytics keeps uncounted variances unavailable without changing measured zero",async()=>{
  const {z}=await import("zod");
  const start=route.indexOf('router.post("/super-admin-analytics/execute"');
  const end=route.indexOf('router.post("/super-admin-analytics/sessions/',start);
  const counted={sessionId:"zero",storeId:"s",companyId:"c",variance:0,cardVariance:0};
  const pending={...counted,sessionId:"waiting",closeReconciliationStatus:"AWAITING_COUNT",variance:null,cardVariance:null};
  const queryCalls=[],investigated=[];
  let sessions=[counted,pending];
  const prisma={
    $queryRaw:async strings=>{
      const sql=strings.join("?");
      queryCalls.push(sql);
      return sql.includes('FROM "CashShiftSession"')?sessions:[{}];
    },
    authAudit:{create:async()=>{}}
  };
  let handler;
  const router={post:(_name,fn)=>{handler=fn}};
  new Function("router","ensureCashControlSchema","z","prisma","platformCashStoreRule","platformCashInvestigation","automaticConclusionLabels",route.slice(start,end))(
    router,async()=>{},z,prisma,()=>({posEftposEnabled:true}),
    async row=>{investigated.push(row);return {conclusion:"AGREEMENT"}},{});
  const execute=()=>new Promise((resolve,reject)=>{
    handler({body:{companyId:"c",storeId:"s"},user:{id:"admin"},headers:{}},{json:resolve},reject);
  });
  const mixed=await execute();
  assert.ok(queryCalls[0].includes('AS "closeReconciliationStatus"'));
  assert.deepEqual(mixed.rows,[{companyId:"c",storeId:"s",shifts:2,awaitingCount:1,cashVariance:null,cardVariance:null}]);
  assert.equal(mixed.awaitingCount,1);
  assert.equal(mixed.automaticConclusion.status,"AWAITING_COUNT");
  assert.equal(mixed.status,"Εκκρεμεί καταμέτρηση");
  assert.match(mixed.automaticConclusion.summary,/Εκκρεμεί καταμέτρηση για 1 από τις 2 βάρδιες/);
  assert.deepEqual(mixed.automaticConclusion.conclusionCounts,{AGREEMENT:1,AWAITING_COUNT:1});
  assert.deepEqual(mixed.findings,[]);
  assert.deepEqual(investigated.map(row=>row.sessionId),["zero"]);
  sessions=[counted];
  const measured=await execute();
  assert.equal(measured.awaitingCount,0);
  assert.equal(measured.automaticConclusion.status,"AGREEMENT");
  assert.equal(measured.rows[0].cashVariance,0);
  assert.equal(measured.rows[0].cardVariance,0);
  sessions=[counted,{...counted,sessionId:"cash-only",closeReconciliationStatus:"COUNTED",cardVariance:null}];
  const partial=await execute();
  assert.equal(partial.rows[0].cashVariance,0);
  assert.equal(partial.rows[0].cardVariance,null);
  assert.equal(investigated.at(-1).cardVariance,null);
});

test("legacy analytics confirmation rejects an uncounted shift before a review is written",async()=>{
  const {z}=await import("zod");
  const start=route.indexOf('router.post("/super-admin-analytics/sessions/:sessionId/confirmation"');
  const end=route.indexOf("const platformHistoryTurns",start);
  let handler;
  const router={post:(_name,fn)=>{handler=fn}};
  const calls=[];
  const prisma={
    $queryRaw:async strings=>{
      calls.push(strings.join("?"));
      return [{id:"waiting",companyId:"c",storeId:"s",closeReconciliationStatus:"AWAITING_COUNT"}];
    }
  };
  new Function("router","ensureCashControlSchema","z","prisma",route.slice(start,end))(router,async()=>{},z,prisma);
  let status;
  const body=await new Promise((resolve,reject)=>{
    const res={status:code=>{status=code;return res},json:resolve};
    handler({body:{companyId:"c",storeId:"s"},params:{sessionId:"waiting"}},res,reject);
  });
  assert.equal(status,409);
  assert.equal(body.code,"SHIFT_AWAITING_COUNT");
  assert.equal(calls.length,1);
  assert.ok(calls[0].includes('AS "closeReconciliationStatus"'));
});
