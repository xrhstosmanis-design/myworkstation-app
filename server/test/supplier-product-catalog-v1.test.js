import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const route=await readFile(new URL("../src/routes/supplier-product-catalog.js",import.meta.url),"utf8");
const normalized=await readFile(new URL("../src/routes/supplier-control-normalized.js",import.meta.url),"utf8");
const client=await readFile(new URL("../../client/src/components/commerce/installSupplierProductCatalog.js",import.meta.url),"utf8");
const entry=await readFile(new URL("../../client/src/entry.jsx",import.meta.url),"utf8");

const check=file=>{const path=fileURLToPath(new URL(file,import.meta.url));const result=spawnSync(process.execPath,["--check",path],{encoding:"utf8"});assert.equal(result.status,0,`${file}\n${result.stderr||result.stdout}`)};

test("supplier product catalog modules parse as JavaScript",()=>{
  check("../src/routes/supplier-product-catalog.js");
  check("../../client/src/components/commerce/installSupplierProductCatalog.js");
});

test("supplier product catalog uses current mapping with approved purchase fallback",()=>{
  assert.match(route,/COALESCE\(link\."supplierId",lp\."supplierId"\)/);
  assert.match(route,/d\."status"='APPROVED'/);
  assert.match(route,/spl\."active"=true/);
});

test("catalog supplier code falls back to latest real purchase-order supplier code",()=>{
  assert.match(route,/COALESCE\(link\."supplierCode",pol\."supplierCode"\)/);
  assert.match(route,/PurchaseOrderLine/);
  assert.match(route,/ORDER BY l2\."updatedAt" DESC NULLS LAST,l2\."createdAt" DESC LIMIT 1/);
});

test("catalog costs and stock are supplier-specific and aggregated safely",()=>{
  assert.match(route,/d\."supplierId"=\$\{supplierId\}/);
  assert.match(route,/LEFT JOIN LATERAL \(SELECT COALESCE\(SUM\(sp\."currentStock"\),0\) AS "currentStock" FROM "StoreProduct" sp WHERE sp\."productId"=p\."id"\) stock ON true/);
  assert.doesNotMatch(route,/SUM\(stock\."currentStock"\)/);
});

test("catalog ensures barcode extension fields itself",()=>{
  assert.match(route,/ALTER TABLE "ProductBarcode" ADD COLUMN IF NOT EXISTS "salePrice"/);
  assert.match(route,/ALTER TABLE "ProductBarcode" ADD COLUMN IF NOT EXISTS "name"/);
  assert.match(route,/ALTER TABLE "ProductBarcode" ADD COLUMN IF NOT EXISTS "updatedAt"/);
});

test("view-items context action opens full catalog with touch-search field",()=>{
  assert.match(client,/\.sc-context \[data-action='view'\]/);
  assert.match(client,/stopImmediatePropagation/);
  assert.match(client,/pointerType==="touch"/);
  assert.match(client,/Προβολή ειδών/);
  assert.match(client,/data-spc-search/);
  assert.match(client,/Barcodes προϊόντος/);
  assert.match(client,/Excel \/ CSV/);
});

test("catalog route is mounted before generic supplier routes and installer is wired",()=>{
  assert.match(normalized,/supplierProductCatalogRoutes/);
  assert.ok(normalized.indexOf("router.use(supplierProductCatalogRoutes)")<normalized.indexOf("router.use(supplierControlRoutes)"));
  assert.match(entry,/installSupplierProductCatalog\(\)/);
  assert.match(entry,/installTouchKeyboard\(\)/);
  assert.match(entry,/purchaseOrdersHostObserver/);
});
