import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("stock analysis uses isolated lateral sales aggregation and store specific values",()=>{
  const route=read("src/routes/kiosk-reports-stock-v3.js");
  assert.match(route,/LEFT JOIN LATERAL/);
  assert.match(route,/SUM\(sl\."quantity"\)/);
  assert.match(route,/COALESCE\(sp\."salePrice",p\."salePrice",0\)/);
  assert.match(route,/d\."status"='APPROVED'/);
  assert.match(route,/d\."storeId"=sp\."storeId"/);
  assert.match(route,/totalPurchaseValue/);
  assert.match(route,/totalRetailValue/);
  assert.match(route,/totalSalesQuantity/);
});

test("stock analysis exposes lazy per item movement drilldown",()=>{
  const route=read("src/routes/kiosk-reports-stock-v3.js");
  const client=fs.readFileSync(new URL("../../client/src/components/commerce/installKioskReportsStockV3.js",import.meta.url),"utf8");
  assert.match(route,/stock-analysis\/:productId\/movements/);
  assert.match(client,/data-stock-detail/);
  assert.match(client,/\/movements\?/);
  assert.match(client,/addEventListener\("click"/);
  assert.doesNotMatch(client,/MutationObserver/);
});

test("stock report extension replaces the existing stock stats tab without a second report engine",()=>{
  const client=fs.readFileSync(new URL("../../client/src/components/commerce/installKioskReportsStockV3.js",import.meta.url),"utf8");
  assert.match(client,/dataset\.krTab==="stock-stats"/);
  assert.match(client,/Στατιστικά \/ Ανάλυση αποθήκης/);
  assert.match(client,/Αξία αγοράς/);
  assert.match(client,/Αξία λιανικής/);
  assert.match(client,/Margin/);
});

test("stock report route is mounted before generic reports and bootstrap is loaded",()=>{
  const index=read("src/index.js"),html=fs.readFileSync(new URL("../../client/index.html",import.meta.url),"utf8");
  assert.ok(index.indexOf("kioskReportsStockV3Routes")<index.indexOf("kioskReportsRoutes"));
  assert.match(html,/report-stock-bootstrap\.js/);
});
