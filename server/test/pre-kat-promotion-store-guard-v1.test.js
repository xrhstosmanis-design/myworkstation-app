import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=file=>fs.readFileSync(path.join(repo,file),"utf8");
const routePath="server/src/routes/price-catalog-promotion-guard.js";
const clientPath="client/src/components/commerce/installPromotionStoreGuard.js";
const cssPath="client/src/components/commerce/promotion-store-guard.css";
const route=read(routePath),client=read(clientPath),css=read(cssPath),index=read("server/src/index.js"),entry=read("client/src/entry.jsx"),scope=read("client/src/components/commerce/installPromotionStoreScope.js");

test("promotion store guard server and client parse",()=>{
  execFileSync(process.execPath,["--check",path.join(repo,routePath)]);
  execFileSync(process.execPath,["--check",path.join(repo,clientPath)]);
});

test("manual promotion writes are tenant product and active-store scoped",()=>{
  assert.match(route,/WHERE \"companyId\"=\$\{companyId\} AND \"id\"=\$\{productId\} AND \"active\"=true/);
  assert.match(route,/companyId,active:true,id:\{in:ids\}/);
  assert.match(route,/Επίλεξε τουλάχιστον ένα κατάστημα POS για ενεργή προσφορά/);
  assert.match(route,/PriceCatalogPromotionStore/);
});

test("same product and promotion type cannot overlap on the same selected stores",()=>{
  assert.match(route,/pr\."productId"=\$\{productId\}/);
  assert.match(route,/pr\."promotionType"=\$\{promotionType\}/);
  assert.match(route,/ps\."storeId"=ANY\(\$\{storeIds\}::text\[\]\)/);
  assert.match(route,/pr\."validFrom"<=\$\{overlapSqlDateEnd\(validUntil\)\}/);
  assert.match(route,/COALESCE\(pr\."validUntil",'infinity'::timestamptz\)>=\$\{validFrom\}/);
  assert.match(route,/PROMOTION_STORE_OVERLAP/);
});

test("overlap validation is serialized inside the same database transaction",()=>{
  assert.match(route,/pg_advisory_xact_lock\(hashtext\(\$\{key\}\)\)/);
  const post=route.indexOf('router.post("/promotions/scoped"');
  const tx=route.indexOf('prisma.$transaction',post);
  const lock=route.indexOf('lockScope(tx',tx);
  const overlap=route.indexOf('findOverlap(tx',lock);
  const insert=route.indexOf('INSERT INTO "PriceCatalogPromotion"',overlap);
  assert.ok(post>=0&&tx>post&&lock>tx&&overlap>lock&&insert>overlap);
});

test("new and edit save promotion and store targeting atomically",()=>{
  assert.match(route,/router\.post\("\/promotions\/scoped"/);
  assert.match(route,/router\.patch\("\/promotions\/:promotionId\/scoped"/);
  assert.match(route,/await replaceStores\(tx,companyId,promotionId,stores\)/);
  assert.match(route,/await replaceStores\(tx,companyId,old\.id,stores\)/);
});

test("legacy POS-store reassignment cannot bypass the same overlap guard",()=>{
  assert.match(route,/router\.put\("\/promotions\/:promotionId\/stores"/);
  const put=route.indexOf('router.put("/promotions/:promotionId/stores"');
  assert.ok(route.indexOf('lockScope(tx',put)>put);
  assert.ok(route.indexOf('findOverlap(tx',put)>put);
  assert.match(scope,/method:"PUT"/);
});

test("existing promotion form gets POS stores in the same modal",()=>{
  assert.match(client,/form\[data-pc-promo-form\]/);
  assert.match(client,/Καταστήματα POS/);
  assert.match(client,/data-promo-store/);
  assert.match(client,/data-pc-new-promo/);
  assert.match(client,/data-pc-edit-promo/);
  assert.match(client,/promotions\/\$\{encodeURIComponent\(promotionId\)\}\/stores/);
});

test("promotion submit fails closed until guard is ready and uses scoped endpoints",()=>{
  assert.match(client,/document\.addEventListener\("submit",guardedSubmit,true\)/);
  assert.match(client,/event\.preventDefault\(\);event\.stopImmediatePropagation\(\)/);
  assert.match(client,/promoStoreGuard!=="ready"/);
  assert.match(client,/\/api\/price-catalog\/promotions\/scoped/);
  assert.match(client,/\/scoped`/);
  assert.match(client,/body\.active&&!body\.storeIds\.length/);
});

test("guard reuses existing host observer and keeps MyWorkStation palette",()=>{
  assert.doesNotMatch(client,/new MutationObserver|MutationObserver\(/);
  assert.match(entry,/installPromotionStoreGuardSafely/);
  assert.equal((entry.match(/const purchaseOrdersHostObserver=new MutationObserver/g)||[]).length,1);
  assert.match(css,/#0f2f4a/i);assert.match(css,/#0f8f83/i);
});

test("specific promotion guard mounts before import and generic price catalog routes",()=>{
  const guard=index.indexOf('priceCatalogPromotionGuardRoutes');
  const guardMount=index.indexOf('app.use("/api/price-catalog",auth,requireCompanyModule("INVENTORY"),priceCatalogPromotionGuardRoutes)');
  const importMount=index.indexOf('app.use("/api/price-catalog",auth,requireCompanyModule("INVENTORY"),priceCatalogImportRoutes)');
  const generic=index.indexOf('app.use("/api/price-catalog",auth,requireCompanyModule("INVENTORY"),priceCatalogRoutes)');
  assert.ok(guard>=0&&guardMount>=0&&importMount>guardMount&&generic>importMount);
});
