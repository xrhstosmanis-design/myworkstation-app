import fs from "fs";

const path=new URL("./routes/store-pos.js",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const marker="KAT_POS_SALE_ITEM_DESCRIPTION_V3";
if(src.includes(marker)){
  console.log("POS sale item description patch already installed.");
  process.exit(0);
}

const cashNeedle='if(cashAmount>0)await tx.$executeRaw`INSERT INTO "StoreTransaction"';
const cashIndex=src.indexOf(cashNeedle);
if(cashIndex<0){
  console.error("POS cash StoreTransaction anchor not found; refusing unsafe partial patch.");
  process.exit(1);
}
const lineStart=src.lastIndexOf("\n",cashIndex)+1;
const insertion='      // '+marker+'\n      const itemSummary=items.map(item=>`${Number(item.quantity||0).toLocaleString("el-GR")}× ${item.name}`).join(" + ");\n';
src=src.slice(0,lineStart)+insertion+src.slice(lineStart);

// Runtime patches may change the payment suffix, so only anchor on the stable
// sale-description prefix and preserve whatever CASH/CARD/IRIS text follows it.
const stablePrefix='POS πώληση ${saleId}';
const occurrences=src.split(stablePrefix).length-1;
if(occurrences<2){
  console.error(`POS sale description prefix found ${occurrences} time(s); refusing unsafe partial patch.`);
  process.exit(1);
}
src=src.replaceAll(stablePrefix,'POS πώληση ${saleId} · ${itemSummary}');

fs.writeFileSync(path,src);
console.log(`POS sale transaction descriptions now include sold items (${occurrences} descriptions patched).`);
