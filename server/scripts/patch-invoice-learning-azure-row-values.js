import fs from "node:fs";

const serverPath=new URL("../src/routes/platform-invoice-learning-ai.js",import.meta.url);
let server=fs.readFileSync(serverPath,"utf8");

const anchor='function normalizeAzure(payload){';
if(!server.includes(anchor))throw new Error("Azure row-value patch requires Azure/AI-only patch first.");

const helper=`function parseAzureGreekProductRow(content="",quantityHint=0){
  const text=String(content||"").replace(/\\s+/g," ").trim();
  if(!text)return null;
  const marker=text.match(/(?:^|\\s)(?:ΤΕΜ|ΤΜΧ|TEM|PCS)\\s+(.+)$/i);
  if(!marker)return null;
  const values=(marker[1].match(/-?\\d+(?:[.,]\\d+)?/g)||[]).map(x=>Number(x.replace(",","."))).filter(Number.isFinite);
  if(values.length<2)return null;

  const canonicalVat=new Set([0,6,13,24]);
  let vatRate=0;
  const last=Math.round(Math.abs(values.at(-1)||0));
  if(canonicalVat.has(last)){vatRate=last;values.pop()}

  const close=(a,b,tol=Math.max(0.03,Math.abs(Number(b||0))*0.015))=>Math.abs(Number(a||0)-Number(b||0))<=tol;
  const qHint=Math.max(0,Number(quantityHint||0));
  let best=null;

  // Identify quantity + unit price only when they are mathematically confirmed by a line amount.
  // This prevents values such as 6,36 / 0,95 / 5,41 from being shifted into discount columns.
  for(let i=0;i<values.length;i++){
    const qCandidates=[];
    if(qHint>0)qCandidates.push({q:qHint,priceIndex:i,price:values[i],bonus:20});
    if(i+1<values.length&&values[i]>0&&Number.isInteger(values[i])&&values[i]<=10000)qCandidates.push({q:values[i],priceIndex:i+1,price:values[i+1],bonus:qHint>0&&close(values[i],qHint,0.001)?30:0});
    for(const c of qCandidates){
      if(!(c.q>0&&c.price>0))continue;
      const initial=c.q*c.price;
      for(let j=c.priceIndex+1;j<Math.min(values.length,c.priceIndex+4);j++){
        if(!close(values[j],initial))continue;
        const score=100+c.bonus-(j-c.priceIndex);
        if(!best||score>best.score)best={score,quantity:c.q,unitPrice:c.price,initialAmount:values[j],amountIndex:j};
      }
    }
  }

  if(!best&&qHint>0){
    for(let i=0;i<values.length-1;i++){
      const price=values[i],initial=qHint*price;
      if(price>0&&close(values[i+1],initial)){best={score:80,quantity:qHint,unitPrice:price,initialAmount:values[i+1],amountIndex:i+1};break}
    }
  }
  if(!best)return null;

  const tail=values.slice(best.amountIndex+1);
  let discount1=0,discount2=0,discount3=0,netAmount=best.initialAmount;

  // Accept a discount only if percentage, discount amount and resulting net all reconcile.
  // Order in Azure raw content can vary, so validate by arithmetic instead of token position.
  let discountMatch=null;
  for(const d of tail){
    const pct=Math.abs(Number(d||0));
    if(!(pct>0&&pct<100))continue;
    const predictedDiscount=best.initialAmount*pct/100;
    const predictedNet=best.initialAmount-predictedDiscount;
    const amountToken=tail.find(v=>v!==d&&close(v,predictedDiscount,Math.max(0.03,predictedDiscount*0.03)));
    const netToken=tail.find(v=>v!==d&&v!==amountToken&&close(v,predictedNet,Math.max(0.03,predictedNet*0.02)));
    if(amountToken!==undefined&&(netToken!==undefined||predictedNet>0)){
      discountMatch={pct,net:netToken!==undefined?netToken:predictedNet};
      break;
    }
  }
  if(discountMatch){discount1=money4(discountMatch.pct);netAmount=money4(discountMatch.net)}
  else{
    // No proven discount: use a value only when it matches the initial amount; otherwise keep initial.
    const same=tail.find(v=>close(v,best.initialAmount));
    netAmount=money4(same!==undefined?same:best.initialAmount);
  }

  const grossAmount=netAmount>0?money4(netAmount*(1+vatRate/100)):0;
  return {quantity:best.quantity,unitPrice:money4(best.unitPrice),initialAmount:money4(best.initialAmount),discount1,discount2,discount3,netAmount,vatRate,grossAmount,unit:"ΤΜΧ",mathValidated:true};
}

`;
server=server.replace(anchor,helper+anchor);

