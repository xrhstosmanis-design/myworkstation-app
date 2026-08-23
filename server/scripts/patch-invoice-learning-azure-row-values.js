import fs from "node:fs";

const serverPath=new URL("../src/routes/platform-invoice-learning-ai.js",import.meta.url);
let server=fs.readFileSync(serverPath,"utf8");

const start=server.indexOf('function parseAzureGreekProductRow(');
const end=start>=0?server.indexOf('\nfunction normalizeAzure(payload){',start):-1;
const normalizeAnchor='function normalizeAzure(payload){';
if(!server.includes(normalizeAnchor))throw new Error("Azure normalize anchor missing.");

const helper=`function supplierAzureProfile(supplierName="",supplierTaxId=""){
  const name=norm(supplierName),tax=String(supplierTaxId||"").replace(/\\D/g,"");
  // Supplier-specific parsing rules only. Add future quirks here by supplier identity,
  // never as global parsing behaviour unless they are mathematically universal.
  const leadingDecimalPrice = /ΜΑΡΟΣ|MAROS/.test(name);
  return {leadingDecimalPrice};
}

function parseAzureGreekProductRow(content="",quantityHint=0,profile={}){
  const text=String(content||"").replace(/\\s+/g," ").trim();
  if(!text)return null;
  const numericPattern=profile.leadingDecimalPrice?/-?(?:\\d+(?:[.,]\\d+)?|[.,]\\d+)/g:/-?\\d+(?:[.,]\\d+)?/g;
  const toValues=s=>(String(s||"").match(numericPattern)||[])
    .map(x=>{const raw=String(x).trim();const normalized=profile.leadingDecimalPrice&&/^-?[.,]\\d+$/.test(raw)?raw.replace(/^(-?)([.,])/,'$10.'):raw.replace(",",".");return Number(normalized)})
    .filter(Number.isFinite);
  const qHint=Math.max(0,Number(quantityHint||0));
  const marker=text.match(/(?:^|\\s)(?:ΤΕΜ|ΤΜΧ|TEM|PCS)\\s+(.+)$/i);
  let after=[],before=[],markerBroken=false;
  if(marker){after=toValues(marker[1]);if(!after.length)return null;before=toValues(text.slice(0,marker.index||0)).slice(-5)}
  else{if(!(qHint>0))return null;after=toValues(text).slice(-10);if(after.length<5)return null;markerBroken=true}
  const all=[...after,...before];
  const close=(a,b,tol=Math.max(0.03,Math.abs(Number(b||0))*0.015))=>Math.abs(Number(a||0)-Number(b||0))<=tol;
  const discountEvidence=(initial,skip=[])=>{let best=null;for(let i=0;i<all.length;i++){if(skip.includes(i))continue;const pct=Math.abs(Number(all[i]||0));if(!(pct>0&&pct<100))continue;const da=initial*pct/100,net=initial-da;for(let a=0;a<all.length;a++){if(a===i||skip.includes(a)||!close(all[a],da,Math.max(.03,da*.03)))continue;for(let n=0;n<all.length;n++){if(n===i||n===a||skip.includes(n)||!close(all[n],net,Math.max(.03,net*.02)))continue;const error=Math.abs(all[a]-da)+Math.abs(all[n]-net);if(!best||error<best.error)best={pct,net:all[n],error}}}}return best};
  let best=null;const pcs=[];
  if(qHint>0)for(let i=0;i<Math.min(after.length,8);i++)pcs.push({q:qHint,price:after[i],pi:i,bonus:30});
  if(!markerBroken&&after.length>=2&&after[0]>0&&Number.isInteger(after[0]))pcs.push({q:after[0],price:after[1],pi:1,bonus:qHint>0&&close(after[0],qHint,.001)?40:10});
  for(const c of pcs){if(!(c.q>0&&c.price>0))continue;const expected=c.q*c.price;for(let j=c.pi+1;j<after.length;j++){if(!close(after[j],expected))continue;const evidence=discountEvidence(after[j],[c.pi,j]);const score=150+c.bonus+(evidence?120-Math.min(20,evidence.error*100):0)+(Math.abs(c.price-Math.round(c.price))>.0001?4:0)-Math.abs(j-c.pi);if(!best||score>best.score)best={score,quantity:c.q,unitPrice:c.price,initialAmount:after[j],amountIndex:j,priceIndex:c.pi,evidence}}}
  if(!best||(markerBroken&&!best.evidence))return null;
  let vatRate=0;for(const v of [...after].reverse().concat([...before].reverse())){const n=Math.round(Math.abs(v));if([6,13,24].includes(n)){vatRate=n;break}}
  const d=best.evidence||discountEvidence(best.initialAmount,[best.priceIndex,best.amountIndex]);
  const discount1=d?money4(d.pct):0,netAmount=d?money4(d.net):money4(best.initialAmount);
  return {quantity:best.quantity,unitPrice:money4(best.unitPrice),initialAmount:money4(best.initialAmount),discount1,discount2:0,discount3:0,netAmount,vatRate,grossAmount:netAmount>0?money4(netAmount*(1+vatRate/100)):0,unit:"ΤΜΧ",mathValidated:true,markerRecovered:markerBroken,supplierProfileApplied:Boolean(profile.leadingDecimalPrice)};
}
`;

if(start>=0&&end>start)server=server.slice(0,start)+helper+server.slice(end+1);
else server=server.replace(normalizeAnchor,helper+'\n'+normalizeAnchor);

const oldCall='    const rowFallback=parseAzureGreekProductRow(item?.content||"",azureQuantity);';
const newCall='    const azureSupplierProfile=supplierAzureProfile(textField(f.VendorName)||textField(f.VendorAddressRecipient),textField(f.VendorTaxId));\n    const rowFallback=parseAzureGreekProductRow(item?.content||"",azureQuantity,azureSupplierProfile);';
if(server.includes(oldCall))server=server.replace(oldCall,newCall);
else if(!server.includes('const rowFallback=parseAzureGreekProductRow(item?.content||"",azureQuantity,azureSupplierProfile);'))throw new Error("Azure supplier-profile call anchor missing.");

fs.writeFileSync(serverPath,server,"utf8");
console.log("Invoice Learning patched: universal math validation + supplier-scoped Azure parsing quirks active.");
