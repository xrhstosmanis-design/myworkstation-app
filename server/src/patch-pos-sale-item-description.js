import fs from "fs";

const path=new URL("./routes/store-pos.js",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const marker="KAT_POS_SALE_ITEM_DESCRIPTION_V1";
if(src.includes(marker)){
  console.log("POS sale item description patch already installed.");
  process.exit(0);
}

const anchor='      for(const payment of payments)await tx.$executeRaw`INSERT INTO "Payment" ("id","saleId","method","amount") VALUES (${crypto.randomUUID()},${saleId},${payment.method},${money(payment.amount)})`;';
const replacement=anchor+'\n      // '+marker+'\n      const itemSummary=items.map(item=>`${Number(item.quantity||0).toLocaleString("el-GR")}× ${item.name}`).join(" + ");';
if(!src.includes(anchor)){
  console.error("POS sale item summary anchor not found; refusing unsafe partial patch.");
  process.exit(1);
}
src=src.replace(anchor,replacement);

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
