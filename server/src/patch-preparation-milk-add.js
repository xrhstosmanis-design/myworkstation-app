import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const file=path.join(here,"routes/store-preparation.js");
let source=fs.readFileSync(file,"utf8");
const marker="/* MWS_PREPARATION_MILK_ADD_V1 */";
if(source.includes(marker)){
  console.log("preparation milk add-on patch already applied");
  process.exit(0);
}

const declaration='      add_ingredient_id TEXT;';
const declarationNew=`      add_ingredient_id TEXT;\n      has_base_milk BOOLEAN;\n      ${marker}`;
if(!source.includes(declaration))throw new Error("preparation milk declaration anchor not found");
source=source.replace(declaration,declarationNew);

const anchor=`            ELSIF modifier_row.group_name='EXTRA' THEN\n              IF modifier_row.description='EXTRA ΔΟΣΗ' THEN`;
const replacement=`            ELSIF modifier_row.group_name='ΓΑΛΑ' THEN\n              SELECT EXISTS(\n                SELECT 1\n                FROM "PreparationRecipeLine" r\n                JOIN "Product" p ON p."id"=r."ingredientProductId" AND p."companyId"=r."companyId" AND p."active"=TRUE\n                WHERE r."companyId"=NEW."companyId"\n                  AND r."productId"=prep_item->>'productId'\n                  AND r."automatic"=TRUE\n                  AND p."sku"='MWS-PREP-MILK'\n              ) INTO has_base_milk;\n              IF NOT has_base_milk THEN\n                IF modifier_row.description IN ('ΦΡΕΣΚΟ','ΦΡΕΣΚΟ ΓΑΛΑ','ΓΑΛΑ ΦΡΕΣΚΟ') THEN add_target_sku:='MWS-PREP-MILK';\n                ELSIF modifier_row.description IN ('ΓΑΛΑ ΕΒΑΠΟΡΕ','ΕΒΑΠΟΡΕ') THEN add_target_sku:='MWS-PREP-MILK-EVAP';\n                ELSIF modifier_row.description IN ('ΧΩΡΙΣ ΛΑΚΤΟΖΗ','ΓΑΛΑ ΧΩΡΙΣ ΛΑΚΤΟΖΗ') THEN add_target_sku:='MWS-PREP-MILK-LF';\n                ELSIF modifier_row.description='ΓΑΛΑ ΑΜΥΓΔΑΛΟΥ' THEN add_target_sku:='MWS-PREP-MILK-ALMOND';\n                ELSIF modifier_row.description='ΓΑΛΑ ΒΡΩΜΗΣ' THEN add_target_sku:='MWS-PREP-MILK-OAT';\n                ELSIF modifier_row.description='ΓΑΛΑ ΣΟΓΙΑΣ' THEN add_target_sku:='MWS-PREP-MILK-SOY';\n                END IF;\n                IF add_target_sku IS NOT NULL THEN add_qty:=80;add_unit:='ML'; END IF;\n              END IF;\n            ELSIF modifier_row.group_name='EXTRA' THEN\n              IF modifier_row.description='EXTRA ΔΟΣΗ' THEN`;
if(!source.includes(anchor))throw new Error("preparation milk ADD anchor not found");
source=source.replace(anchor,replacement);

fs.writeFileSync(file,source,"utf8");
console.log("Preparation milk modifier now adds 80 ML only when the base recipe has no milk.");
