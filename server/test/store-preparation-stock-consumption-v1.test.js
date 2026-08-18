import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const preparation=await readFile(new URL("../src/routes/store-preparation.js",import.meta.url),"utf8");
const pos=await readFile(new URL("../src/routes/store-pos.js",import.meta.url),"utf8");
const modal=await readFile(new URL("../../client/src/components/store/StorePreparationModal.jsx",import.meta.url),"utf8");

test("prepared POS sales consume recipe and modifier ingredients atomically",()=>{
  assert.match(preparation,/mws_consume_preparation_stock_from_pos_audit/);
  assert.match(preparation,/NEW\."eventType" <> 'POS_SALE_COMPLETED'/);
  assert.match(preparation,/PreparationRecipeLine/);
  assert.match(preparation,/PreparationModifierConsumption/);
  assert.match(preparation,/UPDATE "StoreProduct" sp SET "currentStock"=COALESCE\(sp\."currentStock",0\)-consume_qty/);
  assert.match(preparation,/PreparationStockConsumption/);
});

test("preparation batch is linked once to the completed sale",()=>{
  assert.match(preparation,/"status"='CONSUMED',"saleId"=sale_id,"consumedAt"=NOW\(\)/);
  assert.match(preparation,/"status"='SENT'/);
  assert.match(preparation,/PreparationStockConsumption_once_idx/);
  assert.match(preparation,/FOR UPDATE/);
});

test("sale must match preparation batch products and quantities before stock consumption",()=>{
  assert.match(preparation,/FULL OUTER JOIN/);
  assert.match(preparation,/COALESCE\(x->>'overrideReason',''\)='PREPARATION:'\|\|batch_id/);
  assert.match(preparation,/b\.qty IS DISTINCT FROM s\.qty/);
  assert.match(preparation,/Η παραγγελία παρασκευής δεν συμφωνεί με τα προϊόντα\/ποσότητες της πώλησης/);
  const mismatchGuard=preparation.indexOf("IF mismatch THEN");
  const firstStockUpdate=preparation.indexOf('UPDATE "StoreProduct" sp SET "currentStock"');
  assert.ok(mismatchGuard>=0&&firstStockUpdate>mismatchGuard,"batch/sale parity must be checked before any ingredient stock update");
});

test("milk modifiers replace recipe milk instead of double-consuming it",()=>{
  assert.match(preparation,/UPPER\(g\."description"\)='ΓΑΛΑ'/);
  assert.match(preparation,/recipe_row\.ingredient_sku LIKE 'MWS-PREP-MILK%'/);
  assert.match(preparation,/milk_base_qty:=milk_base_qty\+recipe_row\."quantity"/);
  assert.match(preparation,/MODIFIER_SUBSTITUTION/);
  assert.match(preparation,/IF UPPER\(modifier_row\.group_name\)='ΓΑΛΑ' THEN CONTINUE/);
});

test("POS already carries preparation batch id through override reason",()=>{
  assert.match(modal,/row\.priceReason=`PREPARATION:\$\{row\.preparationId\|\|""\}`/);
  assert.match(pos,/overrideReason:item\.overrideReason\|\|null/);
  assert.match(preparation,/LIKE 'PREPARATION:%'/);
});

test("sending to production alone does not consume stock",()=>{
  const postStart=preparation.indexOf('router.post("/stores/:storeId/preparation"');
  const postBody=preparation.slice(postStart);
  assert.doesNotMatch(postBody,/currentStock.*-/);
});