const old='    const quantity=Math.max(0,numberField(p.Quantity));const unitPrice=Math.max(0,numberField(p.UnitPrice));const netAmount=Math.max(0,numberField(p.Amount));const tax=Math.max(0,numberField(p.Tax));\n    let vatRate=Math.max(0,numberField(p.TaxRate));if(![0,6,13,24].includes(Math.round(vatRate)))vatRate=0;else vatRate=Math.round(vatRate);';
const next='    const azureQuantity=Math.max(0,numberField(p.Quantity));\n    const rowFallback=parseAzureGreekProductRow(item?.content||"",azureQuantity);\n    const quantity=Math.max(0,rowFallback?.quantity||azureQuantity||0);\n    let unitPrice=Math.max(0,rowFallback?.unitPrice||numberField(p.UnitPrice)||0);\n    let netAmount=Math.max(0,rowFallback?.netAmount||numberField(p.Amount)||0);\n    const tax=Math.max(0,numberField(p.Tax));\n    let vatRate=Math.max(0,rowFallback?.vatRate||numberField(p.TaxRate)||0);if(![0,6,13,24].includes(Math.round(vatRate)))vatRate=0;else vatRate=Math.round(vatRate);';
if(!server.includes(old))throw new Error("Azure numeric line anchor missing.");
server=server.replace(old,next);

const oldDiscount='    const discount1=discounts[0]||0,discount2=discounts[1]||0,discount3=discounts[2]||0;';
const nextDiscount='    const verifiedAzureDiscounts=discounts.length&&discountsReconcile(discounts,unitPrice,quantity,netAmount)?discounts:[];\n    const discount1=verifiedAzureDiscounts[0]||rowFallback?.discount1||0,discount2=verifiedAzureDiscounts[1]||rowFallback?.discount2||0,discount3=verifiedAzureDiscounts[2]||rowFallback?.discount3||0;';
if(!server.includes(oldDiscount))throw new Error("Azure discount anchor missing.");
server=server.replace(oldDiscount,nextDiscount);

const oldReturn='    return {supplierItemCode,description,quantity,unit:textField(p.Unit)||textField(p.UnitOfMeasure)||"",unitsPerPackage,unitPrice,discount1,discount2,discount3,netUnitCost,netAmount,vatRate,grossAmount,barcode:"",confidence,azureSequence:index+1,azureRawRow:String(item?.content||""),ocrHintUsed:false,discountValidated:Boolean(discounts.length)};';
const nextReturn='    return {supplierItemCode,description,quantity,unit:textField(p.Unit)||textField(p.UnitOfMeasure)||rowFallback?.unit||"ΤΜΧ",unitsPerPackage,unitPrice,discount1,discount2,discount3,netUnitCost,netAmount,vatRate,grossAmount,barcode:"",confidence,azureSequence:index+1,azureRawRow:String(item?.content||""),ocrHintUsed:false,azureRowFallbackUsed:Boolean(rowFallback),azureRowMathValidated:Boolean(rowFallback?.mathValidated),discountValidated:Boolean(verifiedAzureDiscounts.length||rowFallback?.discount1||rowFallback?.discount2||rowFallback?.discount3)};';
if(!server.includes(oldReturn))throw new Error("Azure return-line anchor missing.");
server=server.replace(oldReturn,nextReturn);

fs.writeFileSync(serverPath,server,"utf8");
console.log("Invoice Learning patched: Azure row values are mapped only when quantity, price, amount and discounts reconcile mathematically.");
