import {prisma} from "../prisma.js";
import {applyConfirmedColumns,recoverLeventopoulosMmPos1Columns,recoverStefanidisFoodLine,unitRelativeValues} from "./invoice-column-reading.js";

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

const unitWords=new Set(["TEM","ΤΕΜ","TMX","ΤΜΧ","PCS","PC","KIB","ΚΙΒ","KΒ","ΚΒ","KG","ΚG","ΚΙΛΑ","LT","LIT","ΦΑΚ"]);
const parseNumber=value=>{const n=Number(String(value||"").replace(",","."));return Number.isFinite(n)?n:null};
const wordsOf=line=>String(sourceRow(line)).trim().split(/\s+/).filter(Boolean);
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
  if(unitIndex<0){unitIndex=words.findIndex(word=>/^(TEM|ΤΕΜ|TMX|ΤΜΧ|PCS|KIB|ΚΙΒ|KG|ΚG|LT|ΦΑΚ)$/i.test(word))}
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
  const atColumn=column=>numericNear(words,unitIndex+(column-unitColumn),column>=unitColumn?1:-1);
  const mapped=role=>{const column=indexOf(role);return column>0?atColumn(column):null};
  const quantity=mapped("QUANTITY"),unitPrice=mapped("UNIT_PRICE"),before=mapped("AMOUNT_BEFORE_DISCOUNT"),after=mapped("AMOUNT_AFTER_DISCOUNT");
  if(!(quantity>0&&unitPrice>0))return line;
  const amount=after>0?after:before>0?before:null;
  // Do not override a row if the selected columns do not reconcile. A column map
  // is an aid, never permission to invent values.
  if(amount!==null&&!close(quantity*unitPrice,amount,Math.max(.03,amount*.012))){const recovered=amount/unitPrice;if(!(recovered>0&&recovered<=100000&&close(recovered,Math.round(recovered),.05)))return line;return {...line,quantity:Math.round(recovered),invoiceQuantity:Math.round(recovered),unitPrice:money4(unitPrice),unitCost:money4(unitPrice),netAmount:money2(amount),netValue:money2(amount),invoiceUnit:words[unitIndex],unit:words[unitIndex],supplierProfileRecovered:true,supplierProfileRule:"DECLARED_COLUMNS_LINE_TOTAL_RECOVERY"};}
  const discount1=mapped("DISCOUNT_1"),discount2=mapped("DISCOUNT_2"),discount3=mapped("DISCOUNT_3"),vatRate=mapped("VAT_RATE");
  const unit=words[unitIndex]||fallbackUnit;const net=amount===null?Number(line?.netAmount??line?.netValue??0):amount;
  return {...line,quantity,invoiceQuantity:quantity,unitPrice:money4(unitPrice),unitCost:money4(unitPrice),invoiceUnit:unit||line?.invoiceUnit,unit:unit||line?.unit,netAmount:net>0?money2(net):line?.netAmount,netValue:net>0?money2(net):line?.netValue,discount1:discount1!==null?money4(discount1):line?.discount1,discount2:discount2!==null?money4(discount2):line?.discount2,discount3:discount3!==null?money4(discount3):line?.discount3,vatRate:vatRate!==null?money4(vatRate):line?.vatRate,supplierProfileRecovered:true,supplierProfileRule:"DECLARED_COLUMNS",supplierProfileEvidence:{unitColumn,quantityColumn,priceColumn,amountColumn:after>0?indexOf("AMOUNT_AFTER_DISCOUNT"):indexOf("AMOUNT_BEFORE_DISCOUNT"),quantity,unitPrice:money4(unitPrice),amount:net>0?money2(net):null}};
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
  const calculatedDiscount=netAmount>0&&netAmount<=initialAmount+.02?money2(Math.max(0,(1-netAmount/initialAmount)*100)):Number(line?.discount1||0);
  const stockQuantity=money4(invoiceQuantity*factor);
  const stockUnit=String(mapping.stockUnit||mapping.stockConversion?.to||line?.stockUnit||line?.unit||"").trim();
  const invoiceUnit=String(mapping.invoiceUnit||line?.invoiceUnit||line?.unit||"").trim();
  // PurchaseOrderLine.quantity and unitCost always retain the printed invoice
  // economics. stockUnitsPerInvoiceUnit is the only conversion multiplier; the
  // review UI and stock posting derive stock quantity exactly once from it.
  return {...line,invoiceQuantity,invoiceUnit,packageUnitPrice,quantity:invoiceQuantity,unit:invoiceUnit,stockUnit,unitsPerPackage:factor,conversionFactor:factor,stockUnitsPerInvoiceUnit:factor,unitPrice:packageUnitPrice,unitCost:packageUnitPrice,netUnitCost:netAmount>0?money4(netAmount/invoiceQuantity):Number(line?.netUnitCost||0),initialAmount,discount1:calculatedDiscount,packageConversionApplied:true,supplierProfileRecovered:true,supplierProfileRule:"SUPPLIER_STOCK_CONVERSION",supplierProfileEvidence:{invoiceQuantity,stockQuantity,conversionFactor:factor,discount1:calculatedDiscount}};
}

