import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const app=await readFile(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");
const analytics=await readFile(new URL("../../client/src/components/platform/SuperAdminChecksAnalytics.jsx",import.meta.url),"utf8");

test("Super Admin analytics opens as a dedicated filtered review center",()=>{
  assert.match(app,/import SuperAdminChecksAnalytics from "\.\/SuperAdminChecksAnalytics\.jsx"/);
  assert.match(app,/onClick=\{\(\)=>setAnalyticsResult\(\{modal:true\}\)\}/);
  assert.match(app,/analyticsResult\?\.modal&&<SuperAdminChecksAnalytics/);
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
