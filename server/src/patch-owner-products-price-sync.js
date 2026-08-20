import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";

const here=path.dirname(fileURLToPath(import.meta.url));
const target=path.join(here,"routes","owner-products.js");
const marker="/* MWS_STORE_PRICE_SYNC_V1 */";
let source=fs.readFileSync(target,"utf8");

if(source.includes(marker)){
  console.log("owner-products price sync patch already applied");
  process.exit(0);
}

const routeMarker='router.patch("/:productId/card"';
const routeStart=source.indexOf(routeMarker);
if(routeStart<0){
  console.error("owner-products price sync patch: product-card route not found");
  process.exit(1);
}

const anchor='    await prisma.$transaction(async tx=>{\n      let categoryId=null;';
const anchorIndex=source.indexOf(anchor,routeStart);
if(anchorIndex<0){
  console.error("owner-products price sync patch: card transaction anchor not found");
  process.exit(1);
}

const injected=`    ${marker}\n    // If a store followed the old base retail price, keep it aligned with the new\n    // base retail price. Deliberate store-specific overrides stay untouched.\n    const previousBasePrice=money(product.salePrice)??0;\n    if(Math.abs(previousBasePrice-body.salePrice)>0.000001){\n      for(const row of body.stores){\n        const currentStorePrice=money(row.salePrice);\n        if(currentStorePrice===null||Math.abs(currentStorePrice-previousBasePrice)<=0.000001){\n          row.salePrice=body.salePrice;\n        }\n      }\n    }\n\n    await prisma.$transaction(async tx=>{\n      let categoryId=null;`;

source=source.slice(0,anchorIndex)+injected+source.slice(anchorIndex+anchor.length);
fs.writeFileSync(target,source,"utf8");
console.log("owner-products price sync patch applied");
