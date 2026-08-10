import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import test from "node:test";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"../..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const server="server/src/routes/price-catalog.js";
const normalized="server/src/routes/price-catalog-normalized.js";
const client="client/src/components/commerce/installPriceCatalogSuite.js";
const entry="client/src/entry.jsx";
const index="server/src/index.js";
const syntax=file=>{const r=spawnSync(process.execPath,["--check",path.join(root,file)],{encoding:"utf8"});assert.equal(r.status,0,r.stderr||r.stdout)};

test("price catalog server and client files are valid JavaScript",()=>{syntax(server);syntax(normalized);syntax(client)});

test("price catalog is role and tenant scoped",()=>{
  const s=read(server),n=read(normalized),i=read(index);
  assert.match(n,/SUPER_ADMIN.*OWNER.*ADMIN.*MANAGER/);
  assert.match(n,/req\.user\.companyId/);
  assert.match(s,/req\.user\.companyId/);
  assert.match(i,/\/api\/price-catalog/);
  assert.match(i,/requireCompanyModule\("INVENTORY"\)/);
});

test("price check uses real latest purchase and the Kiosk margin/markup formulas",()=>{
  const n=read(normalized);
  assert.match(n,/PurchaseDocumentLine/);
  assert.match(n,/d\."status"='APPROVED'/);
  assert.match(n,/\(saleNet-lastCost\)\/saleNet/);
  assert.match(n,/\(saleNet-lastCost\)\/lastCost/);
  assert.match(n,/pageSize/);
  assert.match(n,/Math\.ceil\(total\/pageSize\)/);
});

test("price edits support store price, all stores and auditable history",()=>{
  const s=read(server),n=read(normalized);
  assert.match(s,/syncAllStores/);
  assert.match(s,/StoreProduct/);
  assert.match(s,/ProductPriceHistory/);
  assert.match(s,/PRICE_CATALOG/);
  assert.match(n,/ADD COLUMN IF NOT EXISTS "storeId"/);
  assert.match(n,/ADD COLUMN IF NOT EXISTS "createdByName"/);
});

test("leaflet and gift promotions are real ledgers with soft disable",()=>{
  const s=read(server),c=read(client);
  assert.match(s,/PriceCatalogPromotion/);
  assert.match(s,/LEAFLET/);
  assert.match(s,/GIFT/);
  assert.match(s,/saleQuantity/);
  assert.match(s,/bonusQuantity/);
  assert.match(s,/customerPoints/);
  assert.match(s,/SET "active"=false/);
  assert.match(c,/Νέα τιμή/);
  assert.match(c,/Έκπτωση %/);
  assert.match(c,/Επιπλέον Τμχ/);
});

test("wholesale prices are customer-product scoped and calculate both margins",()=>{
  const s=read(server),c=read(client);
  assert.match(s,/CustomerWholesalePrice/);
  assert.match(s,/UNIQUE\("companyId","customerId","productId"\)/);
  assert.match(s,/customerMargin/);
  assert.match(s,/productMargin/);
  assert.match(c,/Χονδρική πελάτη/);
  assert.match(c,/Margin πελάτη/);
  assert.match(c,/Margin είδους/);
});

test("price catalog uses global touch keyboard and the existing guarded host observer",()=>{
  const e=read(entry);
  assert.match(e,/installTouchKeyboard\(\)/);
  assert.match(e,/installPriceCatalogSuite/);
  assert.match(e,/installPriceCatalogSafely/);
  assert.match(e,/purchaseOrdersHostObserver/);
  assert.match(e,/installCustomerControlSafely\(\);installPriceCatalogSafely\(\)/);
});
