import fs from 'fs';

const file='server/src/routes/store-preparation.js';
let src=fs.readFileSync(file,'utf8');
const old=`         milk_modifier_id:=NULL;milk_target_ingredient_id:=NULL;milk_target_unit:=NULL;milk_fallback_qty:=NULL;milk_base_qty:=0;
         SELECT m.\"id\",c.\"ingredientProductId\",c.\"unit\",c.\"quantity\" INTO milk_modifier_id,milk_target_ingredient_id,milk_target_unit,milk_fallback_qty
         FROM jsonb_array_elements(COALESCE(prep_item->'modifiers','[]'::jsonb)) j
         JOIN \"ManagementModifier\" m ON m.\"id\"=j->>'id' AND m.\"companyId\"=NEW.\"companyId\" AND m.\"active\"=TRUE
         JOIN \"PreparationModifierConsumption\" c ON c.\"companyId\"=m.\"companyId\" AND c.\"modifierId\"=m.\"id\"
         JOIN \"Product\" ip ON ip.\"id\"=c.\"ingredientProductId\" AND ip.\"companyId\"=c.\"companyId\" AND ip.\"active\"=TRUE
         WHERE ip.\"sku\" LIKE 'MWS-PREP-MILK-%' AND ip.\"sku\" <> 'MWS-PREP-MILK' LIMIT 1;`;
const next=`         milk_modifier_id:=NULL;milk_target_ingredient_id:=NULL;milk_target_unit:='ML';milk_fallback_qty:=NULL;milk_base_qty:=0;
         SELECT m.\"id\",ip.\"id\" INTO milk_modifier_id,milk_target_ingredient_id
         FROM jsonb_array_elements(COALESCE(prep_item->'modifiers','[]'::jsonb)) j
         JOIN \"ManagementModifier\" m ON m.\"id\"=j->>'id' AND m.\"companyId\"=NEW.\"companyId\" AND m.\"active\"=TRUE
         JOIN \"ManagementModifierGroup\" g ON g.\"id\"=m.\"groupId\" AND g.\"companyId\"=m.\"companyId\" AND UPPER(g.\"description\")='ΓΑΛΑ'
         JOIN \"Product\" ip ON ip.\"companyId\"=m.\"companyId\" AND ip.\"active\"=TRUE AND ip.\"sku\"=CASE UPPER(m.\"description\")
           WHEN 'ΧΩΡΙΣ ΛΑΚΤΟΖΗ' THEN 'MWS-PREP-MILK-LF'
           WHEN 'ΓΑΛΑ ΑΜΥΓΔΑΛΟΥ' THEN 'MWS-PREP-MILK-ALMOND'
           WHEN 'ΓΑΛΑ ΒΡΩΜΗΣ' THEN 'MWS-PREP-MILK-OAT'
           WHEN 'ΓΑΛΑ ΣΟΓΙΑΣ' THEN 'MWS-PREP-MILK-SOY'
           WHEN 'ΓΑΛΑ ΕΒΑΠΟΡΕ' THEN 'MWS-PREP-MILK-EVAP'
           ELSE '__NO_MILK_SUBSTITUTION__' END
         LIMIT 1;`;
if(!src.includes(old)){
  console.error('[startup] preparation resolver source signature not found');
  process.exit(1);
}
src=src.replace(old,next);
fs.writeFileSync(file,src);
console.log('[startup] preparation resolver source patched: milk modifiers resolve as recipe substitution');
