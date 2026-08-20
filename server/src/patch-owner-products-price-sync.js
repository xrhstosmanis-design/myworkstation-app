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

const anchor='    await prisma.$transaction(async tx=>{\n      let categoryId=null;';
if(!source.includes(anchor)){
  console.error("owner-products price sync patch: anchor not found");
  process.exit(1);
}

const injected=`    ${marker}\n    // A store price that followed the previous base retail price must follow a new\n    // base retail price too. Genuine store-specific overrides are preserved.\n    const previousBasePrice=money(product.salePrice)??0;\n    if(Math.abs(previousBasePrice-body.salePrice)>0.000001){\n      for(const row of body.stores){\n        const currentStorePrice=money(row.salePrice);\n        if(currentStorePrice===null||Math.abs(currentStorePrice-previousBasePrice)<=0.000001){\n          row.salePrice=body.salePrice;\n        }\n      }\n    }\n\n    await prisma.$transaction(async tx=>{\n      let categoryId=null;`;

source=source.replace(anchor,injected);
fs.writeFileSync(target,source,"utf8");
console.log("owner-products price sync patch applied");
