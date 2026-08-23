import fs from "node:fs";

const serverPath=new URL("../src/routes/platform-invoice-learning-ai.js",import.meta.url);
let server=fs.readFileSync(serverPath,"utf8");

const normalizeAnchor=server.includes('function normalizeAzure(payload){')
  ? 'function normalizeAzure(payload){'
  : server.includes('function normalizeAzure(payload,ocrRows=[]){')
    ? 'function normalizeAzure(payload,ocrRows=[]){'
    : null;
if(!normalizeAnchor)throw new Error("Azure normalize anchor missing.");

const start=server.indexOf('function supplierAzureProfile(')>=0
  ? server.indexOf('function supplierAzureProfile(')
  : server.indexOf('function parseAzureGreekProductRow(');
const end=start>=0?server.indexOf(`\n${normalizeAnchor}`,start):-1;

const helper=`function supplierAzureProfile(supplierName="",supplierTaxId=""){
  const name=norm(supplierName),tax=String(supplierTaxId||"").replace(/\\D/g,"");
  const isIfantis=tax==="094095506"||/IFANTISFOODGROUP|IFANTIS/.test(name);
  return {leadingDecimalPrice:/ΜΑΡΟΣ|MAROS/.test(name),ifantisBrokenPrice:isIfantis};
}
function parseAzureGreekProductRow(content="",quantityHint=0,profile={}){
  const text=String(content||"").replace(/\\s+/g," ").trim();if(!text)return null;
  const numericPattern=profile.leadingDecimalPrice?/-?(?:\\d+(?:[.,]\\d+)?|[.,]\\d+)/g:/-?\\d+(?:[.,]\\d+)?/g;
  const toValues=s=>(String(s||"").match(numericPattern)||[]).map(x=>{const raw=String(x).trim();const normalized=profile.leadingDecimalPrice&&/^-?[.,]\\d+$/.test(raw)?raw.replace(/^(-?)([.,])/,'$10.'):raw.replace(",",".");return Number(normalized)}).filter(Number.isFinite);
  const qHint=Math.max(0,Number(quantityHint||0)),marker=text.match(/(?:^|\\s)(?:ΤΕΜ|ΤΜΧ|TEM|PCS|EM)\\s+(.+)$/i);let after=[],before=[],markerBroken=false;
  if(marker){after=toValues(marker[1]);if(!after.length)return null;before=toValues(text.slice(0,marker.index||0)).slice(-6)}else{if(!(qHint>0))return null;after=toValues(text).slice(-12);if(after.length<4)return null;markerBroken=true}
  const all=[...after,...before],close=(a,b,tol=Math.max(.03,Math.abs(Number(b||0))*.015))=>Math.abs(Number(a||0)-Number(b||0))<=tol;
  const discountEvidence=(initial,skip=[])=>{let best=null;for(let i=0;i<all.length;i++){if(skip.includes(i))continue;const pct=Math.abs(Number(all[i]||0));if(!(pct>0&&pct<100))continue;const da=initial*pct/100,net=initial-da;for(let a=0;a<all.length;a++){if(a===i||skip.includes(a)||!close(all[a],da,Math.max(.03,da*.03)))continue;for(let n=0;n<all.length;n++){if(n===i||n===a||skip.includes(n)||!close(all[n],net,Math.max(.03,net*.02)))continue;const error=Math.abs(all[a]-da)+Math.abs(all[n]-net);if(!best||error<best.error)best={pct,net:all[n],error}}}}return best};

  if(profile.ifantisBrokenPrice&&qHint>0){
    let bestIfantis=null;
    const commonDiscounts=[0,5,10,15,20,25,30,35,40,45,50];
    const afterCount=after.length;
    for(let i=0;i<all.length;i++){
      const initial=Number(all[i]||0);if(!(initial>0&&initial<=qHint*100))continue;
      const unitPrice=initial/qHint;if(!(unitPrice>=.05&&unitPrice<=100))continue;
      for(let d=0;d<all.length;d++){
        if(d===i)continue;const discountAmount=Math.abs(Number(all[d]||0));if(!(discountAmount>=0&&discountAmount<=initial))continue;
        for(let n=0;n<all.length;n++){
          if(n===i||n===d)continue;const net=Number(all[n]||0);if(!(net>=0&&net<=initial))continue;
          if(!close(initial-discountAmount,net,Math.max(.03,initial*.008)))continue;
          const pct=initial>0?discountAmount/initial*100:0;
          const nearest=commonDiscounts.reduce((a,b)=>Math.abs(b-pct)<Math.abs(a-pct)?b:a,0);
          if(Math.abs(pct-nearest)>.45)continue;
          // Prefer the real IFANTIS layout: initial/discount after TEM and net may wrap before TEM.
          // Penalize obvious product-code/weight artifacts and implausible unit prices.
          let score=1000-Math.abs(pct-nearest)*100-Math.abs((initial-discountAmount)-net)*200;
          if(i<afterCount)score+=45;if(d<afterCount)score+=35;if(n>=afterCount)score+=25;
          if(unitPrice>=.3&&unitPrice<=20)score+=30;
          if(initial===qHint||discountAmount===qHint||net===qHint)score-=80;
          if(initial>500||discountAmount>500||net>500)score-=500;
          if(!bestIfantis||score>bestIfantis.score)bestIfantis={score,quantity:qHint,unitPrice,initialAmount:initial,discount1:nearest,netAmount:net};
        }
      }
    }
    if(bestIfantis){
      let vatRate=0;for(const v of [...after].reverse().concat([...before].reverse())){const n=Math.round(Math.abs(v));if([6,13,24].includes(n)){vatRate=n;break}}
      return {quantity:bestIfantis.quantity,unitPrice:money4(bestIfantis.unitPrice),initialAmount:money4(bestIfantis.initialAmount),discount1:money4(bestIfantis.discount1),discount2:0,discount3:0,netAmount:money4(bestIfantis.netAmount),vatRate,grossAmount:bestIfantis.netAmount>0?money4(bestIfantis.netAmount*(1+vatRate/100)):0,unit:"ΤΜΧ",mathValidated:true,markerRecovered:markerBroken,supplierProfileApplied:true,ifantisRecovered:true};
    }
  }

  let best=null;const pcs=[];
  if(qHint>0)for(let i=0;i<Math.min(after.length,8);i++)pcs.push({q:qHint,price:after[i],pi:i,bonus:30});
  if(!markerBroken&&after.length>=2&&after[0]>0&&Number.isInteger(after[0]))pcs.push({q:after[0],price:after[1],pi:1,bonus:qHint>0&&close(after[0],qHint,.001)?40:10});
  for(const c of pcs){if(!(c.q>0&&c.price>0))continue;const expected=c.q*c.price;for(let j=c.pi+1;j<after.length;j++){if(!close(after[j],expected))continue;const evidence=discountEvidence(after[j],[c.pi,j]);const score=150+c.bonus+(evidence?120-Math.min(20,evidence.error*100):0)+(Math.abs(c.price-Math.round(c.price))>.0001?4:0)-Math.abs(j-c.pi);if(!best||score>best.score)best={score,quantity:c.q,unitPrice:c.price,initialAmount:after[j],amountIndex:j,priceIndex:c.pi,evidence}}}
  if(!best||(markerBroken&&!best.evidence))return null;
  let vatRate=0;for(const v of [...after].reverse().concat([...before].reverse())){const n=Math.round(Math.abs(v));if([6,13,24].includes(n)){vatRate=n;break}}
  const d=best.evidence||discountEvidence(best.initialAmount,[best.priceIndex,best.amountIndex]),discount1=d?money4(d.pct):0,netAmount=d?money4(d.net):money4(best.initialAmount);
  return {quantity:best.quantity,unitPrice:money4(best.unitPrice),initialAmount:money4(best.initialAmount),discount1,discount2:0,discount3:0,netAmount,vatRate,grossAmount:netAmount>0?money4(netAmount*(1+vatRate/100)):0,unit:"ΤΜΧ",mathValidated:true,markerRecovered:markerBroken,supplierProfileApplied:Boolean(profile.leadingDecimalPrice)};
}
`;

