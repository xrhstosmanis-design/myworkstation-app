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

  const toValues=s=>(String(s||"").match(/-?\\d+(?:[.,]\\d+)?/g)||[]).map(x=>Number(x.replace(",","."))).filter(Number.isFinite);
  const after=toValues(marker[1]);
  if(!after.length)return null;

  // Azure sometimes wraps the right-hand columns before the TEM marker.
  // Keep only the last few numeric cells from the prefix so product codes/pack sizes cannot drive the math.
  const prefix=text.slice(0,marker.index||0);
  const before=toValues(prefix).slice(-5);
  const all=[...after,...before];
  const close=(a,b,tol=Math.max(0.03,Math.abs(Number(b||0))*0.015))=>Math.abs(Number(a||0)-Number(b||0))<=tol;
  const canonicalVat=new Set([0,6,13,24]);
  const qHint=Math.max(0,Number(quantityHint||0));

  let best=null;
  const priceCandidates=[];
  if(qHint>0){
    for(let i=0;i<Math.min(after.length,5);i++)priceCandidates.push({q:qHint,price:after[i],priceIndex:i,bonus:30});
  }
  if(after.length>=2&&after[0]>0&&Number.isInteger(after[0])&&after[0]<=10000){
    priceCandidates.push({q:after[0],price:after[1],priceIndex:1,bonus:qHint>0&&close(after[0],qHint,0.001)?40:10});
  }

  // A price is accepted only when quantity × price matches an actual line amount.
  for(const c of priceCandidates){
    if(!(c.q>0&&c.price>0))continue;
    const expected=c.q*c.price;
    for(let j=0;j<after.length;j++){
      if(j===c.priceIndex||!close(after[j],expected))continue;
      const distance=Math.abs(j-c.priceIndex);
      const score=150+c.bonus-distance;
      if(!best||score>best.score)best={score,quantity:c.q,unitPrice:c.price,initialAmount:after[j],amountIndex:j,priceIndex:c.priceIndex};
    }
  }
  if(!best)return null;

  // VAT can be after the row or in a wrapped prefix. Prefer canonical values near the row edges.
  let vatRate=0;
  for(const v of [...after.slice().reverse(),...before.slice().reverse()]){
    const n=Math.round(Math.abs(v));
    if(canonicalVat.has(n)){vatRate=n;break}
  }

  const excluded=[];
  const consume=value=>{const i=all.findIndex((v,idx)=>!excluded.includes(idx)&&close(v,value,0.001));if(i>=0)excluded.push(i)};
  consume(best.quantity);consume(best.unitPrice);consume(best.initialAmount);if(vatRate)consume(vatRate);

  let discountMatch=null;
  const candidates=all.map((v,i)=>({v:Math.abs(Number(v||0)),i})).filter(x=>!excluded.includes(x.i)&&x.v>0&&x.v<100);
  for(const candidate of candidates){
    const pct=candidate.v;
    const predictedDiscount=best.initialAmount*pct/100;
    const predictedNet=best.initialAmount-predictedDiscount;
    const amountToken=all.find((v,i)=>i!==candidate.i&&!excluded.includes(i)&&close(v,predictedDiscount,Math.max(0.03,predictedDiscount*0.03)));
    const netToken=all.find((v,i)=>i!==candidate.i&&!excluded.includes(i)&&v!==amountToken&&close(v,predictedNet,Math.max(0.03,predictedNet*0.02)));
    if(amountToken!==undefined&&netToken!==undefined){
      const error=Math.abs(amountToken-predictedDiscount)+Math.abs(netToken-predictedNet);
      if(!discountMatch||error<discountMatch.error)discountMatch={pct,net:netToken,error};
    }
  }

  let discount1=0,discount2=0,discount3=0,netAmount=best.initialAmount;
  if(discountMatch){
    discount1=money4(discountMatch.pct);
    netAmount=money4(discountMatch.net);
  }else{
    // No discount is accepted unless both its amount and resulting net are present and reconcile.
    // This deliberately avoids turning arbitrary monetary cells into percentages.
    netAmount=money4(best.initialAmount);
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
const nextDiscount='    const verifiedAzureDiscounts=discounts.length&&discountsReconcile(discounts,unitPrice,quantity,netAmount)?discounts:[];\n    const discount1=rowFallback?.mathValidated?rowFallback.discount1:(verifiedAzureDiscounts[0]||0),discount2=rowFallback?.mathValidated?rowFallback.discount2:(verifiedAzureDiscounts[1]||0),discount3=rowFallback?.mathValidated?rowFallback.discount3:(verifiedAzureDiscounts[2]||0);';
if(!server.includes(oldDiscount))throw new Error("Azure discount anchor missing.");
server=server.replace(oldDiscount,nextDiscount);

const oldReturn='    return {supplierItemCode,description,quantity,unit:textField(p.Unit)||textField(p.UnitOfMeasure)||"",unitsPerPackage,unitPrice,discount1,discount2,discount3,netUnitCost,netAmount,vatRate,grossAmount,barcode:"",confidence,azureSequence:index+1,azureRawRow:String(item?.content||""),ocrHintUsed:false,discountValidated:Boolean(discounts.length)};';
const nextReturn='    return {supplierItemCode,description,quantity,unit:textField(p.Unit)||textField(p.UnitOfMeasure)||rowFallback?.unit||"ΤΜΧ",unitsPerPackage,unitPrice,discount1,discount2,discount3,netUnitCost,netAmount,vatRate,grossAmount,barcode:"",confidence,azureSequence:index+1,azureRawRow:String(item?.content||""),ocrHintUsed:false,azureRowFallbackUsed:Boolean(rowFallback),azureRowMathValidated:Boolean(rowFallback?.mathValidated),discountValidated:Boolean(rowFallback?.mathValidated?rowFallback.discount1:verifiedAzureDiscounts.length)};';
if(!server.includes(oldReturn))throw new Error("Azure return-line anchor missing.");
server=server.replace(oldReturn,nextReturn);

fs.writeFileSync(serverPath,server,"utf8");
console.log("Invoice Learning patched: wrapped Azure rows reconcile quantity, price, discount amount, net value and VAT across both sides of TEM.");
