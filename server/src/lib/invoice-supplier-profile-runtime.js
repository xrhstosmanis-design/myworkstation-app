import {prisma} from "../prisma.js";
import {applyConfirmedColumns,recoverLeventopoulosMmPos1Columns,recoverStefanidisFoodLine,unitRelativeValues} from "./invoice-column-reading.js";
import {recoverFreshSnackWrappedLines} from "./invoice-fresh-snack-wrapped-lines.js";
import {applyVerifiedCodeCorrections} from "./invoice-explicit-code-rules.js";

const cleanTaxId=v=>String(v||"").replace(/\D/g,"");
const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g,"");
const money2=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;
const money4=v=>Math.round((Number(v||0)+Number.EPSILON)*10000)/10000;
const close=(a,b,tol=Math.max(.03,Math.abs(Number(b||0))*.012))=>Math.abs(Number(a||0)-Number(b||0))<=tol;

export async function resolveCentralSupplierProfile(supplier={}){
  const taxId=cleanTaxId(supplier?.taxId),name=norm(supplier?.name);
  try{
    let rows=[];
    if(taxId)rows=await prisma.$queryRawUnsafe(`SELECT "supplierKey","supplierTaxId","supplierName","commercialFamily","distributorName","ruleKey","profileVersion","profile","updatedAt" FROM "InvoiceSupplierReadingProfile" WHERE "supplierTaxId"=$1 AND "isActive"=TRUE LIMIT 1`,taxId);
    if(!rows.length&&!taxId&&name)rows=await prisma.$queryRawUnsafe(`SELECT "supplierKey","supplierTaxId","supplierName","commercialFamily","distributorName","ruleKey","profileVersion","profile","updatedAt" FROM "InvoiceSupplierReadingProfile" WHERE ("normalizedName"=$1 OR $1 LIKE '%'||"normalizedName"||'%' OR "normalizedName" LIKE '%'||$1||'%') AND "isActive"=TRUE ORDER BY "updatedAt" DESC LIMIT 1`,name);
    const r=rows?.[0];
    return r?{supplierKey:r.supplierKey,supplierTaxId:r.supplierTaxId,supplierName:r.supplierName,commercialFamily:r.commercialFamily||r.profile?.commercialFamily||null,distributorName:r.distributorName||r.profile?.distributorName||null,ruleKey:r.ruleKey,profileVersion:r.profileVersion,...(r.profile||{}),updatedAt:r.updatedAt}:null;
  }catch(error){
    // Safe fallback while old tenants are waiting for the central profile table bootstrap.
    console.warn("Central supplier profile lookup skipped:",error?.message||error);
    return null;
  }
}

// Azure keeps the printed source row separately. Prefer it over assembled OCR text,
// so the learned column map is applied to the same columns the supplier printed.
const sourceRow=line=>line?.azureRawRow||line?.rawText||"";

function numberTokens(raw){
  return (String(raw||"").match(/\d+(?:[.,]\d+)?/g)||[]).map((raw,index)=>({raw,value:Number(raw.replace(",",".")),index})).filter(x=>Number.isFinite(x.value));
}

