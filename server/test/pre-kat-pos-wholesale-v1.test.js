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
const bootstrapPath="server/src/pos-pricing-bootstrap.js";
const backend=read(backendPath),client=read(clientPath),css=read("client/src/components/commerce/pos-customer.css"),bootstrap=read(bootstrapPath),index=read("server/src/index.js");

test("POS wholesale server and pricing bootstrap parse",()=>{
  execFileSync(process.execPath,["--check",path.join(repo,backendPath)]);
  execFileSync(process.execPath,["--check",path.join(repo,bootstrapPath)]);
});

test("wholesale schema is guaranteed at server startup and not dependent on opening Price Catalog first",()=>{
  assert.match(bootstrap,/CREATE TABLE IF NOT EXISTS "CustomerWholesalePrice"/);
  assert.match(bootstrap,/UNIQUE\("companyId","customerId","productId"\)/);
  assert.match(bootstrap,/CustomerWholesalePrice_customer_idx/);
  assert.match(index,/import \{ ensurePosPricingSchema \} from "\.\/pos-pricing-bootstrap\.js"/);
  assert.match(index,/await ensurePosPricingSchema\(\)/);
});

test("customer wholesale lookup is tenant customer product and current-store scoped",()=>{
  assert.match(backend,/router\.get\("\/stores\/:storeId\/customers\/:customerId\/prices"/);
  assert.match(backend,/FROM "CustomerWholesalePrice" w/);
  assert.match(backend,/w\."companyId"=\$\{req\.user\.companyId\}/);
  assert.match(backend,/w\."customerId"=\$\{customer\.id\}/);
  assert.match(backend,/w\."active"=true/);
  assert.match(backend,/sp\."storeId"=\$\{store\.id\}/);
  assert.match(backend,/sp\."active"=true/);
});

test("server resolver keeps wholesale as explicit customer price source",()=>{
  assert.match(backend,/LEFT JOIN "CustomerWholesalePrice" w/);
  assert.match(backend,/w\."id" AS "wholesaleId",w\."wholesalePrice"/);
  assert.match(backend,/hasWholesale=Boolean\(product\.wholesaleId\)/);
  assert.match(backend,/basePrice=hasWholesale\?money\(product\.wholesalePrice\):retailPrice/);
  assert.match(backend,/priceSource:"WHOLESALE"/);
});

test("quote checkout and HOLD all use server-side customer-aware pricing",()=>{
  const matches=backend.match(/resolveItems\(req,store,body\.items,customer\)/g)||[];
  assert.ok(matches.length>=3,"quote, HOLD and checkout must use customer-aware resolver");
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

test("POS visibly marks wholesale products and authoritative quoted lines",()=>{
  assert.ok(client.includes("Χονδρική"));
  assert.match(client,/pos-price-badge wholesale/);
  assert.match(client,/pos-special-price/);
  assert.match(css,/\.pos-price-badge/);
  assert.match(css,/\.pos-special-price/);
  assert.match(css,/#0f766e/);
  assert.doesNotMatch(css,/#ffa500|#ff9800/i);
});

test("wholesale wins before retail promotions and does not stack",()=>{
  const start=backend.indexOf("async function resolveItems");
  const end=backend.indexOf("function quoteSummary");
  assert.ok(start>=0&&end>start,"resolveItems boundaries must exist");
  const resolver=backend.slice(start,end);
  const wholesaleReturn=resolver.indexOf('if(hasWholesale)return');
  const candidateStart=resolver.indexOf('const candidates=[]');
  assert.ok(wholesaleReturn>=0&&candidateStart>wholesaleReturn,"wholesale must return before promotion candidates are evaluated");
  assert.match(resolver,/priceSource:"WHOLESALE",promotionId:null,promotionType:null/);
});
