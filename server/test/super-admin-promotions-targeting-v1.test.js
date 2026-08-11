import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=file=>fs.readFileSync(path.join(repo,file),"utf8");
const routePath="server/src/routes/platform-bulk-catalog.js";
const clientPath="client/src/components/platform/PlatformPromotionCenter.jsx";
const entryPath="client/src/entry.jsx";
const route=read(routePath),client=read(clientPath),entry=read(entryPath);

test("platform promotion route parses",()=>{execFileSync(process.execPath,["--check",path.join(repo,routePath)])});

test("bulk catalog and promotion endpoints are platform Super Admin only",()=>{
  assert.match(route,/isSuperAdmin===true\|\|req\.user\?\.platformRole==="SUPER_ADMIN"/);
  assert.match(route,/Απαιτείται πρόσβαση Platform Super Admin/);
});

test("bulk promotion targets explicit Master products and stores with bounded combinations",()=>{
  assert.match(route,/masterProductIds:z\.array/);
  assert.match(route,/storeIds:z\.array/);
  assert.match(route,/10000/);
  assert.match(route,/router\.post\("\/promotions"/);
});

test("promotion creation ensures tenant product and StoreProduct mapping first",()=>{
  assert.match(route,/ensureTenantProduct/);
  assert.match(route,/INSERT INTO \"Product\"/);
  assert.match(route,/INSERT INTO \"StoreProduct\"/);
  assert.match(route,/masterProductId/);
});

test("promotion overlap is locked and checked per company product type and store",()=>{
  assert.match(route,/platform-promo:/);
  assert.match(route,/pg_advisory_xact_lock/);
  assert.match(route,/JOIN \"PriceCatalogPromotionStore\"/);
  assert.match(route,/pr\."promotionType"=\$\{body\.promotionType\}/);
  assert.match(route,/COALESCE\(pr\."validUntil",'infinity'::timestamptz\)/);
});

test("successful action writes promotions store targets and platform audit",()=>{
  assert.match(route,/INSERT INTO \"PriceCatalogPromotion\"/);
  assert.match(route,/INSERT INTO \"PriceCatalogPromotionStore\"/);
  assert.match(route,/PlatformBulkPromotionAudit/);
  assert.match(route,/createdPromotions/);
});

test("Super Admin UI supports offer or gift product and store selection",()=>{
  assert.match(client,/Κεντρικές Προσφορές & Δώρα/);
  assert.match(client,/promotionType:type/);
  assert.match(client,/LEAFLET/);
  assert.match(client,/GIFT/);
  assert.match(client,/selected|products\.length|stores\.length/);
  assert.match(client,/bulk\/promotions/);
  assert.match(client,/Όλες οι κατηγορίες/);
  assert.match(client,/Όλες οι υποκατηγορίες/);
});

test("platform entry mounts promotion center only in Platform Admin composition",()=>{
  assert.match(entry,/import PlatformPromotionCenter/);
  assert.match(entry,/<PlatformPromotionCenter\/>/);
  const platform=entry.indexOf("else if(platformMatch)");
  const promo=entry.indexOf("<PlatformPromotionCenter/>",platform);
  assert.ok(platform>=0&&promo>platform);
});
