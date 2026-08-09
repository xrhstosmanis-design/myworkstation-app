import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const route=await readFile(new URL("../src/routes/supplier-global-reports.js",import.meta.url),"utf8");
const normalized=await readFile(new URL("../src/routes/supplier-control-normalized.js",import.meta.url),"utf8");
const client=await readFile(new URL("../../client/src/components/commerce/installSupplierGlobalReports.js",import.meta.url),"utf8");
const entry=await readFile(new URL("../../client/src/entry.jsx",import.meta.url),"utf8");

const check=file=>{
  const path=fileURLToPath(new URL(file,import.meta.url));
  const result=spawnSync(process.execPath,["--check",path],{encoding:"utf8"});
  assert.equal(result.status,0,`${file}\n${result.stderr||result.stdout}`);
};

test("global supplier report server and client modules pass Node syntax check",()=>{
  check("../src/routes/supplier-global-reports.js");
  check("../../client/src/components/commerce/installSupplierGlobalReports.js");
});

test("global supplier reports support invoices payments purchases sales and optional supplier filter",()=>{
  for(const path of ["/reports/invoices","/reports/payments","/reports/purchases","/reports/sales","/reports/sales/:supplierId/items"])assert.match(route,new RegExp(path.replace(/[/:]/g,"\\$&")));
  assert.match(route,/supplierId:q\.supplierId\|\|null/);
  assert.match(client,/Όλοι οι προμηθευτές/);
  for(const tab of ["invoices","payments","purchases","sales"])assert.match(client,new RegExp(tab));
});

test("supplier sales mapping prefers current SupplierProductLink and falls back to latest approved purchase",()=>{
  assert.match(route,/COALESCE\(link\."supplierId",lp\."supplierId"\)/);
  assert.match(route,/ORDER BY l\."productId",d\."documentDate" DESC,d\."createdAt" DESC/);
  assert.match(route,/spl\."active"=true/);
});

test("supplier sales costs are supplier-specific",()=>{
  assert.match(route,/SELECT l\."productId",d\."supplierId"/);
  assert.match(route,/GROUP BY l\."productId",d\."supplierId"/);
  assert.match(route,/pc\."supplierId"=s\."id"/);
  assert.match(route,/d\."supplierId"=\$\{supplierId\}/);
});

test("current stock is aggregated once per product and cannot multiply by sale lines",()=>{
  assert.match(route,/LEFT JOIN LATERAL \(SELECT COALESCE\(SUM\(sp\."currentStock"\),0\) AS "currentStock" FROM "StoreProduct" sp WHERE sp\."productId"=p\."id"\) stock ON true/);
  assert.doesNotMatch(route,/SUM\(stock\."currentStock"\)/);
  assert.match(route,/stock\."currentStock"/);
});

test("sales supplier rows use lazy plus expansion instead of loading all item details",()=>{
  assert.match(client,/data-sgr-expand/);
  assert.match(client,/reports\/sales\/\$\{encodeURIComponent\(id\)\}\/items/);
  assert.match(client,/state\.expanded===id/);
  assert.match(client,/Ανάλυση ειδών προμηθευτή/);
});

test("global report intercept and touch keyboard integration remain additive",()=>{
  assert.match(client,/addEventListener\("click",intercept,true\)/);
  assert.match(entry,/installSupplierGlobalReports\(\)/);
  assert.match(entry,/installTouchKeyboard\(\)/);
  assert.match(entry,/purchaseOrdersHostObserver/);
  assert.match(entry,/window\.MutationObserver=class\{observe\(\)\{\}disconnect\(\)\{\}\}/);
});

test("global report routes mount before supplier-specific generic routes",()=>{
  assert.match(normalized,/supplierGlobalReportRoutes/);
  assert.ok(normalized.indexOf("router.use(supplierGlobalReportRoutes)")<normalized.indexOf("router.use(supplierControlRoutes)"));
});
