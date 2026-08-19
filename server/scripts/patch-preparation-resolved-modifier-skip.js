import fs from 'fs';

const file='server/src/routes/store-preparation.js';
let src=fs.readFileSync(file,'utf8');
const marker="IF milk_modifier_id IS NOT NULL AND COALESCE(modifier_json->>'id','')=milk_modifier_id THEN CONTINUE; END IF;";
if(src.includes(marker)){
  console.log('[startup] resolved modifier skip already present');
  process.exit(0);
}
const needle="           IF COALESCE(modifier_json->>'id','') = '' OR COALESCE(modifier_json->>'id','') LIKE 'synthetic-%' THEN CONTINUE; END IF;";
const replacement=`${needle}\n           -- Modifiers already resolved into the final recipe must not be consumed again by the generic modifier loop.\n           IF milk_modifier_id IS NOT NULL AND COALESCE(modifier_json->>'id','')=milk_modifier_id THEN CONTINUE; END IF;\n           IF decaf_modifier_id IS NOT NULL AND COALESCE(modifier_json->>'id','')=decaf_modifier_id THEN CONTINUE; END IF;\n           IF extra_modifier_id IS NOT NULL AND COALESCE(modifier_json->>'id','')=extra_modifier_id THEN CONTINUE; END IF;`;
if(!src.includes(needle)){
  console.error('[startup] generic modifier loop signature not found');
  process.exit(1);
}
src=src.replace(needle,replacement);
fs.writeFileSync(file,src);
console.log('[startup] generic modifier loop patched: resolved REPLACE/ADD modifiers are consumed once');
