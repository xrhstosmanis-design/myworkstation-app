import assert from "node:assert/strict";
import fs from "node:fs";

const defaults=fs.readFileSync(new URL("../src/kat-preparation-defaults.js",import.meta.url),"utf8");
const cleanup=fs.readFileSync(new URL("../src/kat-preparation-cleanup.js",import.meta.url),"utf8");
const engine=fs.readFileSync(new URL("../src/routes/store-preparation.js",import.meta.url),"utf8");

assert.match(defaults,/const RECIPE_PROFILE_VERSION=6;/,"KAT recipe profile must be v6");
assert.doesNotMatch(defaults,/withColdPack=rows=>\[\.\.\.rows,\[ingredientSku\.ice,/,"Ice must not be a base cold recipe ingredient");
assert.doesNotMatch(defaults,/,\[ingredientSku\.(?:milk|milkSlot|milkEvap),\s*\d+(?:\.\d+)?,\s*"ML"\]/,"Milk must not be stored in base beverage recipes");
assert.match(cleanup,/MODIFIER_TARGETS\.filter\(row=>row\[0\]!=="ΓΑΛΑ"\)/,"Cleanup must not recreate fixed milk consumption rows");
assert.match(engine,/-- MODIFIER-ONLY MILK:/,"Preparation engine must own milk via selected modifier");
assert.match(engine,/WHEN 'ΦΡΕΣΚΟ ΓΑΛΑ' THEN 'MWS-PREP-MILK'/,"Fresh milk modifier must map to fresh milk stock");
assert.match(engine,/WHEN source_product_sku='MWS-KAT-BEV-FREDDO-CAP-LATTE' THEN 140/,"Drink-specific milk quantity map is missing");
assert.match(engine,/'MODIFIER_MILK'/,"Milk stock consumption must be auditable as MODIFIER_MILK");

console.log("KAT P0 preparation source invariants passed");