function recoverIfantisLine(line){
  const quantity=Number(line?.quantity||0);if(!(quantity>0))return line;
  const tokens=numberTokens(sourceRow(line));if(tokens.length<3)return line;
  const commonDiscounts=[0,5,10,15,20,25,30,35,40,45,50];
  let best=null;
  for(let i=0;i<tokens.length;i++){
    const initial=tokens[i].value;if(!(initial>0))continue;
    const unitPrice=initial/quantity;if(!(unitPrice>=.05&&unitPrice<=100))continue;
    for(let d=0;d<tokens.length;d++){
      if(d===i)continue;const discountAmount=Math.abs(tokens[d].value);if(!(discountAmount>=0&&discountAmount<=initial))continue;
      for(let n=0;n<tokens.length;n++){
        if(n===i||n===d)continue;const net=tokens[n].value;if(!(net>=0&&net<=initial))continue;
        if(!close(initial-discountAmount,net,Math.max(.03,initial*.008)))continue;
        const pct=initial?discountAmount/initial*100:0;
        const nearest=commonDiscounts.reduce((a,b)=>Math.abs(b-pct)<Math.abs(a-pct)?b:a,0);
        if(Math.abs(pct-nearest)>.45)continue;
        // Prefer realistic monetary triplets and later row values; reject obvious product-code scale candidates.
        const score=1000-Math.abs(pct-nearest)*100-Math.abs((initial-discountAmount)-net)*200+(i>0?10:0)-(initial>500?500:0);
        if(!best||score>best.score)best={score,initial,discountAmount,net,pct:nearest,unitPrice};
      }
    }
  }
  if(!best)return line;
  const vat=Number(line?.vatRate||0);
  return {
    ...line,
    unitCost:money4(best.unitPrice),unitPrice:money4(best.unitPrice),
    discount1:money4(best.pct),discount2:0,discount3:0,
    netAmount:money2(best.net),netValue:money2(best.net),netUnitCost:money4(best.net/quantity),
    grossAmount:money2(best.net+(vat>0?best.net*vat/100:0)),
    supplierProfileRecovered:true,supplierProfileRule:"IFANTIS_FOOD_GROUP",
    supplierProfileEvidence:{initialAmount:money2(best.initial),discountAmount:money2(best.discountAmount),netAmount:money2(best.net)}
  };
}

// A profile rule is enabled only by an explicit Super Admin learning action.
function recoverQuantityFromLineTotal(line){
  const price=Number(line?.unitPrice??line?.unitCost??0),net=Number(line?.netAmount??line?.netValue??0);
  if(!(price>0&&net>0&&price<=100000))return line;
  const candidates=numberTokens(sourceRow(line)).map(x=>x.value).filter(q=>q>0&&q<=100000&&close(q*price,net,Math.max(.03,net*.012)));
  const unique=[...new Set(candidates.map(q=>Math.round(q*10000)/10000))];
  if(unique.length!==1||close(unique[0],Number(line?.quantity||0),.0001))return line;
  const quantity=unique[0];
  return {...line,quantity,invoiceQuantity:quantity,supplierProfileRecovered:true,supplierProfileRule:"LINE_TOTAL_MATCH",supplierProfileEvidence:{quantity,unitPrice:money4(price),netAmount:money2(net)}};
}

