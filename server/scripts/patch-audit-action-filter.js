import fs from "node:fs";

const routePath=new URL("../src/routes/kiosk-reports-audit.js",import.meta.url);
const safeActions="'RETURN','CANCEL','RETURN_ITEMS','SELF_CONSUMPTION','PRODUCT_DESTRUCTION','CART_ITEM_ADD','CART_QTY_CHANGE','CART_ITEM_REMOVE','CART_CANCEL','PRICE_CHANGE','AUDIENCE_DISCOUNT_SELECTED','ITEM_CHANGE_REQUEST','ITEM_EXCHANGE_COMPLETED','HOLD_RESTORE','HOLD_SAVE'";
const before=fs.readFileSync(routePath,"utf8");
const start=before.indexOf('const actionRows=await prisma.$queryRaw`');
const end=start<0?-1:before.indexOf('ORDER BY a."createdAt" DESC LIMIT 10000`;',start);

if(start<0||end<0)throw new Error("Central Audit action query was not found; refusing to patch an unknown source shape.");

const prefix=before.slice(0,start),block=before.slice(start,end),suffix=before.slice(end);
const filter=`\n        AND a."actionType" IN (${safeActions})`;
let nextBlock=block;
const existing=/\n\s*AND a\."actionType" IN \([\s\S]*?\)(?=\n\s*AND a\."createdAt")/;

if(existing.test(nextBlock)){
  nextBlock=nextBlock.replace(existing,filter);
}else{
  const companyScope=/(\n\s*WHERE \(\$\{companyId\}::text IS NULL OR a\."companyId"=\$\{companyId\}\))/;
  if(!companyScope.test(nextBlock))throw new Error("Central Audit company scope was not found; refusing an unsafe filter insertion.");
  nextBlock=nextBlock.replace(companyScope,`$1${filter}`);
}

const after=`${prefix}${nextBlock}${suffix}`;
if(after!==before){
  fs.writeFileSync(routePath,after,"utf8");
  console.log("Central Audit POS action allow-list patched without WASTE duplication.");
}else{
  console.log("Central Audit POS action allow-list already safe.");
}
