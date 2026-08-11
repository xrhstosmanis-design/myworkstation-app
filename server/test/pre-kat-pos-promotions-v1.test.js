import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {parsePromotionDate} from "../src/promotion-time.js";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=p=>fs.readFileSync(path.join(repo,p),"utf8");
const backendPath="server/src/routes/store-pos.js";
const normalizedPath="server/src/routes/price-catalog-normalized.js";
const timePath="server/src/promotion-time.js";
const installerPath="client/src/components/commerce/installPromotionStoreScope.js";
const backend=read(backendPath),normalized=read(normalizedPath),bootstrap=read("server/src/pos-pricing-bootstrap.js"),client=read("client/src/components/commerce/CommercialPosApp.jsx"),installer=read(installerPath),entry=read("client/src/entry.jsx"),scopeCss=read("client/src/components/commerce/promotion-store-scope.css"),posCss=read("client/src/components/commerce/pos-customer.css");

test("promotion server routes utilities and installer parse",()=>{
  for(const file of [backendPath,normalizedPath,timePath,installerPath])execFileSync(process.execPath,["--check",path.join(repo,file)]);
});

test("fresh startup guarantees promotion store scope and customer member card compatibility",()=>{
  assert.match(bootstrap,/CREATE TABLE IF NOT EXISTS "PriceCatalogPromotion"/);
  assert.match(bootstrap,/CREATE TABLE IF NOT EXISTS "PriceCatalogPromotionStore"/);
  assert.match(bootstrap,/PRIMARY KEY\("promotionId","storeId"\)/);
  assert.match(bootstrap,/ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "memberCard" TEXT/);
});

