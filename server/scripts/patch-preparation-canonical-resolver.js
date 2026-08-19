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
         SELECT b.\"modifierId\",ip.\"id\" INTO milk_modifier_id,milk_target_ingredient_id
         FROM jsonb_array_elements(COALESCE(prep_item->'modifiers','[]'::jsonb)) j
         JOIN \"PreparationModifierBehavior\" b ON b.\"companyId\"=NEW.\"companyId\" AND b.\"modifierId\"=j->>'id' AND b.\"mode\"='REPLACE' AND b.\"sourceIngredientSku\"='MWS-PREP-MILK'
         JOIN \"Product\" ip ON ip.\"companyId\"=NEW.\"companyId\" AND ip.\"sku\"=b.\"targetIngredientSku\" AND ip.\"active\"=TRUE
         LIMIT 1;`;

if(!src.includes(oldMilk)){
  console.error('[startup] canonical resolver: milk source signature not found');
  process.exit(1);
}
src=src.replace(oldMilk,newMilk);

const oldGeneric=`           FOR modifier_row IN
             SELECT \"modifierId\",\"ingredientProductId\",\"quantity\",\"unit\",\"multiplierMode\" FROM \"PreparationModifierConsumption\"
             WHERE \"companyId\"=NEW.\"companyId\" AND \"modifierId\"=modifier_json->>'id'
           LOOP`;

const newGeneric=`           FOR modifier_row IN
             SELECT c.\"modifierId\",c.\"ingredientProductId\",c.\"quantity\",c.\"unit\",c.\"multiplierMode\"
             FROM \"PreparationModifierConsumption\" c
             JOIN \"PreparationModifierBehavior\" b ON b.\"companyId\"=c.\"companyId\" AND b.\"modifierId\"=c.\"modifierId\" AND b.\"mode\"='ADD'
             WHERE c.\"companyId\"=NEW.\"companyId\" AND c.\"modifierId\"=modifier_json->>'id'
           LOOP`;

if(!src.includes(oldGeneric)){
  console.error('[startup] canonical resolver: generic modifier source signature not found');
  process.exit(1);
}
src=src.replace(oldGeneric,newGeneric);

fs.writeFileSync(file,src);
console.log('[startup] canonical preparation resolver active: REPLACE inherits recipe quantity, generic loop consumes ADD only');
