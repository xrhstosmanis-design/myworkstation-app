import fs from 'fs';

const file='server/src/routes/store-preparation.js';
let src=fs.readFileSync(file,'utf8');

const oldMilk=`         milk_modifier_id:=NULL;milk_target_ingredient_id:=NULL;milk_target_unit:=NULL;milk_fallback_qty:=NULL;milk_base_qty:=0;
         SELECT m.\"id\",c.\"ingredientProductId\",c.\"unit\",c.\"quantity\" INTO milk_modifier_id,milk_target_ingredient_id,milk_target_unit,milk_fallback_qty
         FROM jsonb_array_elements(COALESCE(prep_item->'modifiers','[]'::jsonb)) j
         JOIN \"ManagementModifier\" m ON m.\"id\"=j->>'id' AND m.\"companyId\"=NEW.\"companyId\" AND m.\"active\"=TRUE
         JOIN \"PreparationModifierConsumption\" c ON c.\"companyId\"=m.\"companyId\" AND c.\"modifierId\"=m.\"id\"
         JOIN \"Product\" ip ON ip.\"id\"=c.\"ingredientProductId\" AND ip.\"companyId\"=c.\"companyId\" AND ip.\"active\"=TRUE
         WHERE ip.\"sku\" LIKE 'MWS-PREP-MILK-%' AND ip.\"sku\" <> 'MWS-PREP-MILK' LIMIT 1;`;

const newMilk=`         milk_modifier_id:=NULL;milk_target_ingredient_id:=NULL;milk_target_unit:='ML';milk_fallback_qty:=NULL;milk_base_qty:=0;
         SELECT m.\"id\",ip.\"id\" INTO milk_modifier_id,milk_target_ingredient_id
         FROM jsonb_array_elements(COALESCE(prep_item->'modifiers','[]'::jsonb)) j
         JOIN \"ManagementModifier\" m ON m.\"id\"=j->>'id' AND m.\"companyId\"=NEW.\"companyId\" AND m.\"active\"=TRUE
         JOIN \"PreparationModifierBehavior\" b ON b.\"companyId\"=m.\"companyId\" AND b.\"modifierId\"=m.\"id\" AND b.\"mode\"='REPLACE' AND b.\"sourceIngredientSku\"='MWS-PREP-MILK'
         JOIN \"Product\" ip ON ip.\"companyId\"=m.\"companyId\" AND ip.\"active\"=TRUE AND ip.\"sku\"=b.\"targetIngredientSku\"
         LIMIT 1;`;

if(src.includes(oldMilk)) src=src.replace(oldMilk,newMilk);
if(!src.includes('JOIN "PreparationModifierBehavior" b ON b."companyId"=m."companyId"')){
  console.error('[startup] canonical modifier engine: milk resolver patch not present');
  process.exit(1);
}

const genericNeedle=`           IF COALESCE(modifier_json->>'id','') = '' OR COALESCE(modifier_json->>'id','') LIKE 'synthetic-%' THEN CONTINUE; END IF;`;
const genericGuard=`           IF COALESCE(modifier_json->>'id','') = '' OR COALESCE(modifier_json->>'id','') LIKE 'synthetic-%' THEN CONTINUE; END IF;
           -- REPLACE modifiers are already resolved into the recipe and must never consume independently.
           IF EXISTS (
             SELECT 1 FROM \"PreparationModifierBehavior\" b
             WHERE b.\"companyId\"=NEW.\"companyId\" AND b.\"modifierId\"=modifier_json->>'id' AND b.\"mode\"='REPLACE'
           ) THEN CONTINUE; END IF;`;

if(!src.includes('REPLACE modifiers are already resolved into the recipe')){
  if(!src.includes(genericNeedle)){
    console.error('[startup] canonical modifier engine: generic modifier loop signature not found');
    process.exit(1);
  }
  src=src.replace(genericNeedle,genericGuard);
}

fs.writeFileSync(file,src);
console.log('[startup] canonical modifier engine active: REPLACE inherits recipe quantity, no duplicate fixed consumption');
