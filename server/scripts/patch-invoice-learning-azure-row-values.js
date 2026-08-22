import fs from "node:fs";

const serverPath=new URL("../src/routes/platform-invoice-learning-ai.js",import.meta.url);
let server=fs.readFileSync(serverPath,"utf8");

const anchor='function normalizeAzure(payload){';
if(!server.includes(anchor))throw new Error("Azure row-value patch requires Azure/AI-only patch first.");

const helper=`function parseAzureGreekProductRow(content=""){
  const text=String(content||"").replace(/\\s+/g," ").trim();
  if(!text)return null;
  const marker=text.match(/(?:^|\\s)(?:ΤΕΜ|ΤΜΧ|TEM|PCS)\\s+(.+)$/i);
  if(!marker)return null;
  const values=(marker[1].match(/-?\\d+(?:[.,]\\d+)?/g)||[]).map(x=>Number(x.replace(",","."))).filter(Number.isFinite);
  if(values.length<4)return null;
  const quantity=Math.max(0,values[0]||0),unitPrice=Math.max(0,values[1]||0);
  let vatRate=0,netAmount=0,discount1=0,discount2=0,discount3=0;
  const last=Math.round(Math.abs(values.at(-1)||0));
  if([0,6,13,24].includes(last))vatRate=last;
  const end=vatRate?values.length-1:values.length;
  if(end>=3)netAmount=Math.max(0,values[end-1]||0);
  const middle=values.slice(3,Math.max(3,end-1));
  const discounts=[];
  for(let i=0;i<middle.length;i+=2){const d=Math.abs(Number(middle[i]||0));if(d>0&&d<100)discounts.push(d)}
  [discount1,discount2,discount3]=[discounts[0]||0,discounts[1]||0,discounts[2]||0];
  const grossAmount=netAmount>0?money4(netAmount*(1+vatRate/100)):0;
  return {quantity,unitPrice,discount1,discount2,discount3,netAmount,vatRate,grossAmount,unit:"ΤΜΧ"};
}

`;
server=server.replace(anchor,helper+anchor);

const old='    const quantity=Math.max(0,numberField(p.Quantity));const unitPrice=Math.max(0,numberField(p.UnitPrice));const netAmount=Math.max(0,numberField(p.Amount));const tax=Math.max(0,numberField(p.Tax));\n    let vatRate=Math.max(0,numberField(p.TaxRate));if(![0,6,13,24].includes(Math.round(vatRate)))vatRate=0;else vatRate=Math.round(vatRate);';
const next='    const rowFallback=parseAzureGreekProductRow(item?.content||"");\n    const quantity=Math.max(0,numberField(p.Quantity)||rowFallback?.quantity||0);let unitPrice=Math.max(0,numberField(p.UnitPrice)||rowFallback?.unitPrice||0);let netAmount=Math.max(0,numberField(p.Amount)||rowFallback?.netAmount||0);const tax=Math.max(0,numberField(p.Tax));\n    let vatRate=Math.max(0,numberField(p.TaxRate)||rowFallback?.vatRate||0);if(![0,6,13,24].includes(Math.round(vatRate)))vatRate=0;else vatRate=Math.round(vatRate);';
if(!server.includes(old))throw new Error("Azure numeric line anchor missing.");
server=server.replace(old,next);

const oldDiscount='    const discount1=discounts[0]||0,discount2=discounts[1]||0,discount3=discounts[2]||0;';
const nextDiscount='    const discount1=discounts[0]||rowFallback?.discount1||0,discount2=discounts[1]||rowFallback?.discount2||0,discount3=discounts[2]||rowFallback?.discount3||0;';
if(!server.includes(oldDiscount))throw new Error("Azure discount anchor missing.");
server=server.replace(oldDiscount,nextDiscount);

const oldReturn='    return {supplierItemCode,description,quantity,unit:textField(p.Unit)||textField(p.UnitOfMeasure)||"",unitsPerPackage,unitPrice,discount1,discount2,discount3,netUnitCost,netAmount,vatRate,grossAmount,barcode:"",confidence,azureSequence:index+1,azureRawRow:String(item?.content||""),ocrHintUsed:false,discountValidated:Boolean(discounts.length)};';
const nextReturn='    return {supplierItemCode,description,quantity,unit:textField(p.Unit)||textField(p.UnitOfMeasure)||rowFallback?.unit||"ΤΜΧ",unitsPerPackage,unitPrice,discount1,discount2,discount3,netUnitCost,netAmount,vatRate,grossAmount,barcode:"",confidence,azureSequence:index+1,azureRawRow:String(item?.content||""),ocrHintUsed:false,azureRowFallbackUsed:Boolean(rowFallback),discountValidated:Boolean(discounts.length||discount1||discount2||discount3)};';
if(!server.includes(oldReturn))throw new Error("Azure return-line anchor missing.");
server=server.replace(oldReturn,nextReturn);

fs.writeFileSync(serverPath,server,"utf8");
console.log("Invoice Learning patched: Azure row content fills quantity, price, discounts, net and VAT when prebuilt fields are missing.");
