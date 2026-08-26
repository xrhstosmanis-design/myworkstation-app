import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=p=>fs.readFileSync(path.join(repo,p),"utf8");

const index=read("server/src/index.js");
const pos=read("server/src/routes/store-pos.js");
const saleSafety=read("server/src/pos-sale-safety.js");
const transactions=read("server/src/routes/store-transactions.js");
const preparation=read("server/src/routes/store-preparation.js");
const prepDefaults=read("server/src/kat-preparation-defaults.js");
const online=read("server/src/routes/kat-online-ordering.js");
const operatorRoutes=read("server/src/routes/store-operators.js");
const operatorManagement=read("server/src/routes/operator-management-v2.js");

test("P0 server gate: health endpoint exists and bootstrap failures stop startup",()=>{
  assert.match(index,/app\.get\("\/api\/health"/);
  assert.match(index,/await ensurePosSaleSafetySchema\(\)/);
  assert.match(index,/await ensureKatPreparationSeed\(\)/);
  assert.match(index,/await ensureKatOnlineOrderingSchema\(\)/);
  assert.match(index,/Platform\/commercial schema bootstrap failed/);
  assert.match(index,/process\.exit\(1\)/);
});

test("P0 POS gate: sale is idempotent and serialized before insert",()=>{
  assert.match(pos,/clientTransactionId/);
  assert.match(pos,/pg_advisory_xact_lock/);
  assert.match(pos,/findSaleByClientTransaction/);
  assert.match(pos,/findRecentSimilarSale/);
  assert.match(pos,/INSERT INTO "Sale"/);
  assert.match(saleSafety,/CREATE UNIQUE INDEX IF NOT EXISTS "Sale_store_client_tx_uq"/);
});

test("P0 shift gate: store transactions are tied to an open shift and company\/store scope",()=>{
  assert.match(transactions,/CashShiftSession/);
  assert.match(transactions,/status[^\n]*OPEN|"status"='OPEN'/i);
  assert.match(transactions,/companyId/);
  assert.match(transactions,/storeId/);
});

test("P0 stock gate: preparation consumes recipe stock and records movements",()=>{
  assert.match(preparation,/PreparationRecipeLine/);
  assert.match(preparation,/StockMovement/);
  assert.match(preparation,/currentStock/);
  assert.match(preparation,/MODIFIER_MILK/);
  assert.match(prepDefaults,/ΦΡΑΠΕ ΜΕ ΓΑΛΑ/);
  assert.match(preparation,/WHEN source_product_sku='MWS-KAT-BEV-FRAPPE-MILK' THEN 30/);
  assert.match(prepDefaults,/"ΜΕΤΡΙΟΣ",ingredientSku\.sugar,8,"GR"/);
  assert.match(prepDefaults,/"ΓΛΥΚΟΣ",ingredientSku\.sugar,16,"GR"/);
});

test("P0 online order gate: delivery posts exactly through commercial sale flow and stock consumption",()=>{
  assert.match(online,/async function postCommercialSale/);
  assert.match(online,/if\(order\.saleId\|\|order\.commercialPostedAt\)/);
  assert.match(online,/CashShiftSession/);
  assert.match(online,/INSERT INTO "Sale"/);
  assert.match(online,/INSERT INTO "SaleLine"/);
  assert.match(online,/INSERT INTO "Payment"/);
  assert.match(online,/INSERT INTO "StoreTransaction"/);
  assert.match(online,/consumePreparationRecipe/);
  assert.match(online,/UPDATE "StoreProduct" SET "currentStock"=COALESCE\("currentStock",0\)-/);
  assert.match(online,/ONLINE_ORDER_RECIPE/);
});

test("P0 permissions gate: store operator is store-scoped and management keeps central role control",()=>{
  assert.match(operatorRoutes,/STORE_OPERATOR/);
  assert.match(operatorRoutes,/storeId/);
  assert.match(operatorManagement,/SUPER_ADMIN/);
  assert.match(operatorManagement,/OWNER/);
  assert.match(operatorManagement,/ADMIN/);
  assert.match(index,/operatorManagementV2Routes/);
  assert.match(index,/requireStoreModule\("STORE_MODE"\)/);
});