function applyMappings(lines,profile){
  const mappings=profile?.mappings&&typeof profile.mappings==="object"?profile.mappings:{};
  const unitKind=value=>/^(PIECE|PCS|PC|TEM|ΤΕΜ|TMX|ΤΜΧ)$/.test(norm(value))?"PIECE":/^(PACKAGE|CASE|BOX|KIB|ΚΙΒ|ΚΒ)$/.test(norm(value))?"PACKAGE":null;
  return (lines||[]).map(line=>{
    const code=norm(line?.supplierItemCode||line?.code);const m=code?mappings[code]:null;
    if(!m)return line;
    const printedKind=unitKind(unitRelativeValues(sourceRow(line))?.unit||line.invoiceUnit||line.unit),learnedKind=unitKind(m.invoiceUnit);
    const compatible=!printedKind||!learnedKind||printedKind===learnedKind;
    const mapped={...line,...(compatible&&m.verified&&Number(m.unitsPerPackage)>=1?{unitsPerPackage:Number(m.unitsPerPackage),unit:m.invoiceUnit||line.unit,invoiceUnit:m.invoiceUnit||line.invoiceUnit,confirmedPackMapping:true}:{}),barcode:line.barcode||m.barcode||"",masterProductId:line.masterProductId||m.masterProductId||"",masterProductName:line.masterProductName||m.masterProductName||"",supplierProfileMappingApplied:true};
    return compatible?applySupplierStockConversion(mapped,m):mapped;
  });
}

export async function applyCentralSupplierProfile(parsed){
  const profile=await resolveCentralSupplierProfile(parsed?.supplier||{});
  if(!profile)return {...parsed,supplierReadingProfile:null};
  let productLines=Array.isArray(parsed?.productLines)?parsed.productLines.map(x=>({...x})):[];
  if(profile.ruleKey==="IFANTIS_FOOD_GROUP")productLines=productLines.map(line=>line.sourceColumnMap?line:recoverIfantisLine(line));
  if(profile.ruleKey==="STEFANIDIS_FOOD_PRINTED_COLUMNS")productLines=productLines.map(recoverStefanidisFoodLine);
  if(profile.ruleKey==="LEVENTOPOULOS_MM_POS1_COLUMNS")productLines=productLines.map(recoverLeventopoulosMmPos1Columns);
  if(profile?.readingRule?.layoutMode==="DECLARED_COLUMNS")productLines=productLines.map(line=>line.sourceColumnMap?line:recoverDeclaredColumns(line,profile));
  if(profile?.readingRule?.quantityMode==="LINE_TOTAL_MATCH")productLines=productLines.map(line=>line.sourceColumnMap?line:recoverQuantityFromLineTotal(line));
  productLines=productLines.map(line=>{const source=unitRelativeValues(sourceRow(line)),signature=source?Object.keys(source.values).join(","):"",columns=profile.readingRule?.confirmedColumnLayouts?.[signature];return columns&&!line.sourceColumnMap?applyConfirmedColumns(line,columns):line});
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