const unitWords=new Set(["TEM","ΤΕΜ","TM","ΤΜ","TMX","ΤΜΧ","PCS","PC","KIB","ΚΙΒ","KΒ","ΚΒ","KG","ΚG","ΚΙΛΑ","LT","LIT","ΦΑΚ"]);
const parseNumber=value=>{const n=Number(String(value||"").replace(",","."));return Number.isFinite(n)?n:null};
const wordsOf=line=>String(sourceRow(line)).replace(/(\d),\s+(\d{3})(?=\s|$)/g,"$1.$2").trim().split(/\s+/).filter(Boolean);
const numericNear=(words,start,direction)=>{
  for(let i=start;i>=0&&i<words.length;i+=direction){const n=parseNumber(words[i]);if(n!==null)return n}
  return null;
};
// A manual column map is anchored on the printed unit column. It is more stable
// than counting every numeric token because product descriptions commonly carry
// numbers (for example "3.5" or "20 STD").
function recoverDeclaredColumns(line,profile){
  const columns=profile?.readingRule?.columns||profile?.columnMap?.columns;
  if(!columns||typeof columns!=="object")return line;
  const indexOf=role=>Number(Object.entries(columns).find(([,value])=>value===role)?.[0]||0);
  const declaredUnitColumn=indexOf("UNIT"),quantityColumn=indexOf("QUANTITY"),priceColumn=indexOf("UNIT_PRICE");
  const fallbackUnit=String(profile?.readingRule?.defaultUnit||"").trim();
  // Some compact receipts print TEM inline between the description and quantity,
  // without giving it a dedicated table column. Treat that token as the anchor;
  // never recover economics unless the line equation below still balances.
  const unitColumn=declaredUnitColumn||((fallbackUnit&&quantityColumn>1)?quantityColumn-1:0);
  if(!(unitColumn>0&&quantityColumn>0&&priceColumn>0))return line;
  const words=wordsOf(line);if(!words.length)return line;
  let unitIndex=words.findIndex(word=>unitWords.has(norm(word)));
  if(unitIndex<0){unitIndex=words.findIndex(word=>/^(TEM|ΤΕΜ|TM|ΤΜ|TMX|ΤΜΧ|PCS|KIB|ΚΙΒ|KG|ΚG|LT|ΦΑΚ)$/i.test(word))}
  // Azure can return the same DELTA table in visual reading order, with the
  // unit immediately before the economics, instead of the supplier's declared
  // column order. OCR also commonly reads TM as TH, IN or IM. Prove the row
  // from quantity × price × discounts = net and net + VAT = gross before
  // accepting this alternate order; otherwise leave the provider result alone.
  if(unitIndex<0&&norm(profile?.commercialFamily)==='ΔΕΛΤΑ')unitIndex=words.findIndex(word=>/^(TH|IN|IM)$/i.test(word));
  if(unitIndex>=0&&indexOf('DISCOUNT_1')>0&&indexOf('DISCOUNT_2')>0&&indexOf('AMOUNT_AFTER_DISCOUNT')>0&&indexOf('VAT_RATE')>0){
    const tail=words.slice(unitIndex+1).map((word,index)=>({value:parseNumber(word),index})).filter(item=>item.value!==null),quantity=tail[0]?.value,candidates=[];
    if(quantity>0&&tail.length>=7){
      const rest=tail.slice(1),vatValues=new Set([0,6,13,17,24]);
      for(const price of rest)for(const d1 of rest)for(const d2 of rest)for(const net of rest)for(const vat of rest)for(const gross of rest){
        if(new Set([price.index,d1.index,d2.index,net.index,vat.index,gross.index]).size<6||d1.index>d2.index)continue;
        if(!(price.value>0&&d1.value>=0&&d1.value<=100&&d2.value>=0&&d2.value<=100&&net.value>0&&gross.value>=net.value&&vatValues.has(vat.value)))continue;
        const calculated=quantity*price.value*(1-d1.value/100)*(1-d2.value/100),calculatedGross=net.value*(1+vat.value/100);
        if(!close(calculated,net.value,Math.max(.011,net.value*.002))||!close(calculatedGross,gross.value,Math.max(.011,gross.value*.002)))continue;
        candidates.push({quantity,unitPrice:price.value,discount1:d1.value,discount2:d2.value,netAmount:net.value,vatRate:vat.value,grossAmount:gross.value});
      }
    }
    const unique=[...new Map(candidates.map(candidate=>[[candidate.quantity,candidate.unitPrice,candidate.discount1,candidate.discount2,candidate.netAmount,candidate.vatRate,candidate.grossAmount].join('|'),candidate])).values()];
    if(unique.length===1){
      const x=unique[0],unit=words[unitIndex];
      return {...line,quantity:x.quantity,invoiceQuantity:x.quantity,unitPrice:money4(x.unitPrice),unitCost:money4(x.unitPrice),initialAmount:money2(x.quantity*x.unitPrice),invoiceUnit:unit,unit,netAmount:money2(x.netAmount),netValue:money2(x.netAmount),netUnitCost:money4(x.netAmount/x.quantity),discount1:money4(x.discount1),discount2:money4(x.discount2),discount3:0,vatRate:x.vatRate,grossAmount:money2(x.grossAmount),supplierProfileRecovered:true,supplierProfileRule:'DECLARED_COLUMNS_READING_ORDER',supplierProfileEvidence:{quantity:x.quantity,unitPrice:money4(x.unitPrice),discount1:x.discount1,discount2:x.discount2,netAmount:money2(x.netAmount),vatRate:x.vatRate,grossAmount:money2(x.grossAmount)}};
    }
  }
  // Some Azure rows omit the inline TEM token altogether and, on this compact
  // layout, can also return 1,620 as 1620. A no-unit map still has a stable
  // numeric tail: quantity, price, discounts, VAT and final line value.
  // Accept a decimal-scale repair only if the printed final value and every
  // selected discount independently prove it.
  if(!declaredUnitColumn&&fallbackUnit&&unitIndex<0){
    const lastColumn=Math.max(...['QUANTITY','UNIT_PRICE','AMOUNT_BEFORE_DISCOUNT','AMOUNT_AFTER_DISCOUNT','DISCOUNT_1','DISCOUNT_2','DISCOUNT_3','VAT_RATE'].map(indexOf));
    const tail=words.slice(-(lastColumn-quantityColumn+1)).map(parseNumber);
    const at=role=>{const column=indexOf(role);return column>=quantityColumn?tail[column-quantityColumn]:null};
    let quantity=at('QUANTITY'),unitPrice=at('UNIT_PRICE'),before=at('AMOUNT_BEFORE_DISCOUNT'),after=at('AMOUNT_AFTER_DISCOUNT');
    const discount1=at('DISCOUNT_1'),discount2=at('DISCOUNT_2'),discount3=at('DISCOUNT_3'),vatRate=at('VAT_RATE');
    if(tail.every(value=>value!==null)&&quantity>0&&unitPrice>0){
      const amount=after>0?after:before>0?before:null;
      const factor=[discount1,discount2,discount3].reduce((value,discount)=>value*(1-Math.max(0,Number(discount||0))/100),1);
      if(amount!==null&&!close(quantity*unitPrice*factor,amount,Math.max(.03,amount*.012))){
        const repaired=amount/(quantity*factor),printedScale=unitPrice/1000;
        if(!(unitPrice>=100&&repaired>0&&close(printedScale,repaired,Math.max(.003,repaired*.012))))return line;
        unitPrice=printedScale;
      }
      const net=amount===null?Number(line?.netAmount??line?.netValue??0):amount;
      return {...line,quantity,invoiceQuantity:quantity,unitPrice:money4(unitPrice),unitCost:money4(unitPrice),initialAmount:money2(quantity*unitPrice),invoiceUnit:fallbackUnit,unit:fallbackUnit,netAmount:net>0?money2(net):line?.netAmount,netValue:net>0?money2(net):line?.netValue,netUnitCost:quantity>0&&net>0?money4(net/quantity):line?.netUnitCost,discount1:discount1!==null?money4(discount1):line?.discount1,discount2:discount2!==null?money4(discount2):line?.discount2,discount3:discount3!==null?money4(discount3):line?.discount3,vatRate:vatRate!==null?money4(vatRate):line?.vatRate,grossAmount:net>0&&vatRate!==null?money2(net*(1+vatRate/100)):line?.grossAmount,supplierProfileRecovered:true,supplierProfileRule:'DECLARED_COLUMNS_TAIL_RECONCILED',supplierProfileEvidence:{unitColumn:null,quantityColumn,priceColumn,quantity,unitPrice:money4(unitPrice),amount:net>0?money2(net):null,decimalScaleRepaired:unitPrice!==at('UNIT_PRICE')}};
    }
  }
  if(unitIndex<0)return line;
  // TALOS-style rows end in one stable economic suffix even when Azure drops
  // the printed quantity cell: [qty?] price, gross, retail, discount %,
  // discount value, net, VAT. Recover that suffix only when both independent
  // row equations prove it; this avoids shifting the remaining columns left.
  const beforeColumn=indexOf("AMOUNT_BEFORE_DISCOUNT"),retailColumn=indexOf("RETAIL_PRICE"),afterColumn=indexOf("AMOUNT_AFTER_DISCOUNT"),vatColumn=indexOf("VAT_RATE"),discount1Column=indexOf("DISCOUNT_1");
  const talosStyle=quantityColumn<priceColumn&&priceColumn<beforeColumn&&beforeColumn<retailColumn&&retailColumn<discount1Column&&discount1Column<afterColumn&&afterColumn<vatColumn;
  if(talosStyle){
    const tail=words.slice(unitIndex+1).map(parseNumber).filter(value=>value!==null);
    const suffix=tail.slice(-8),hasQuantity=suffix.length===8;
    const values=hasQuantity?suffix:[null,...tail.slice(-7)];
    let [quantity,unitPrice,before,retail,discount1,discountAmount,after,vatRate]=values;
    const inferredQuantity=unitPrice>0&&before>0?before/unitPrice:0;
    if(!hasQuantity&&inferredQuantity>0&&close(inferredQuantity,Math.round(inferredQuantity),.02))quantity=Math.round(inferredQuantity);
    const grossValid=quantity>0&&unitPrice>0&&before>0&&close(quantity*unitPrice,before,Math.max(.03,before*.008));
    const netValid=after>0&&discountAmount>=0&&after<=before+.02&&close(before-discountAmount,after,Math.max(.03,after*.008));
    const vatValid=[0,6,13,17,24].includes(Number(vatRate));
    if(grossValid&&netValid&&vatValid){
      return {...line,quantity,invoiceQuantity:quantity,unitPrice:money4(unitPrice),unitCost:money4(unitPrice),retailPrice:retail>0?money4(retail):line?.retailPrice,initialAmount:money2(before),invoiceUnit:words[unitIndex],unit:words[unitIndex],netAmount:money2(after),netValue:money2(after),netUnitCost:money4(after/quantity),discount1:money4(discount1),discount2:0,discount3:0,vatRate:money4(vatRate),grossAmount:money2(after*(1+vatRate/100)),supplierProfileRecovered:true,supplierProfileRule:"DECLARED_COLUMNS_VERIFIED_SUFFIX",supplierProfileEvidence:{quantityInferred:!hasQuantity,quantity,unitPrice:money4(unitPrice),before:money2(before),discountAmount:money2(discountAmount),after:money2(after),vatRate}};
    }
    // Azure occasionally returns the same physical cells in reading order
    // instead of column order. Search the current row for one unique economic
    // proof; never choose between multiple possible interpretations.
    const candidates=[];
    for(let p=0;p<tail.length;p++)for(let b=0;b<tail.length;b++){
      if(p===b||!(tail[p]>0&&tail[b]>0))continue;
      const inferred=tail[b]/tail[p],q=Math.round(inferred);
      if(!(q>0&&q<=1000&&close(inferred,q,.02)))continue;
      for(let d=0;d<tail.length;d++)for(let n=0;n<tail.length;n++){
        // In this Azure fallback the printed right-hand cells arrive in visual
        // reading order: discount value, net, VAT, unit price, gross, then the
        // remaining retail/discount cells. This ordering disambiguates the
        // inverse subtraction (gross-net) without guessing from invoice data.
        if(!(d<n&&n<p&&p<b))continue;
        if(new Set([p,b,d,n]).size<4||!(tail[d]>=0&&tail[n]>0&&tail[n]<=tail[b]+.02)||!close(tail[b]-tail[d],tail[n],Math.max(.03,tail[n]*.008)))continue;
        for(let v=0;v<tail.length;v++)if(![p,b,d,n].includes(v)&&[0,6,13,17,24].includes(Number(tail[v])))candidates.push({p,b,d,n,v,quantity:q,unitPrice:tail[p],before:tail[b],discountAmount:tail[d],after:tail[n],vatRate:tail[v]});
      }
    }
    const unique=[...new Map(candidates.map(candidate=>[[candidate.quantity,candidate.unitPrice,candidate.before,candidate.discountAmount,candidate.after,candidate.vatRate].join('|'),candidate])).values()];
    if(unique.length===1){
      const candidate=unique[0],unused=tail.map((value,index)=>({value,index})).filter(item=>![candidate.p,candidate.b,candidate.d,candidate.n,candidate.v].includes(item.index));
      const discountOptions=unused.filter(item=>item.value>=0&&item.value<=100&&close(item.value,Math.round(item.value),.001));
      const discount1=discountOptions.length===1?discountOptions[0].value:Number(line?.discount1||0),retail=unused.find(item=>item.index!==discountOptions[0]?.index&&item.value>0)?.value;
      return {...line,quantity:candidate.quantity,invoiceQuantity:candidate.quantity,unitPrice:money4(candidate.unitPrice),unitCost:money4(candidate.unitPrice),retailPrice:retail>0?money4(retail):line?.retailPrice,initialAmount:money2(candidate.before),invoiceUnit:words[unitIndex],unit:words[unitIndex],netAmount:money2(candidate.after),netValue:money2(candidate.after),netUnitCost:money4(candidate.after/candidate.quantity),discount1:money4(discount1),discount2:0,discount3:0,vatRate:money4(candidate.vatRate),grossAmount:money2(candidate.after*(1+candidate.vatRate/100)),supplierProfileRecovered:true,supplierProfileRule:"DECLARED_COLUMNS_UNORDERED_VERIFIED_SUFFIX",supplierProfileEvidence:{quantityInferred:true,quantity:candidate.quantity,unitPrice:money4(candidate.unitPrice),before:money2(candidate.before),discountAmount:money2(candidate.discountAmount),after:money2(candidate.after),vatRate:candidate.vatRate}};
    }
  }
  const atColumn=column=>numericNear(words,unitIndex+(column-unitColumn),column>=unitColumn?1:-1);
  const mapped=role=>{const column=indexOf(role);return column>0?atColumn(column):null};
  const quantity=mapped("QUANTITY"),unitPrice=mapped("UNIT_PRICE"),before=mapped("AMOUNT_BEFORE_DISCOUNT"),after=mapped("AMOUNT_AFTER_DISCOUNT");
  if(!(quantity>0&&unitPrice>0))return line;
  const amount=after>0?after:before>0?before:null;
  const discount1=mapped("DISCOUNT_1"),discount2=mapped("DISCOUNT_2"),discount3=mapped("DISCOUNT_3"),vatRate=mapped("VAT_RATE");
  const discountFactor=[discount1,discount2,discount3].reduce((value,discount)=>value*(1-Math.max(0,Math.min(100,Number(discount||0)))/100),1);
  // Do not override a row if the selected columns do not reconcile. A column map
  // is an aid, never permission to invent values.
  const beforeValid=!(before>0)||close(quantity*unitPrice,before,Math.max(.03,before*.012));
  // When both printed gross and net line amounts exist, the net may include a
  // separate discount-value column intentionally marked IGNORE. The verified
  // gross equation plus a non-increasing positive net is sufficient; never
  // infer the ignored commercial adjustment.
  const afterValid=!(after>0)||(beforeValid&&before>0&&after<=before+.02)||close(quantity*unitPrice*discountFactor,after,Math.max(.03,after*.012));
  if(!beforeValid||!afterValid){const recovered=amount/unitPrice;if(discountFactor!==1||!(recovered>0&&recovered<=100000&&close(recovered,Math.round(recovered),.05)))return line;return {...line,quantity:Math.round(recovered),invoiceQuantity:Math.round(recovered),unitPrice:money4(unitPrice),unitCost:money4(unitPrice),netAmount:money2(amount),netValue:money2(amount),invoiceUnit:words[unitIndex],unit:words[unitIndex],supplierProfileRecovered:true,supplierProfileRule:"DECLARED_COLUMNS_LINE_TOTAL_RECOVERY"};}
  const unit=words[unitIndex]||fallbackUnit;const net=amount===null?Number(line?.netAmount??line?.netValue??0):amount;
  return {...line,quantity,invoiceQuantity:quantity,unitPrice:money4(unitPrice),unitCost:money4(unitPrice),initialAmount:money2(quantity*unitPrice),invoiceUnit:unit||line?.invoiceUnit,unit:unit||line?.unit,netAmount:net>0?money2(net):line?.netAmount,netValue:net>0?money2(net):line?.netValue,netUnitCost:net>0?money4(net/quantity):line?.netUnitCost,discount1:discount1!==null?money4(discount1):line?.discount1,discount2:discount2!==null?money4(discount2):line?.discount2,discount3:discount3!==null?money4(discount3):line?.discount3,vatRate:vatRate!==null?money4(vatRate):line?.vatRate,grossAmount:net>0&&vatRate!==null?money2(net*(1+vatRate/100)):line?.grossAmount,supplierProfileRecovered:true,supplierProfileRule:"DECLARED_COLUMNS",supplierProfileEvidence:{unitColumn,quantityColumn,priceColumn,amountColumn:after>0?indexOf("AMOUNT_AFTER_DISCOUNT"):indexOf("AMOUNT_BEFORE_DISCOUNT"),quantity,unitPrice:money4(unitPrice),amount:net>0?money2(net):null}};
}


