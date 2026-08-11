import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {nextPrice} from "../src/routes/owner-price-bulk-preview.js";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=file=>fs.readFileSync(path.join(repo,file),"utf8");
const routePath="server/src/routes/owner-price-bulk-preview.js";
const clientPath="client/src/components/commerce/installBulkPricePreview.js";
const cssPath="client/src/components/commerce/bulk-price-preview.css";
const route=read(routePath),client=read(clientPath),css=read(cssPath),index=read("server/src/index.js"),entry=read("client/src/entry.jsx");

test("bulk price preview server and client parse",()=>{
  execFileSync(process.execPath,["--check",path.join(repo,routePath)]);
  execFileSync(process.execPath,["--check",path.join(repo,clientPath)]);
});

test("bulk price arithmetic is deterministic and rounded to cents",()=>{
  assert.equal(nextPrice(10,"SET",7.345),7.35);
  assert.equal(nextPrice(10,"INCREASE_PERCENT",12.5),11.25);
  assert.equal(nextPrice(10,"DECREASE_PERCENT",12.5),8.75);
});

test("bulk selection is bounded and tenant scoped",()=>{
  assert.match(route,/MAX_PRODUCTS=500/);
  assert.match(route,/MAX_STORES=200/);
  assert.match(route,/MAX_COMBINATIONS=10000/);
  assert.match(route,/WHERE \"companyId\"=\$\{companyId\} AND \"active\"=true/);
  assert.match(route,/companyId,active:true/);
});

test("preview reads real StoreProduct price and never writes",()=>{
  assert.match(route,/SELECT \"storeId\",\"productId\",\"salePrice\",\"active\" FROM \"StoreProduct\"/);
  assert.match(route,/mapping\.salePrice\?\?product\.salePrice/);
  const previewHandler=route.slice(route.indexOf('router.post("/prices/bulk/preview"'),route.indexOf('router.post("/prices/bulk/commit"'));
  assert.doesNotMatch(previewHandler,/INSERT INTO|UPDATE \"|DELETE FROM/);
});

test("missing store-product mappings are visible and never silently activated",()=>{
  assert.match(route,/status:"NOT_IN_STORE"/);
  assert.match(route,/preview\.counts\.skipped>0&&!body\.acceptSkipped/);
  assert.doesNotMatch(route,/INSERT INTO \"StoreProduct\"/);
  assert.doesNotMatch(route,/active\"=true.*StoreProduct/i);
});

test("commit is explicit stale-safe serialized and locks current store prices",()=>{
  assert.match(route,/confirm:z\.literal\(true\)/);
  assert.match(route,/previewHash:z\.string\(\)\.length\(64\)/);
  assert.match(route,/pg_advisory_xact_lock/);
  assert.match(route,/FOR UPDATE OF sp/);
  assert.match(route,/lockedHash!==body\.previewHash/);
  assert.match(route,/isolationLevel:"Serializable"/);
  assert.match(route,/BULK_PREVIEW_STALE/);
});

test("successful bulk commit writes row history and append-only batch audit",()=>{
  assert.match(route,/CREATE TABLE IF NOT EXISTS \"BulkPriceBatchAudit\"/);
  assert.match(route,/INSERT INTO \"ProductPriceHistory\"/);
  assert.match(route,/changeType\",\"createdByUserId\"/);
  assert.match(route,/'BULK_STORE_PRICE'/);
  assert.match(route,/INSERT INTO \"BulkPriceBatchAudit\"/);
});

test("legacy direct bulk endpoint cannot bypass preview",()=>{
  assert.match(route,/router\.post\("\/prices\/bulk",\(req,res\)=>res\.status\(409\)/);
  assert.match(route,/BULK_PREVIEW_REQUIRED/);
  const previewMount=index.indexOf('app.use("/api/owner-products",auth,requireOwnerProductAccess,ownerPriceBulkPreviewRoutes)');
  const oldCapture=index.indexOf('app.use("/api/owner-products",auth,requireOwnerProductAccess,productAuditCapture)');
  const oldRoutes=index.indexOf('app.use("/api/owner-products",auth,requireOwnerProductAccess,ownerProductRoutes)');
  assert.ok(previewMount>=0&&oldCapture>previewMount&&oldRoutes>previewMount);
});

test("existing bulk form is intercepted into Preview then Final application",()=>{
  assert.match(client,/Μαζική αλλαγή τιμών/);
  assert.match(client,/prices\/bulk\/preview/);
  assert.match(client,/prices\/bulk\/commit/);
  assert.match(client,/Προεπισκόπηση αλλαγών/);
  assert.match(client,/Τελική εφαρμογή/);
  assert.match(client,/data-bpp-accept/);
  assert.match(client,/event\.preventDefault\(\);event\.stopImmediatePropagation\(\)/);
});

test("bulk preview UI is bounded observer-free and uses MyWorkStation palette",()=>{
  assert.match(route,/MAX_SAMPLE_ROWS=500/);
  assert.doesNotMatch(client,/MutationObserver/);
  assert.match(entry,/installBulkPricePreview\(\)/);
  assert.equal((entry.match(/const purchaseOrdersHostObserver=new MutationObserver/g)||[]).length,1);
  assert.match(css,/#0f2f4a/i);
  assert.match(css,/#0f8f83/i);
});
