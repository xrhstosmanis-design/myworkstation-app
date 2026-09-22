const number=value=>{
  const parsed=Number(String(value??"").trim().replace(",","."));
  return Number.isFinite(parsed)?parsed:null;
};
const money2=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
const money4=value=>Math.round((Number(value||0)+Number.EPSILON)*10000)/10000;
const close=(a,b,tolerance=.05)=>Math.abs(Number(a||0)-Number(b||0))<=tolerance;
const rawOf=line=>String(line?.azureRawRow||line?.rawText||"").trim();
const economicsAreEmpty=line=>[
  line?.quantity,line?.invoiceQuantity,line?.unitPrice,line?.unitCost,
  line?.netAmount,line?.netValue,line?.grossAmount
].every(value=>Math.abs(Number(value||0))<.0001);

function parseContinuation(line){
  const words=rawOf(line).split(/\s+/).filter(Boolean);
  if(words.length<9||!/^[0-9]{5,}$/.test(words[0]))return null;
  const values=words.map(number);
  if(values.some(value=>value===null))return null;
  const quantity=values[1],unitPrice=values[2],discount1=values[4],netAmount=values.at(-2),vatRate=values.at(-1);
  if(!(quantity>0&&unitPrice>0&&discount1>=0&&discount1<100&&netAmount>0&&vatRate>=0&&vatRate<=30))return null;
  const expectedNet=quantity*unitPrice*(1-discount1/100);
  if(!close(expectedNet,netAmount,Math.max(.03,netAmount*.004)))return null;
  return {quantity,unitPrice,discount1,discount2:values[5]||0,discount3:values[6]||0,netAmount,vatRate,batch:words[0]};
}

// Fresh Snack's thermal printer wraps every item over two physical rows:
// code/description/unit first, then lot/quantity/price/discount/value/VAT.
// Azure can expose those physical rows as separate products.  Merge only a
// complete alternating table and only when the current image's footer proves
// the reconstructed economics.  Partial or ambiguous results pass through.
export function recoverFreshSnackWrappedLines(parsed={}){
  const source=Array.isArray(parsed?.productLines)?parsed.productLines:[];
  if(source.length<2||source.length%2!==0)return parsed;
  const merged=[];
  for(let index=0;index<source.length;index+=2){
    const header=source[index],continuation=source[index+1];
    const code=String(header?.supplierItemCode||header?.code||"").trim();
    const description=String(header?.description||"").trim();
    const headerRaw=rawOf(header),continuationRaw=rawOf(continuation);
    const values=parseContinuation(continuation);
    if(!code||!description||!headerRaw||!continuationRaw||!economicsAreEmpty(header)||!values)return parsed;
    const grossAmount=money2(values.netAmount*(1+values.vatRate/100));
    merged.push({
      ...header,
      code,supplierItemCode:code,description,
      quantity:values.quantity,invoiceQuantity:values.quantity,
      unit:"TEM",invoiceUnit:"TEM",
      unitPrice:money4(values.unitPrice),unitCost:money4(values.unitPrice),
      initialAmount:money2(values.quantity*values.unitPrice),
      discount1:money4(values.discount1),discount2:money4(values.discount2),discount3:money4(values.discount3),
      netAmount:money2(values.netAmount),netValue:money2(values.netAmount),
      netUnitCost:money4(values.netAmount/values.quantity),vatRate:money4(values.vatRate),grossAmount,
      rawText:`${headerRaw} ${continuationRaw}`,azureRawRow:`${headerRaw} ${continuationRaw}`,
      supplierProfileRecovered:true,supplierProfileRule:"FRESH_SNACK_WRAPPED_LINE_PAIR",
      supplierProfileEvidence:{batch:values.batch,headerRow:index+1,continuationRow:index+2,currentImageEquationVerified:true},
      sourceColumnsVerified:true,mathValidated:true,needsReview:false
    });
  }
  const net=money2(merged.reduce((sum,line)=>sum+line.netAmount,0));
  const netByVat=new Map();
  for(const line of merged)netByVat.set(line.vatRate,money2((netByVat.get(line.vatRate)||0)+line.netAmount));
  const vat=money2([...netByVat].reduce((sum,[rate,taxable])=>sum+money2(taxable*rate/100),0));
  const gross=money2(net+vat);
  const footerChecks=[
    [parsed?.totalNet,net],
    [parsed?.totalVat,vat],
    [parsed?.totalGross,gross]
  ].filter(([printed])=>Number(printed)>0);
  if(!footerChecks.length||footerChecks.some(([printed,recovered])=>!close(printed,recovered)))return parsed;
  return {...parsed,productLines:merged,freshSnackWrappedTableRecovered:true,freshSnackRecoveredTotals:{net,vat,gross}};
}
