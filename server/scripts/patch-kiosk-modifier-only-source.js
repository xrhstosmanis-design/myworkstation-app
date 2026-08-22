import fs from "node:fs";

const root = new URL("../", import.meta.url);
const defaultsPath = new URL("src/kat-preparation-defaults.js", root);
const cleanupPath = new URL("src/kat-preparation-cleanup.js", root);
const enginePath = new URL("src/routes/store-preparation.js", root);

function patchFile(url, transform) {
  const path = url.pathname;
  const before = fs.readFileSync(path, "utf8");
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, "utf8");
}

function patchDefaults(source) {
  let s = source;
  s = s.replace(/const RECIPE_PROFILE_VERSION=\d+;/, "const RECIPE_PROFILE_VERSION=6;");
  s = s.replace(
    'const withColdPack=rows=>[...rows,[ingredientSku.ice,100,"GR"],[ingredientSku.cupL,1,"PCS"],[ingredientSku.lidL,1,"PCS"],[ingredientSku.straw,1,"PCS"]];',
    'const withColdPack=rows=>[...rows,[ingredientSku.cupL,1,"PCS"],[ingredientSku.lidL,1,"PCS"],[ingredientSku.straw,1,"PCS"]];'
  );
  s = s.replace(/,\[ingredientSku\.(?:milk|milkSlot|milkEvap),\s*\d+(?:\.\d+)?,\s*"ML"\]/g, "");
  s = s.replace(/\n await set\("ΓΑΛΑ","ΓΑΛΑ ΕΒΑΠΟΡΕ"[\s\S]*?await set\("ΓΑΛΑ","ΓΑΛΑ ΣΟΓΙΑΣ",ingredientSku\.soy,80,"ML"\);/m, "");
  return s;
}

function patchCleanup(source) {
  return source.replace(
    'for(const [groupName,modifierName,ingredientSku,quantity,unit] of MODIFIER_TARGETS){',
    'for(const [groupName,modifierName,ingredientSku,quantity,unit] of MODIFIER_TARGETS.filter(row=>row[0]!=="ΓΑΛΑ")){'
  );
}

function patchEngine(source) {
  let s = source;
  if (!s.includes('source_product_name TEXT;')) {
    s = s.replace(
      '      add_ingredient_id TEXT;\n',
      '      add_ingredient_id TEXT;\n      source_product_sku TEXT;\n      source_product_name TEXT;\n      milk_qty NUMERIC;\n'
    );
  }
  s = s.replace(
    "                   WHEN 'ΓΑΛΑ ΕΒΑΠΟΡΕ' THEN 'MWS-PREP-MILK-EVAP'",
    "                   WHEN 'ΦΡΕΣΚΟ' THEN 'MWS-PREP-MILK'\n                   WHEN 'ΦΡΕΣΚΟ ΓΑΛΑ' THEN 'MWS-PREP-MILK'\n                   WHEN 'ΓΑΛΑ ΦΡΕΣΚΟ' THEN 'MWS-PREP-MILK'\n                   WHEN 'ΓΑΛΑ ΕΒΑΠΟΡΕ' THEN 'MWS-PREP-MILK-EVAP'"
  );
  s = s.replace(/\n\s*AND UPPER\(TRIM\(m\."description"\)\) NOT IN \('ΦΡΕΣΚΟ','ΦΡΕΣΚΟ ΓΑΛΑ','ΓΑΛΑ ΦΡΕΣΚΟ'\)/, "");

  const qtyAnchor = '          IF product_qty <= 0 THEN CONTINUE; END IF;\n';
  if (!s.includes('source_product_name := NULL;')) {
    s = s.replace(qtyAnchor, qtyAnchor + `\n          source_product_sku := NULL;\n          source_product_name := NULL;\n          milk_qty := 0;\n          SELECT p."sku",UPPER(TRIM(p."name")) INTO source_product_sku,source_product_name\n          FROM "Product" p\n          WHERE p."id"=prep_item->>'productId' AND p."companyId"=NEW."companyId"\n          LIMIT 1;\n\n          milk_qty := CASE\n            WHEN source_product_sku='MWS-KAT-BEV-FREDDO-CAP-LATTE' THEN 140\n            WHEN source_product_sku IN ('MWS-KAT-BEV-FREDDO-CAP','MWS-KAT-BEV-DECAF-FREDDO-CAP') THEN 70\n            WHEN source_product_sku='MWS-KAT-BEV-ICED-LATTE' THEN 160\n            WHEN source_product_sku='MWS-KAT-BEV-FRAPPE-MILK' THEN 30\n            WHEN source_product_sku='MWS-KAT-BEV-MOCHA-COLD' THEN 160\n            WHEN source_product_sku='MWS-KAT-BEV-MACCHIATO-DOUBLE' THEN 25\n            WHEN source_product_sku='MWS-KAT-BEV-MACCHIATO' THEN 17.5\n            WHEN source_product_sku='MWS-KAT-BEV-CAP-LATTE-DOUBLE' THEN 180\n            WHEN source_product_sku='MWS-KAT-BEV-CAP-LATTE-SINGLE' THEN 170\n            WHEN source_product_sku='MWS-KAT-BEV-CAP-DOUBLE' THEN 120\n            WHEN source_product_sku IN ('MWS-KAT-BEV-CAP-SINGLE','MWS-KAT-BEV-DECAF-CAP') THEN 100\n            WHEN source_product_sku='MWS-KAT-BEV-FLAT-WHITE' THEN 120\n            WHEN source_product_sku='MWS-KAT-BEV-CORTADO' THEN 60\n            WHEN source_product_sku='MWS-KAT-BEV-MOCHA-HOT' THEN 160\n            WHEN source_product_sku IN ('MWS-KAT-BEV-LATTE-HOT','MWS-KAT-BEV-DECAF-LATTE') THEN 180\n            WHEN source_product_sku IN ('MWS-KAT-BEV-CHOC-HOT','MWS-KAT-BEV-CHOC-WHITE-HOT','MWS-KAT-BEV-CHOC-HAZ-HOT','MWS-KAT-BEV-CHOC-CARAMEL-HOT') THEN 200\n            WHEN source_product_sku IN ('MWS-KAT-BEV-CHOC-COLD','MWS-KAT-BEV-CHOC-WHITE-COLD','MWS-KAT-BEV-CHOC-HAZ-COLD','MWS-KAT-BEV-CHOC-CARAMEL-COLD') THEN 220\n            WHEN source_product_sku='MWS-KAT-BEV-MATCHA-HOT' THEN 200\n            WHEN source_product_sku='MWS-KAT-BEV-MATCHA-COLD' THEN 220\n            ELSE 0\n          END;\n`);
  }

  const addAnchor = '          -- ADD modifiers. Only explicit additions live here; REPLACE modifiers never enter this loop.\n';
  if (!s.includes('-- MODIFIER-ONLY MILK:')) {
    const milkBlock = `          -- MODIFIER-ONLY MILK: one selected milk, product-specific ML, one stock write.\n          IF milk_qty > 0 AND milk_target_sku IS NOT NULL THEN\n            SELECT p."id" INTO resolved_ingredient_id\n            FROM "Product" p\n            WHERE p."companyId"=NEW."companyId" AND p."sku"=milk_target_sku AND p."active"=TRUE\n            LIMIT 1;\n            IF resolved_ingredient_id IS NULL THEN\n              RAISE EXCEPTION 'Δεν βρέθηκε ενεργό υλικό για το επιλεγμένο γάλα (%).',milk_target_sku USING ERRCODE='P0001';\n            END IF;\n            consume_qty := product_qty * milk_qty;\n            UPDATE "StoreProduct" sp\n            SET "currentStock"=COALESCE(sp."currentStock",0)-consume_qty\n            FROM "Product" p\n            WHERE sp."storeId"=NEW."storeId"\n              AND sp."productId"=resolved_ingredient_id\n              AND sp."active"=TRUE\n              AND p."id"=sp."productId"\n              AND p."companyId"=NEW."companyId"\n              AND p."trackStock"=TRUE;\n            INSERT INTO "PreparationStockConsumption"\n              ("id","companyId","storeId","saleId","batchId","sourceProductId","ingredientProductId","modifierId","quantity","unit","kind")\n            VALUES\n              (gen_random_uuid()::text,NEW."companyId",NEW."storeId",sale_id,batch_id,prep_item->>'productId',resolved_ingredient_id,milk_modifier_id,consume_qty,'ML','MODIFIER_MILK');\n          END IF;\n\n`;
    s = s.replace(addAnchor, milkBlock + addAnchor);
  }
  return s;
}

patchFile(defaultsPath, patchDefaults);
patchFile(cleanupPath, patchCleanup);
patchFile(enginePath, patchEngine);
console.log("KAT modifier-only milk/ice source patch applied.");
