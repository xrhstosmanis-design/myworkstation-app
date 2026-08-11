import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=p=>fs.readFileSync(path.join(repo,p),"utf8");
const backendPath="server/src/routes/store-pos.js";
const clientPath="client/src/components/commerce/CommercialPosApp.jsx";
const backend=read(backendPath),client=read(clientPath),css=read("client/src/components/commerce/pos-customer.css");

test("POS wholesale server parses",()=>{execFileSync(process.execPath,["--check",path.join(repo,backendPath)])});

test("customer wholesale lookup is tenant customer product and current-store scoped",()=>{
  assert.match(backend,/router\.get\("\/stores\/:storeId\/customers\/:customerId\/prices"/);
  assert.match(backend,/FROM "CustomerWholesalePrice" w/);
  assert.match(backend,/w\."companyId"=\$\{req\.user\.companyId\}/);
  assert.match(backend,/w\."customerId"=\$\{customer\.id\}/);
  assert.match(backend,/w\."active"=true/);
  assert.match(backend,/sp\."storeId"=\$\{store\.id\}/);
  assert.match(backend,/sp\."active"=true/);
});

test("server price resolver applies wholesale then retail fallback",()=>{
  assert.match(backend,/LEFT JOIN "CustomerWholesalePrice" w/);
  assert.match(backend,/COALESCE\(w\."wholesalePrice",COALESCE\(sp\."salePrice",p\."salePrice"\)\) AS "effectivePrice"/);
  assert.match(backend,/CASE WHEN w\."id" IS NULL THEN 'RETAIL' ELSE 'WHOLESALE' END AS "priceSource"/);
  assert.match(backend,/retailPrice/);
  assert.match(backend,/unitPrice=money\(product\.effectivePrice\)/);
});

test("checkout and HOLD both use server-side customer-aware pricing",()=>{
  assert.match(backend,/resolveItems\(req,store,body\.items,customer\)/g);
  assert.match(backend,/INSERT INTO "SaleLine"[\s\S]*\$\{item\.unitPrice\}/);
  assert.doesNotMatch(backend,/cartItemSchema[\s\S]{0,250}(unitPrice|price):/);
  assert.match(backend,/wholesaleLines=items\.filter\(item=>item\.priceSource==="WHOLESALE"\)\.length/);
});

test("client loads wholesale map only for selected customer",()=>{
  assert.match(client,/wholesalePrices/);
  assert.match(client,/customers\/\$\{encodeURIComponent\(value\.id\)\}\/prices/);
  assert.match(client,/Object\.fromEntries\(\(r\.items\|\|\[\]\)\.map\(item=>\[item\.productId,Number\(item\.wholesalePrice\|\|0\)\]\)\)/);
  assert.match(client,/effectiveProductPrice/);
});

test("switching customer reprices cart from base retail and cannot carry previous wholesale",()=>{
  assert.match(client,/basePrice=Number\(row\.basePrice\?\?row\.retailPrice\?\?row\.price\?\?0\)/);
  assert.match(client,/price:hasWholesale\?Number\(map\[row\.id\]\):basePrice/);
  assert.match(client,/priceSource:hasWholesale\?"WHOLESALE":"RETAIL"/);
  assert.match(client,/setWholesalePrices\(map\)/);
  assert.match(client,/setWholesalePrices\(\{\}\)/);
});

test("POS visibly marks wholesale products and lines",()=>{
  assert.ok(client.includes("Χονδρική"));
  assert.match(client,/pos-wholesale-badge/);
  assert.match(client,/pos-wholesale-price/);
  assert.match(css,/\.pos-wholesale-badge/);
  assert.match(css,/\.pos-wholesale-price/);
  assert.match(css,/#0f766e/);
  assert.doesNotMatch(css,/#ffa500|#ff9800/i);
});

test("wholesale pricing does not yet mix promotion precedence in this step",()=>{
  const resolver=backend.slice(backend.indexOf("async function resolveItems"),backend.indexOf("router.get(\"/stores/:storeId/holds\""));
  assert.doesNotMatch(resolver,/PriceCatalogPromotion|LEAFLET|GIFT/);
});
