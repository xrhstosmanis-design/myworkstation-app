import fs from "fs";

const path=new URL("./routes/owner-shifts.js",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const marker="OWNER_SHIFTS_TRANSFER_IN_REPORT_V1";
if(src.includes(marker)){
  console.log("Owner shifts transfer-in report already installed.");
  process.exit(0);
}

const moneyNeedle='const moneyFields=["openingDrawer","openingCustody","openingCoins","openingSafe","openingOperational","expectedOpeningOperational","openingVariance","cashSales","cardSales","eftposTotal","cardVariance","expenses","closingDrawer","closingCustody","closingCoins","closingSafe","expectedOperational","actualOperational","variance","nextOpeningTotal","recordedSupplierPayments","recordedOtherExpenses","deductedSupplierPayments","deductedOtherExpenses","percentages"];';
if(!src.includes(moneyNeedle))throw new Error("owner shifts transfer patch: moneyFields anchor not found");
src=src.replace(moneyNeedle,`// ${marker}\nconst moneyFields=["openingDrawer","openingCustody","openingCoins","openingSafe","openingOperational","expectedOpeningOperational","openingVariance","cashSales","cardSales","eftposTotal","cardVariance","expenses","closingDrawer","closingCustody","closingCoins","closingSafe","expectedOperational","actualOperational","variance","nextOpeningTotal","recordedSupplierPayments","recordedOtherExpenses","deductedSupplierPayments","deductedOtherExpenses","percentages","transferIn"];`);

const reportNeedle='        COALESCE(SUM(t."amount") FILTER (WHERE t."type"=\'PERCENTAGES\' AND t."reversedAt" IS NULL),0) AS "percentages"';
if(!src.includes(reportNeedle))throw new Error("owner shifts transfer patch: report aggregate anchor not found");
src=src.replace(reportNeedle,`${reportNeedle},\n        COALESCE(SUM(t."amount") FILTER (WHERE t."type"='TRANSFER_AMOUNT' AND t."reversedAt" IS NULL),0) AS "transferIn"`);

const summaryNeedle='a.expenses+=n(row.expenses);a.variance+=n(row.variance);';
if(!src.includes(summaryNeedle))throw new Error("owner shifts transfer patch: summary anchor not found");
src=src.replace(summaryNeedle,'a.expenses+=n(row.expenses);a.transferIn+=n(row.transferIn);a.variance+=n(row.variance);');
const summaryInitNeedle='{count:0,open:0,closed:0,cashSales:0,cardSales:0,eftpos:0,expenses:0,variance:0,openingVariance:0,cardVariance:0,alerts:0}';
if(!src.includes(summaryInitNeedle))throw new Error("owner shifts transfer patch: summary init anchor not found");
src=src.replace(summaryInitNeedle,'{count:0,open:0,closed:0,cashSales:0,cardSales:0,eftpos:0,expenses:0,transferIn:0,variance:0,openingVariance:0,cardVariance:0,alerts:0}');

const detailNeedle='const recordedSupplierPayments=sum("SUPPLIER_PAYMENT"),recordedOtherExpenses=sum("OTHER_EXPENSE"),deductedSupplierPayments=sum("SUPPLIER_PAYMENT",true),deductedOtherExpenses=sum("OTHER_EXPENSE",true),percentages=sum("PERCENTAGES");';
if(!src.includes(detailNeedle))throw new Error("owner shifts transfer patch: detail aggregate anchor not found");
src=src.replace(detailNeedle,'const recordedSupplierPayments=sum("SUPPLIER_PAYMENT"),recordedOtherExpenses=sum("OTHER_EXPENSE"),deductedSupplierPayments=sum("SUPPLIER_PAYMENT",true),deductedOtherExpenses=sum("OTHER_EXPENSE",true),percentages=sum("PERCENTAGES"),transferIn=sum("TRANSFER_AMOUNT");');

const diffNeedle='cashSales:n(shift.cashSales),cardSales:n(shift.cardSales),eftposTotal:n(shift.eftposTotal),cardVariance:n(shift.cardVariance),recordedSupplierPayments,recordedOtherExpenses,deductedSupplierPayments,deductedOtherExpenses,percentages,';
if(!src.includes(diffNeedle))throw new Error("owner shifts transfer patch: difference anchor not found");
src=src.replace(diffNeedle,'cashSales:n(shift.cashSales),cardSales:n(shift.cardSales),eftposTotal:n(shift.eftposTotal),cardVariance:n(shift.cardVariance),recordedSupplierPayments,recordedOtherExpenses,deductedSupplierPayments,deductedOtherExpenses,percentages,transferIn,');

fs.writeFileSync(path,src);
console.log("Owner shifts transfer-in reporting installed.");
