import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const preparation=await readFile(new URL("../src/routes/store-preparation.js",import.meta.url),"utf8");
const defaults=await readFile(new URL("../src/kat-preparation-defaults.js",import.meta.url),"utf8");

test("cold drink ice choice replaces recipe ice instead of stacking on top",()=>{
  assert.match(preparation,/ice_target_qty:=0/);
  assert.match(preparation,/ice_target_qty:=50/);
  assert.match(preparation,/ice_target_qty:=100/);
  assert.match(preparation,/ice_target_qty:=150/);
  assert.match(preparation,/recipe_row\.ingredient_sku='MWS-PREP-ICE'/);
  assert.match(preparation,/MODIFIER_SUBSTITUTION/);
});

test("DECAF modifier substitutes espresso beans rather than adding a second coffee dose",()=>{
  assert.match(preparation,/UPPER\(m\."description"\)='DECAF'/);
  assert.match(preparation,/recipe_row\.ingredient_sku IN \('MWS-PREP-COFFEE-BEANS','MWS-PREP-DECAF'\)/);
  assert.match(preparation,/coffee_base_ingredient_id:=decaf_ingredient_id/);
  assert.match(preparation,/UPPER\(modifier_row\.modifier_name\) IN \('DECAF','EXTRA ΔΟΣΗ'\)/);
});

test("extra espresso dose follows the actual bean type including decaf",()=>{
  assert.match(preparation,/extra_modifier_id IS NOT NULL AND coffee_base_ingredient_id IS NOT NULL/);
  assert.match(preparation,/consume_qty:=product_qty\*9/);
  assert.match(defaults,/await set\("EXTRA","EXTRA ΔΟΣΗ",ingredientSku\.beans,9,"GR"\)/);
});

test("sugar modifiers remain additive gram based consumptions",()=>{
  assert.match(defaults,/"ΜΕΤΡΙΟΣ",ingredientSku\.sugar,8,"GR"/);
  assert.match(defaults,/"ΓΛΥΚΟΣ",ingredientSku\.sugar,16,"GR"/);
  assert.match(defaults,/"ΚΑΣΤΑΝΗ ΖΑΧΑΡΗ",ingredientSku\.brown,8,"GR"/);
});