function applySupplierStockConversion(line,mapping={}){
  // Legacy mappings may carry unitsPerPackage only as catalogue metadata.
  // Apply a stock conversion only when the supplier rule explicitly declares it.
  const factor=Number(mapping?.stockConversion?.factor||0);
  if(!(mapping?.verified&&factor>1))return line;
  const invoiceQuantity=Math.max(0,Number(line?.invoiceQuantity??line?.quantity??0));
  const packageUnitPrice=Math.max(0,Number(line?.packageUnitPrice??line?.unitPrice??line?.unitCost??0));
  const netAmount=Math.max(0,Number(line?.netAmount??line?.netValue??0));
  if(!(invoiceQuantity>0&&packageUnitPrice>0))return line;
  const initialAmount=money2(invoiceQuantity*packageUnitPrice);
  // A learned mapping may describe packaging, never the commercial terms of
  // a later invoice. Derive the discount only from this row's printed/current
  // quantity, price and net amount; otherwise retain the current extraction.
  const currentDiscounts=[line?.discount1,line?.discount2,line?.discount3].map(value=>Number(value??0));
  const hasCurrentDiscount=[line?.discount1,line?.discount2,line?.discount3].some(value=>value!==undefined&&value!==null&&value!=="");
  const currentDiscountsMatch=hasCurrentDiscount&&currentDiscounts.every(value=>Number.isFinite(value)&&value>=0&&value<=100)
    &&netAmount>0&&money2(currentDiscounts.reduce((amount,value)=>amount*(1-value/100),invoiceQuantity*packageUnitPrice))===money2(netAmount);
  // Preserve the printed percentages when their rounded row total agrees.
  // Reverse division of 10.13 / 13.50 would otherwise turn 25% into 24.96%.
  const calculatedDiscount=currentDiscountsMatch?currentDiscounts[0]:netAmount>0&&netAmount<=initialAmount+.02?money2(Math.max(0,(1-netAmount/initialAmount)*100)):Number(line?.discount1||0);
  const stockQuantity=money4(invoiceQuantity*factor);
  const stockUnit=String(mapping.stockUnit||mapping.stockConversion?.to||line?.stockUnit||line?.unit||"").trim();
  const invoiceUnit=String(mapping.invoiceUnit||line?.invoiceUnit||line?.unit||"").trim();
  // PurchaseOrderLine.quantity and unitCost always retain the printed invoice
  // economics. stockUnitsPerInvoiceUnit is the only conversion multiplier; the
  // review UI and stock posting derive stock quantity exactly once from it.
  // A verified explicit conversion is authoritative even when legacy profiles
  // omit the redundant unitsPerPackage field. Protect it from product knowledge.
  return {...line,invoiceQuantity,invoiceUnit,packageUnitPrice,quantity:invoiceQuantity,unit:invoiceUnit,stockUnit,unitsPerPackage:factor,conversionFactor:factor,stockUnitsPerInvoiceUnit:factor,unitPrice:packageUnitPrice,unitCost:packageUnitPrice,netUnitCost:netAmount>0?money4(netAmount/invoiceQuantity):Number(line?.netUnitCost||0),initialAmount,discount1:calculatedDiscount,packageConversionApplied:true,confirmedPackMapping:true,supplierProfileRecovered:true,supplierProfileRule:"SUPPLIER_STOCK_CONVERSION",supplierProfileEvidence:{invoiceQuantity,stockQuantity,conversionFactor:factor,discount1:calculatedDiscount}};
}