test("promotion POS store assignment is explicit tenant-scoped management data",()=>{
  assert.match(normalized,/router\.get\("\/promotions\/:promotionId\/stores"/);
  assert.match(normalized,/router\.put\("\/promotions\/:promotionId\/stores"/);
  assert.match(normalized,/ownedPromotion\(companyId/);
  assert.match(normalized,/where:\{companyId,active:true,id:\{in:storeIds\}\}/);
  assert.match(normalized,/DELETE FROM "PriceCatalogPromotionStore" WHERE "companyId"=\$\{companyId\}/);
  assert.match(normalized,/INSERT INTO "PriceCatalogPromotionStore"/);
  assert.match(normalized,/posActive:storeIds\.length>0/);
});

test("an offer cannot affect POS without explicit assignment to that exact store",()=>{
  assert.match(backend,/FROM "PriceCatalogPromotion" pr JOIN "PriceCatalogPromotionStore" ps/);
  assert.match(backend,/ps\."storeId"=\$\{store\.id\}/);
  assert.match(backend,/ps\."companyId"=pr\."companyId"/);
  assert.doesNotMatch(backend,/LEFT JOIN "PriceCatalogPromotionStore"/);
});

test("only currently active promotions are eligible",()=>{
  assert.match(backend,/pr\."active"=true/);
  assert.match(backend,/pr\."validFrom"<=NOW\(\)/);
  assert.match(backend,/pr\."validUntil" IS NULL OR pr\."validUntil">=NOW\(\)/);
});

test("Greek datetime-local promotion input converts to real Athens instant",()=>{
  assert.equal(parsePromotionDate("2026-08-10T12:00").toISOString(),"2026-08-10T09:00:00.000Z");
  assert.equal(parsePromotionDate("2026-12-10T12:00").toISOString(),"2026-12-10T10:00:00.000Z");
  assert.equal(parsePromotionDate("2026-08-10T09:00:00.000Z").toISOString(),"2026-08-10T09:00:00.000Z");
  assert.match(normalized,/normalizePromotionDateBody/);
  assert.match(normalized,/router\.use\("\/promotions"/);
});

test("leaflet customer-card rule uses Parameters and real member-card presence",()=>{
  assert.match(backend,/leafletOnlyWithCustomerCard/);
  assert.match(backend,/settings\?\.backoffice\?\.leafletOnlyWithCustomerCard/);
  assert.match(backend,/hasMemberCard:Boolean/);
  assert.match(backend,/if\(settings\.leafletOnlyWithCustomerCard&&!customer\?\.hasMemberCard\)continue/);
  assert.match(client,/Κάρτα loyalty/);
});

test("GIFT discount is quantity based and deterministic",()=>{
  assert.match(backend,/group=saleQuantity\+bonusQuantity/);
  assert.match(backend,/groups=Math\.floor\(quantity\/group\)/);
  assert.match(backend,/discountedUnits=groups\*bonusQuantity/);
  assert.match(backend,/discountedUnits\*retailPrice\*\(discountPercent\/100\)/);
});

test("wholesale is not stacked with retail promotions",()=>{
  const start=backend.indexOf("async function resolveItems"),end=backend.indexOf("function quoteSummary");
  assert.ok(start>=0&&end>start);
  const resolver=backend.slice(start,end),wholesaleReturn=resolver.indexOf("if(hasWholesale)return"),candidateStart=resolver.indexOf("const candidates=[]");
  assert.ok(wholesaleReturn>=0&&candidateStart>wholesaleReturn);
  assert.match(resolver,/promotionId:null,promotionType:null/);
});

test("overlapping retail promotions choose one lowest payable total and never stack",()=>{
  assert.match(backend,/candidates\.sort\(\(a,b\)=>a\.lineTotal-b\.lineTotal/);
  assert.match(backend,/const best=candidates\[0\]/);
  assert.doesNotMatch(backend,/reduce\([^\n]*candidates/);
  assert.match(backend,/priceSource:best\?\.promotionType\|\|"RETAIL"/);
});

test("quote HOLD and checkout share the same authoritative resolver",()=>{
  assert.match(backend,/router\.post\("\/stores\/:storeId\/quote"/);
  const matches=backend.match(/resolveItems\(req,store,body\.items,customer\)/g)||[];
  assert.ok(matches.length>=3,"quote, HOLD and checkout must all call resolveItems");
  assert.match(backend,/function quoteSummary/);
  assert.match(backend,/INSERT INTO "Sale"[\s\S]*\$\{summary\.subtotal\},\$\{summary\.discount\},\$\{summary\.total\}/);
  assert.match(backend,/INSERT INTO "SaleLine"[\s\S]*\$\{item\.discount\}/);
});

test("POS displays authoritative quote and blocks payment while quote is pending",()=>{
  assert.match(client,/\/quote`/);
  assert.match(client,/quoteSignature/);
  assert.match(client,/quoteSeq=useRef\(0\)/);
  assert.match(client,/quotedById/);
  for(const label of ["Χονδρική","Φυλλάδιο","Δώρο","ΤΙΜΟΛΟΓΗΣΗ…","Έκπτωση"])assert.ok(client.includes(label),label);
  assert.match(client,/disabled=\{busy\|\|quoteBusy/);
  assert.match(client,/Η μικτή πληρωμή πρέπει να είναι ακριβώς/);
});

test("Price Catalog offers have an explicit POS-store action without a new observer",()=>{
  assert.match(installer,/🏬 POS/);
  assert.match(installer,/promotions\/\$\{encodeURIComponent\(promotionId\)\}\/stores/);
  assert.match(installer,/Χωρίς επιλογή καταστήματος/);
  assert.doesNotMatch(installer,/new\s+MutationObserver/);
  assert.match(entry,/installPromotionStoreScopeSafely/);
  assert.match(entry,/purchaseOrdersHostObserver/);
});

test("promotion UI keeps MyWorkStation palette",()=>{
  for(const css of [scopeCss,posCss]){assert.match(css,/#123b5d/);assert.match(css,/#0f766e/);assert.doesNotMatch(css,/#ffa500|#ff9800|#ff9f00/i)}
});
