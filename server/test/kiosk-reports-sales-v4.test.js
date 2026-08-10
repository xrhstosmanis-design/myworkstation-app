import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {spawnSync} from "node:child_process";

const server=fs.readFileSync(new URL("../src/routes/kiosk-reports-sales-v4.js",import.meta.url),"utf8");
const clientPath=new URL("../../client/src/components/commerce/installKioskReportsSalesV4.js",import.meta.url);
const client=fs.readFileSync(clientPath,"utf8");
const index=fs.readFileSync(new URL("../src/index.js",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../../client/index.html",import.meta.url),"utf8");

test("sales report server and client parse",()=>{
  assert.equal(spawnSync(process.execPath,["--check",new URL("../src/routes/kiosk-reports-sales-v4.js",import.meta.url).pathname],{encoding:"utf8"}).status,0);
  assert.equal(spawnSync(process.execPath,["--check",clientPath.pathname],{encoding:"utf8"}).status,0);
});

test("sales statistics are tenant store and management scoped",()=>{
  assert.match(server,/SUPER_ADMIN/);assert.match(server,/OWNER/);assert.match(server,/ADMIN/);assert.match(server,/MANAGER/);
  assert.match(server,/sa\."companyId"=\$\{companyId\}/);
  assert.match(server,/sa\."storeId"=\$\{storeId\}/);
  assert.match(server,/sa\."status"='COMPLETED'/);
});

test("historical cost uses the last approved purchase available at sale time",()=>{
  assert.match(server,/pd\."status"='APPROVED'/);
  assert.match(server,/pd\."documentDate"<=sa\."occurredAt"/);
  assert.match(server,/ORDER BY pd\."documentDate" DESC,pd\."createdAt" DESC LIMIT 1/);
  assert.match(server,/profit=netSales-costValue/);
});

test("sales report exposes net VAT cost profit margin and stock",()=>{
  for(const token of ["grossSales","netSales","vatValue","costValue","profit","margin","currentStock","averageGrossPrice","lastSaleAt","supplierName"])assert.match(server,new RegExp(token));
  assert.match(client,/Στατιστικά πωλήσεων/);assert.match(client,/Καθαρή αξία/);assert.match(client,/Κέρδος/);assert.match(client,/Margin/);
});

test("sales drilldown is lazy and does not add MutationObserver",()=>{
  assert.match(client,/data-sales-product/);
  assert.match(client,/sales-analysis\/\$\{encodeURIComponent/);
  assert.match(client,/paymentMethods/);
  assert.doesNotMatch(client,/MutationObserver/);
});

test("sales report extension is mounted before generic fallback",()=>{
  assert.match(index,/kioskReportsSalesV4Routes/);
  assert.ok(index.indexOf("kioskReportsSalesV4Routes")<index.lastIndexOf("kioskReportsRoutes"));
  assert.match(html,/report-sales-bootstrap\.js/);
});