function applyMappings(lines,profile){
  const mappings=profile?.mappings&&typeof profile.mappings==="object"?profile.mappings:{};
  const unitKind=value=>/^(PIECE|PCS|PC|TEM|ΤΕΜ|TMX|ΤΜΧ)$/.test(norm(value))?"PIECE":/^(PACKAGE|CASE|BOX|KIB|ΚΙΒ|ΚΒ)$/.test(norm(value))?"PACKAGE":null;
  return (lines||[]).map(line=>{
    const code=norm(line?.supplierItemCode||line?.code);const m=code?mappings[code]:null;
    if(!m)return line;
    const printedKind=unitKind(unitRelativeValues(sourceRow(line))?.unit||line.invoiceUnit||line.unit),learnedKind=unitKind(m.invoiceUnit);
    // A Super Admin line correction is the explicit resolution of a conflict
    // observed in a real draft (for example OCR says TEM while the operator
    // confirms PACKAGE x 100).  That exact supplier-code rule must outrank the
    // provider's unit label.  Older catalogue/profile metadata remains
    // fail-closed and cannot override a verified printed piece row.
    const explicitLineCorrection=m.verified===true&&m.source==="SUPER_ADMIN_LINE_CORRECTION";
    const compatible=explicitLineCorrection||!printedKind||!learnedKind||printedKind===learnedKind;
    const mapped={...line,...(compatible&&m.verified&&Number(m.unitsPerPackage)>=1?{unitsPerPackage:Number(m.unitsPerPackage),unit:m.invoiceUnit||line.unit,invoiceUnit:m.invoiceUnit||line.invoiceUnit,confirmedPackMapping:true}:{}),barcode:line.barcode||m.barcode||"",masterProductId:line.masterProductId||m.masterProductId||"",masterProductName:line.masterProductName||m.masterProductName||"",supplierProfileMappingApplied:true};
    return compatible?applySupplierStockConversion(mapped,m):mapped;
  });
}

