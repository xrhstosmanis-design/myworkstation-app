import fs from 'fs';

const file='server/src/kat-preparation-cleanup.js';
let src=fs.readFileSync(file,'utf8');
const marker="if(groupName==='ΓΑΛΑ'||(groupName==='EXTRA'&&modifierName==='DECAF'))continue;";
if(src.includes(marker)){
  console.log('[startup] KAT cleanup REPLACE guard already present');
  process.exit(0);
}
const needle=' for(const [groupName,modifierName,ingredientSku,quantity,unit] of MODIFIER_TARGETS){';
if(!src.includes(needle)){
  console.error('[startup] KAT cleanup modifier loop signature not found');
  process.exit(1);
}
src=src.replace(needle,`${needle}\n  // REPLACE modifiers inherit quantity from the recipe. Never recreate fixed consumption for them.\n  if(groupName==='ΓΑΛΑ'||(groupName==='EXTRA'&&modifierName==='DECAF'))continue;`);
fs.writeFileSync(file,src);
console.log('[startup] KAT cleanup patched: REPLACE modifiers will not recreate fixed consumption rows');
