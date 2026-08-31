import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/platform-super-admin-analytics-details.js",import.meta.url),"utf8");
const server=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
const analytics=await readFile(new URL("../../client/src/components/platform/SuperAdminChecksAnalytics.jsx",import.meta.url),"utf8");

test("detailed analytics route overrides the legacy aggregate endpoint",()=>{
  assert.match(server,/import platformSuperAdminAnalyticsDetailsRoutes from "\.\/routes\/platform-super-admin-analytics-details\.js"/);
  const detailed=server.indexOf('app.use("/api/platform",platformSuperAdminAnalyticsDetailsRoutes)');
  const legacy=server.indexOf('app.use("/api/platform",platformAdminRoutes)');
  assert.ok(detailed>=0&&legacy>=0&&detailed<legacy,"The detailed route must be mounted before the legacy platform router.");
  assert.match(route,/router\.post\("\/super-admin-analytics\/execute"/);
});

test("each review finding identifies the exact shift event and its context",()=>{
  for(const field of ["eventCode","eventLabel","eventSource","occurredAt","sessionId","referenceId","companyName","storeName","shiftLabel","terminalPos","operatorName","openedAt","closedAt","cashVariance","cardVariance"]){
    assert.match(route,new RegExp(field));
  }
  assert.match(route,/eventSource:"Κλείσιμο βάρδιας"/);
  assert.match(route,/operatorName:session\.closedByName\|\|session\.openedByName\|\|null/);
  assert.match(route,/s\."status"='CLOSED'/);
  assert.match(route,/ORDER BY COALESCE\(s\."closedAt",s\."openedAt"\) DESC/);
});

test("analytics UI shows event date time store POS shift operator and reference",()=>{
  for(const label of ["Συμβάντα που χρειάζονται έλεγχο","Ημερομηνία / ώρα","Εταιρεία","Κατάστημα","POS / Τερματικό","Βάρδια","Χειριστής κλεισίματος","Άνοιγμα βάρδιας","Κλείσιμο βάρδιας","Αναφορά βάρδιας","Κωδικός συμβάντος"]){
    assert.match(analytics,new RegExp(label));
  }
  assert.match(analytics,/timeZone:"Europe\/Athens"/);
  assert.match(analytics,/finding\.occurredAt\|\|finding\.closedAt\|\|finding\.openedAt/);
  assert.match(analytics,/finding\.operatorName\|\|finding\.closedByName\|\|finding\.openedByName/);
});

test("analytics labels distinguish company store terminal and shift even when names match",()=>{
  assert.match(analytics,/Εταιρεία: \$\{selectedStore\.companyName\} · Κατάστημα: \$\{selectedStore\.name\}/);
  assert.match(analytics,/<b>Εταιρεία<\/b>/);
  assert.match(analytics,/<b>Κατάστημα<\/b>/);
  assert.match(analytics,/<b>POS \/ Τερματικό<\/b>/);
  assert.match(analytics,/<b>Βάρδια<\/b>/);
  assert.doesNotMatch(analytics,/<b>Εταιρεία \/ Κατάστημα<\/b>/);
  assert.doesNotMatch(analytics,/<b>POS \/ Βάρδια<\/b>/);
});

test("finding detail remains filtered bounded audited and read-only",()=>{
  for(const field of ["companyId","storeId","from","to"])assert.match(route,new RegExp(field));
  assert.match(route,/const findingLimit=500/);
  assert.match(route,/event:"SUPER_ADMIN_ANALYTICS_EXECUTED"/);
  assert.match(route,/readOnly:true/);
  assert.match(route,/automaticEmployeeAccusation:false/);
  assert.match(analytics,/Δεν αποτελεί αυτόματη απόδοση αιτίας ή ευθύνης/);
});