export async function applyCentralSupplierProfile(parsed){
  const profile=await resolveCentralSupplierProfile(parsed?.supplier||{});
  if(!profile)return {...parsed,supplierReadingProfile:null};
  if(profile.ruleKey==="FRESH_SNACK_COMPLETE_PRINTED_TABLE")parsed=recoverFreshSnackWrappedLines(parsed);
  let productLines=Array.isArray(parsed?.productLines)?parsed.productLines.map(x=>({...x})):[];
  if(profile.ruleKey==="IFANTIS_FOOD_GROUP")productLines=productLines.map(line=>line.sourceColumnMap?line:recoverIfantisLine(line));
  if(profile.ruleKey==="STEFANIDIS_FOOD_PRINTED_COLUMNS")productLines=productLines.map(recoverStefanidisFoodLine);
  if(profile.ruleKey==="LEVENTOPOULOS_MM_POS1_COLUMNS")productLines=productLines.map(recoverLeventopoulosMmPos1Columns);
  // An explicitly saved supplier map is the operator's verified description
  // of the printed layout. Re-evaluate the current raw row even when the OCR
  // provider supplied its own (possibly shifted) column map. The recovery
  // remains fail-closed unless the printed row equation reconciles.
  if(profile?.readingRule?.layoutMode==="DECLARED_COLUMNS")productLines=productLines.map(line=>recoverDeclaredColumns(line,profile));
  if(profile?.readingRule?.quantityMode==="LINE_TOTAL_MATCH")productLines=productLines.map(line=>line.sourceColumnMap?line:recoverQuantityFromLineTotal(line));
  productLines=productLines.map(line=>{const source=unitRelativeValues(sourceRow(line)),signature=source?Object.keys(source.values).join(","):"",columns=profile.readingRule?.confirmedColumnLayouts?.[signature];return columns&&!line.sourceColumnMap?applyConfirmedColumns(line,columns):line});
  productLines=applyVerifiedCodeCorrections(productLines,profile);
  productLines=applyMappings(productLines,profile);
  // Existing LAB installations may already hold the first version of this
  // profile.  The fail-closed rule is intrinsic to this layout, so expose it
  // even before the seed refresh has persisted the new profile JSON.
  const requireCompletePrintedTableOnMismatch=profile?.readingRule?.requireCompletePrintedTableOnMismatch===true||profile.ruleKey==="LEVENTOPOULOS_MM_POS1_COLUMNS";
  return {
    ...parsed,
    productLines,
    lines:productLines.map(line=>({text:line.rawText||line.description||"",confidence:line.confidence||0})),
    supplierReadingProfile:{supplierKey:profile.supplierKey,supplierTaxId:profile.supplierTaxId,supplierName:profile.supplierName,commercialFamily:profile.commercialFamily||null,distributorName:profile.distributorName||null,ruleKey:profile.ruleKey,profileVersion:profile.profileVersion,requireCompletePrintedTableOnMismatch,updatedAt:profile.updatedAt},
    supplierProfileApplied:true
  };
}
