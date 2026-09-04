import {prisma} from "../prisma.js";

const cleanTaxId=v=>String(v||"").replace(/\D/g,"");
const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g,"");
const money2=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;
const money4=v=>Math.round((Number(v||0)+Number.EPSILON)*10000)/10000;
const close=(a,b,tol=Math.max(.03,Math.abs(Number(b||0))*.012))=>Math.abs(Number(a||0)-Number(b||0))<=tol;

export async function resolveCentralSupplierProfile(supplier={}){
  const taxId=cleanTaxId(supplier?.taxId),name=norm(supplier?.name);
  try{
    let rows=[];
    if(taxId)rows=await prisma.$queryRawUnsafe(`SELECT "supplierKey","supplierTaxId","supplierName","ruleKey","profileVersion","profile","updatedAt" FROM "InvoiceSupplierReadingProfile" WHERE "supplierTaxId"=$1 AND "isActive"=TRUE LIMIT 1`,taxId);
    if(!rows.length&&name)rows=await prisma.$queryRawUnsafe(`SELECT "supplierKey","supplierTaxId","supplierName","ruleKey","profileVersion","profile","updatedAt" FROM "InvoiceSupplierReadingProfile" WHERE ("normalizedName"=$1 OR $1 LIKE '%'||"normalizedName"||'%' OR "normalizedName" LIKE '%'||$1||'%') AND "isActive"=TRUE ORDER BY "updatedAt" DESC LIMIT 1`,name);
    const r=rows?.[0];
    return r?{supplierKey:r.supplierKey,supplierTaxId:r.supplierTaxId,supplierName:r.supplierName,ruleKey:r.ruleKey,profileVersion:r.profileVersion,...(r.profile||{}),updatedAt:r.updatedAt}:null;
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
  const unitColumn=indexOf("UNIT"),quantityColumn=indexOf("QUANTITY"),priceColumn=indexOf("UNIT_PRICE");
  if(!(unitColumn>0&&quantityColumn>0&&priceColumn>0))return line;
  const words=wordsOf(line);if(!words.length)return line;
  let unitIndex=words.findIndex(word=>unitWords.has(norm(word)));
  if(unitIndex<0){unitIndex=words.findIndex(word=>/^(TEM|ΤΕΜ|TMX|ΤΜΧ|PCS|KIB|ΚΙΒ|KG|ΚG|LT|ΦΑΚ)$/i.test(word))}
  if(unitIndex<0)return line;
  const atColumn=column=>numericNear(words,unitIndex+(column-unitColumn),column>=unitColumn?1:-1);
  const mapped=role=>{const column=indexOf(role);return column>0?atColumn(column):null};
  const quantity=mapped("QUANTITY"),unitPrice=mapped("UNIT_PRICE"),before=mapped("AMOUNT_BEFORE_DISCOUNT"),after=mapped("AMOUNT_AFTER_DISCOUNT");
  if(!(quantity>0&&unitPrice>0))return line;
  const amount=after>0?after:before>0?before:null;
  // Do not override a row if the selected columns do not reconcile. A column map
  // is an aid, never permission to invent values.
  if(amount!==null&&!close(quantity*unitPrice,amount,Math.max(.03,amount*.012)))return line;
  const discount1=mapped("DISCOUNT_1"),discount2=mapped("DISCOUNT_2"),discount3=mapped("DISCOUNT_3"),vatRate=mapped("VAT_RATE");
  const unit=words[unitIndex];const net=amount===null?Number(line?.netAmount??line?.netValue??0):amount;
  return {...line,quantity,invoiceQuantity:quantity,unitPrice:money4(unitPrice),unitCost:money4(unitPrice),invoiceUnit:unit||line?.invoiceUnit,unit:unit||line?.unit,netAmount:net>0?money2(net):line?.netAmount,netValue:net>0?money2(net):line?.netValue,discount1:discount1!==null?money4(discount1):line?.discount1,discount2:discount2!==null?money4(discount2):line?.discount2,discount3:discount3!==null?money4(discount3):line?.discount3,vatRate:vatRate!==null?money4(vatRate):line?.vatRate,supplierProfileRecovered:true,supplierProfileRule:"DECLARED_COLUMNS",supplierProfileEvidence:{unitColumn,quantityColumn,priceColumn,amountColumn:after>0?indexOf("AMOUNT_AFTER_DISCOUNT"):indexOf("AMOUNT_BEFORE_DISCOUNT"),quantity,unitPrice:money4(unitPrice),amount:net>0?money2(net):null}};
}


function applyMappings(lines,profile){
  const mappings=profile?.mappings&&typeof profile.mappings==="object"?profile.mappings:{};
  return (lines||[]).map(line=>{
    const code=norm(line?.supplierItemCode||line?.code);const m=code?mappings[code]:null;
    if(!m)return line;
    return {...line,barcode:line.barcode||m.barcode||"",masterProductId:line.masterProductId||m.masterProductId||"",masterProductName:line.masterProductName||m.masterProductName||"",supplierProfileMappingApplied:true};
  });
}

export async function applyCentralSupplierProfile(parsed){
  const profile=await resolveCentralSupplierProfile(parsed?.supplier||{});
  if(!profile)return {...parsed,supplierReadingProfile:null};
  let productLines=Array.isArray(parsed?.productLines)?parsed.productLines.map(x=>({...x})):[];
  if(profile.ruleKey==="IFANTIS_FOOD_GROUP")productLines=productLines.map(recoverIfantisLine);
  if(profile?.readingRule?.layoutMode==="DECLARED_COLUMNS")productLines=productLines.map(line=>recoverDeclaredColumns(line,profile));
  if(profile?.readingRule?.quantityMode==="LINE_TOTAL_MATCH")productLines=productLines.map(recoverQuantityFromLineTotal);
  productLines=applyMappings(productLines,profile);
  return {
    ...parsed,
    productLines,
    lines:productLines.map(line=>({text:line.rawText||line.description||"",confidence:line.confidence||0})),
    supplierReadingProfile:{supplierKey:profile.supplierKey,supplierTaxId:profile.supplierTaxId,supplierName:profile.supplierName,ruleKey:profile.ruleKey,profileVersion:profile.profileVersion,updatedAt:profile.updatedAt},
    supplierProfileApplied:true
  };
}
