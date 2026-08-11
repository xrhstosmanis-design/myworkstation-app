import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {canonicalRow,localDate,intervalsOverlap} from "../src/routes/price-catalog-import.js";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=file=>fs.readFileSync(path.join(repo,file),"utf8");
const routePath="server/src/routes/price-catalog-import.js";
const clientPath="client/src/components/commerce/installLeafletImport.js";
const cssPath="client/src/components/commerce/leaflet-import.css";
const route=read(routePath),client=read(clientPath),css=read(cssPath),index=read("server/src/index.js"),entry=read("client/src/entry.jsx");

test("leaflet import server and client parse",()=>{
  execFileSync(process.execPath,["--check",path.join(repo,routePath)]);
  execFileSync(process.execPath,["--check",path.join(repo,clientPath)]);
});

test("Greek and English spreadsheet headers normalize to canonical fields",()=>{
  const row=canonicalRow({rowNumber:2,raw:{BARCODE:"5201","Εσωτ. κωδικός":"SKU1","Περιγραφή":"ΝΕΡΟ","Νέα τιμή":0.5,"Έκπτωση (%)":20,"Ισχύει από":"11/08/2026","Ισχύει έως και":"12/08/2026","Πόντοι πελάτη":3}});
  assert.equal(row.barcode,"5201");assert.equal(row.sku,"SKU1");assert.equal(row.description,"ΝΕΡΟ");assert.equal(row.offerPrice,0.5);assert.equal(row.discountPercent,20);assert.equal(row.customerPoints,3);
});

test("Excel and string dates are interpreted as Athens wall-clock instants",()=>{
  assert.equal(localDate(new Date(Date.UTC(2026,7,11,10,30)),false).toISOString(),"2026-08-11T07:30:00.000Z");
  assert.equal(localDate("11/08/2026",true).toISOString(),"2026-08-11T20:59:59.000Z");
});

test("interval overlap is deterministic including open-ended offers",()=>{
  assert.equal(intervalsOverlap("2026-08-11T00:00:00Z","2026-08-12T00:00:00Z","2026-08-12T00:00:00Z","2026-08-13T00:00:00Z"),true);
  assert.equal(intervalsOverlap("2026-08-11T00:00:00Z","2026-08-11T12:00:00Z","2026-08-12T00:00:00Z",null),false);
});

test("product matching is tenant scoped and ordered Barcode then SKU then exact Description",()=>{
  assert.match(route,/WHERE p\."companyId"=\$\{companyId\} AND p\."active"=true/);
  const barcode=route.indexOf("if(barcode)"),sku=route.indexOf("if(sku)",barcode),name=route.indexOf("if(name)",sku);
  assert.ok(barcode>=0&&sku>barcode&&name>sku);
  assert.doesNotMatch(route,/INSERT INTO \"Product\"/);
  assert.match(route,/UNRESOLVED/);
});

test("preview is read-only and commit requires explicit confirmation",()=>{
  const preview=route.slice(route.indexOf('router.post("/promotions/import/preview"'),route.indexOf("const commitSchema"));
  assert.doesNotMatch(preview,/INSERT INTO|UPDATE \"|DELETE FROM/);
  assert.match(route,/confirm:z\.literal\(true\)/);
  assert.match(route,/acceptSkipped:z\.boolean/);
  assert.match(route,/SKIPPED_ROWS_CONFIRMATION_REQUIRED/);
  assert.match(route,/preview\.previewHash!==body\.previewHash/);
});

test("overlap protection is exact-store based and prevents duplicate active leaflet periods",()=>{
  assert.match(route,/JOIN \"PriceCatalogPromotionStore\" ps/);
  assert.match(route,/ps\."storeId"=ANY/);
  assert.match(route,/pr\."promotionType"='LEAFLET'/);
  assert.match(route,/pr\."active"=true/);
  assert.match(route,/intervalsOverlap/);
  assert.match(route,/row\.status="OVERLAP"/);
});

test("successful batch commit writes real promotions store targets and append-only batch audit",()=>{
  assert.match(route,/INSERT INTO \"PriceCatalogPromotion\"/);
  assert.match(route,/INSERT INTO \"PriceCatalogPromotionStore\"/);
  assert.match(route,/CREATE TABLE IF NOT EXISTS \"PriceCatalogPromotionImportAudit\"/);
  assert.match(route,/INSERT INTO \"PriceCatalogPromotionImportAudit\"/);
  assert.match(route,/createdByUserId/);
});

test("leaflet UI exposes import button preview statuses and bounded rendering",()=>{
  assert.match(client,/Εισαγωγή από αρχείο/);
  assert.match(client,/promotions\/import\/preview/);
  assert.match(client,/promotions\/import\/commit/);
  assert.match(client,/READY/);assert.match(client,/UNRESOLVED/);assert.match(client,/INVALID/);assert.match(client,/OVERLAP/);
  assert.match(client,/slice\(0,300\)/);
  assert.match(client,/Αποδέχομαι ότι/);
});

test("leaflet import reuses existing host observer and MyWorkStation palette",()=>{
  assert.doesNotMatch(client,/new MutationObserver|MutationObserver\(/);
  assert.match(entry,/installLeafletImportSafely/);
  assert.equal((entry.match(/const purchaseOrdersHostObserver=new MutationObserver/g)||[]).length,1);
  assert.match(css,/#0f2f4a/i);assert.match(css,/#0f8f83/i);
});

test("specific import routes mount before generic price catalog routes",()=>{
  const special=index.indexOf('app.use("/api/price-catalog",auth,requireCompanyModule("INVENTORY"),priceCatalogImportRoutes)');
  const generic=index.indexOf('app.use("/api/price-catalog",auth,requireCompanyModule("INVENTORY"),priceCatalogRoutes)');
  assert.ok(special>=0&&generic>special);
});
