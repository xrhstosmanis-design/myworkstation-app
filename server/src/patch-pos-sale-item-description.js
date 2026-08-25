import fs from "fs";

const path=new URL("./routes/store-pos.js",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const marker="KAT_POS_SALE_ITEM_DESCRIPTION_V2";
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

const cashOld='${`POS πώληση ${saleId} · ΜΕΤΡΗΤΑ`}';
const cashNew='${`POS πώληση ${saleId} · ${itemSummary} · ΜΕΤΡΗΤΑ`}';
const cardOld='${`POS πώληση ${saleId} · ΚΑΡΤΑ ${cardAmount.toFixed(2)} · IRIS ${irisAmount.toFixed(2)}`}';
const cardNew='${`POS πώληση ${saleId} · ${itemSummary} · ΚΑΡΤΑ ${cardAmount.toFixed(2)} · IRIS ${irisAmount.toFixed(2)}`}';
if(!src.includes(cashOld)||!src.includes(cardOld)){
  console.error("POS sale description anchors not found; refusing unsafe partial patch.");
  process.exit(1);
}
src=src.replace(cashOld,cashNew).replace(cardOld,cardNew);

fs.writeFileSync(path,src);
console.log("POS sale transaction descriptions now include sold items.");