if(start>=0&&end>start)server=server.slice(0,start)+helper+server.slice(end+1);
else server=server.replace(normalizeAnchor,helper+'\n'+normalizeAnchor);

const originalNumeric='    const quantity=Math.max(0,numberField(p.Quantity));const unitPrice=Math.max(0,numberField(p.UnitPrice));const netAmount=Math.max(0,numberField(p.Amount));const tax=Math.max(0,numberField(p.Tax));\n    let vatRate=Math.max(0,numberField(p.TaxRate));if(![0,6,13,24].includes(Math.round(vatRate)))vatRate=0;else vatRate=Math.round(vatRate);';
const patchedNumeric='    const azureQuantity=Math.max(0,numberField(p.Quantity));\n    const azureSupplierProfile=supplierAzureProfile(textField(f.VendorName)||textField(f.VendorAddressRecipient),textField(f.VendorTaxId));\n    const rowFallback=parseAzureGreekProductRow(item?.content||"",azureQuantity,azureSupplierProfile);\n    const quantity=Math.max(0,rowFallback?.quantity||azureQuantity||0);\n    let unitPrice=Math.max(0,rowFallback?.unitPrice||numberField(p.UnitPrice)||0);\n    let netAmount=Math.max(0,rowFallback?.netAmount||numberField(p.Amount)||0);\n    const tax=Math.max(0,numberField(p.Tax));\n    let vatRate=Math.max(0,rowFallback?.vatRate||numberField(p.TaxRate)||0);if(![0,6,13,24].includes(Math.round(vatRate)))vatRate=0;else vatRate=Math.round(vatRate);';
if(server.includes(originalNumeric))server=server.replace(originalNumeric,patchedNumeric);
else if(!server.includes('parseAzureGreekProductRow(item?.content||"",azureQuantity,azureSupplierProfile)'))throw new Error("Azure numeric block unknown.");

const originalDiscount='    const discount1=discounts[0]||0,discount2=discounts[1]||0,discount3=discounts[2]||0;';
const patchedDiscount='    const verifiedAzureDiscounts=discounts.length&&discountsReconcile(discounts,unitPrice,quantity,netAmount)?discounts:[];\n    const discount1=rowFallback?.mathValidated?rowFallback.discount1:(verifiedAzureDiscounts[0]||0),discount2=rowFallback?.mathValidated?rowFallback.discount2:(verifiedAzureDiscounts[1]||0),discount3=rowFallback?.mathValidated?rowFallback.discount3:(verifiedAzureDiscounts[2]||0);';
if(server.includes(originalDiscount))server=server.replace(originalDiscount,patchedDiscount);

fs.writeFileSync(serverPath,server,"utf8");
console.log("Invoice Learning patched: stricter IFANTIS wrapped-row scoring + universal math validation.");
