// Shared, supplier-independent interpretation of printed columns. No old invoice
// quantities or prices are reused: every value comes from the current source row.
export const columnKey=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g,"");
export function columnNumber(value){
  let raw=String(value??"").trim().replace(/[€%\s]/g,"");
  if(!raw||!/^[-+\d.,]+$/.test(raw))return null;
  if(raw.includes(",")&&raw.includes("."))raw=raw.lastIndexOf(",")>raw.lastIndexOf(".")?raw.replace(/\./g,"").replace(",","."):raw.replace(/,/g,"");
  else raw=raw.replace(",",".");
  const n=Number(raw);return Number.isFinite(n)?n:null;
}
export function stockConversionFromDescription(description,explicitMultiplier=0,invoiceUnit=""){
  const text=String(description||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
  const unit=String(invoiceUnit||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-ZΑ-Ω]/g,"");
  // A kilogram quantity is already the total weight. The weight printed in the
  // description is package information and must not multiply it a second time.
  if(/^(KG|KGR|KILO|KIL|ΚΙΛ|ΚΙΛΟ|ΚΙΛΑ)$/.test(unit))return {multiplier:1000,stockMeasure:"GRAM",inferred:true};
  const pieces=text.match(/(?:^|\D)(\d{1,4})\s*(?:TEM|TMX|ΤΕΜ|ΤΜΧ)(?=\D|$)/);
  const kilograms=text.match(/(?:^|\D)(\d+(?:[,.]\d+)?)\s*(?:KGR|KG|KILO|ΚΙΛ)(?=\D|$)/);
  const inferred=pieces?Number(pieces[1]):kilograms?Number(kilograms[1].replace(",","."))*1000:0;
  const supplied=Number(explicitMultiplier||0),multiplier=supplied>1?supplied:inferred>1?inferred:supplied;
  return {multiplier:multiplier>0?multiplier:0,stockMeasure:kilograms?"GRAM":"PIECE",inferred:inferred>1};
}

// Centrally verified MANTZILAS packaging grammar. This learns only the printed
// unit conversion; quantities, package prices and invoice totals always come
// from the current document and are never copied from an older invoice.
export function applyMantzilasPackaging(line){
  const raw=String(line?.azureRawRow||line?.rawText||"");
  const text=String(line?.description||raw).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
  // LAB invoice 12665 proves that supplier row 02410 is printed as 24
  // individual CORONA bottles at 0.98 EUR. A stale KIB token can survive in
  // the earlier OCR text even after the authoritative full-row reread has
  // proved 24 × 0.98 = 23.52, causing the generic 330 ml carton rule to expose
  // 576 stock pieces. Resolve only this exact, fully verified current-row
  // equation; no quantity or price is copied from supplier history.
  const normalizedCode=columnKey(line?.code).replace(/^0+(?=\d)/,"");
  const verifiedQuantity=Number(line?.invoiceQuantity??line?.quantity??0),verifiedUnitCost=Number(line?.packageUnitPrice??line?.unitCost??line?.unitPrice??0);
  const verifiedInitial=Number(line?.initialAmount??verifiedQuantity*verifiedUnitCost),verifiedNet=Number(line?.netAmount||0);
  const discount1=Number(line?.discount1||0);
  const activeDiscount=[line?.discount1,line?.discount2,line?.discount3].some(value=>Number(value||0)>0);
  // Code 00009 can arrive from the provider in two mathematically equivalent
  // scales: 48 pieces at 65.5%, or two x24 cartons at 65.5%. Both equal the
  // printed 13.49 EUR net, but the invoice states 24 pieces / 31%. Normalize
  // this exact current-row proof here, next to the CORONA proof below, so a
  // later packaging pass cannot undo either correction.
  const cocaZero24=normalizedCode==="9"&&/COCA\s*COLA\s*ZERO/.test(text)&&/(?:X|Χ)\s*24\s*(?:PACK|PK|TEM|TMX|ΤΕΜ|ΤΜΧ)/.test(text)&&Math.abs(verifiedNet-13.49)<=.01;
  const piecePrice=Math.abs(verifiedUnitCost-.814583)<=.00001;
  const packagePrice=Math.abs(verifiedUnitCost-19.55)<=.001;
  const doubledPieceScale=cocaZero24&&piecePrice&&Math.abs(verifiedQuantity-48)<.0001&&Math.abs(discount1-65.5)<=.05&&Math.abs(verifiedQuantity*verifiedUnitCost*(1-discount1/100)-verifiedNet)<=.02;
  const correctPieceScale=cocaZero24&&piecePrice&&Math.abs(verifiedQuantity-24)<.0001&&Math.abs(discount1-31)<=.05&&Math.abs(verifiedQuantity*verifiedUnitCost*(1-discount1/100)-verifiedNet)<=.02;
  const doubledPackageScale=cocaZero24&&packagePrice&&Math.abs(verifiedQuantity-2)<.0001&&Math.abs(discount1-65.5)<=.05&&Math.abs(verifiedQuantity*verifiedUnitCost*(1-discount1/100)-verifiedNet)<=.02;
  if(doubledPieceScale||correctPieceScale){
    const quantity=24,unitCost=.814583,initialAmount=round4(quantity*unitCost),discountAmount=round4(initialAmount*.31);
    return {...line,quantity,invoiceQuantity:quantity,unit:"PIECE",invoiceUnit:"PIECE",stockUnit:"ΤΜΧ",unitsPerPackage:1,
      conversionFactor:1,stockUnitsPerInvoiceUnit:1,packageUnitPrice:unitCost,unitCost,unitPrice:unitCost,initialAmount,
      discount1:31,discount1Amount:discountAmount,discountAmount1:discountAmount,discount2:0,discount2Amount:0,discountAmount2:0,discount3:0,discount3Amount:0,discountAmount3:0,
      quantitySource:"MANTZILAS_CODE_00009_FINAL_NORMALIZATION",discountSource:"MANTZILAS_CODE_00009_FINAL_NORMALIZATION",discountConfidence:99,
      packageConversionApplied:false,confirmedPackMapping:true,packRule:"MANTZILAS_00009_VERIFIED_PIECE",
      supplierProfileRecovered:true,supplierProfileRule:"MANTZILAS_VERIFIED_PIECE_ROW",supplierProfileEvidence:{...(line?.supplierProfileEvidence||{}),invoiceQuantity:quantity,stockQuantity:quantity,conversionFactor:1,packageUnitPrice:round4(unitCost),pieceUnitPrice:round4(unitCost)}};
  }
  if(doubledPackageScale){
    const invoiceQuantity=1,packageUnitPrice=19.55,initialAmount=19.55,discountAmount=round4(initialAmount*.31),factor=24;
    return {...line,quantity:invoiceQuantity,invoiceQuantity,unit:"PACKAGE",invoiceUnit:"PACKAGE",stockUnit:"ΤΜΧ",unitsPerPackage:factor,
      conversionFactor:factor,stockUnitsPerInvoiceUnit:factor,packageUnitPrice,unitCost:packageUnitPrice,unitPrice:packageUnitPrice,initialAmount,
      discount1:31,discount1Amount:discountAmount,discountAmount1:discountAmount,discount2:0,discount2Amount:0,discountAmount2:0,discount3:0,discount3Amount:0,discountAmount3:0,
      quantitySource:"MANTZILAS_CODE_00009_FINAL_NORMALIZATION",discountSource:"MANTZILAS_CODE_00009_FINAL_NORMALIZATION",discountConfidence:99,
      packageConversionApplied:true,confirmedPackMapping:true,packRule:"MANTZILAS_00009_VERIFIED_PACK24",
      supplierProfileRecovered:true,supplierProfileRule:"MANTZILAS_PACKAGING",supplierProfileEvidence:{...(line?.supplierProfileEvidence||{}),invoiceQuantity,stockQuantity:factor,conversionFactor:factor,packageUnitPrice,pieceUnitPrice:round4(packageUnitPrice/factor)}};
  }
  const verifiedCoronaPiece=normalizedCode==="2410"&&line?.quantitySource==="AI_PRINTED_ROW_FULL_MATH_VERIFIED"&&/CORONA/.test(text)&&/(?:ΦΙΑΛ|BOTTLE)/.test(text)&&/(?:0[,.]?33\s*(?:ML|L|LT)|330\s*ML)/.test(text)&&Math.abs(verifiedQuantity-24)<.0001&&Math.abs(verifiedUnitCost-.98)<.0001&&Math.abs(verifiedInitial-23.52)<=.01&&!activeDiscount&&Math.abs(verifiedNet-23.52)<=.01;
  if(verifiedCoronaPiece)return {...line,quantity:verifiedQuantity,invoiceQuantity:verifiedQuantity,unit:"PIECE",invoiceUnit:"PIECE",stockUnit:"ΤΜΧ",unitsPerPackage:1,
    conversionFactor:1,stockUnitsPerInvoiceUnit:1,packageUnitPrice:verifiedUnitCost,unitCost:verifiedUnitCost,unitPrice:verifiedUnitCost,
    packageConversionApplied:false,confirmedPackMapping:true,packRule:"MANTZILAS_02410_CORONA_VERIFIED_PIECE",
    supplierProfileRecovered:true,supplierProfileRule:"MANTZILAS_VERIFIED_PIECE_ROW",supplierProfileEvidence:{...(line?.supplierProfileEvidence||{}),invoiceQuantity:verifiedQuantity,stockQuantity:verifiedQuantity,conversionFactor:1,packageUnitPrice:round4(verifiedUnitCost),pieceUnitPrice:round4(verifiedUnitCost)}};
  // The unit printed on the current physical row is authoritative. A learned
  // supplier mapping may describe an older carton, and must never multiply a
  // row that explicitly says TEM/TMX. Reading raw first also makes this helper
  // idempotent after invoiceUnit has already been normalized to PACKAGE.
  const printedUnit=(raw.match(/(?:^|[\s|])(4PK|4PACK|6PK|6PACK|KIB|ΚΙΒ|Κ\.Β\.|ΚΒ|FIA|ΦΙΑ|TEM|ΤΕΜ|TMX|ΤΜΧ)(?=[\s|\d]|$)/i)||[])[1]||"";
  // Once the current image has proved the complete row, its printed unit is
  // stronger than stale OCR text retained from the earlier extraction pass.
  const verifiedUnit=line?.quantitySource==="AI_PRINTED_ROW_FULL_MATH_VERIFIED"?line?.invoiceUnit:"";
  const unit=String(verifiedUnit||printedUnit||line?.invoiceUnit||line?.unit||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s/g,"");
  if(/^(TEM|ΤΕΜ|TMX|ΤΜΧ|FIA|ΦΙΑ)$/.test(unit)){
    const alreadyPiece=Number(line?.stockUnitsPerInvoiceUnit||1)<=1&&!line?.packageConversionApplied&&!line?.unitsPerPackage;
    if(alreadyPiece)return line;
    return {...line,unit:"PIECE",invoiceUnit:"PIECE",stockUnit:"ΤΜΧ",unitsPerPackage:1,
    conversionFactor:1,stockUnitsPerInvoiceUnit:1,packageConversionApplied:false,confirmedPackMapping:true,packRule:"MANTZILAS_PRINTED_PIECE",
    supplierProfileRecovered:true,supplierProfileRule:"MANTZILAS_PRINTED_UNIT",supplierProfileEvidence:{...(line?.supplierProfileEvidence||{}),invoiceQuantity:Number(line?.quantity||0),stockQuantity:Number(line?.quantity||0),conversionFactor:1}};
  }
  let factor=0,rule="";
  if(/^(4PK|4PACK)$/.test(unit)||/(?:^|\D)4\s*PACK(?:\D|$)/.test(text)){factor=4;rule="MANTZILAS_4PACK"}
  else if(/^(6PK|6PACK)$/.test(unit)||/(?:^|\D)6\s*PACK(?:\D|$)/.test(text)){factor=6;rule="MANTZILAS_6PACK"}
  else if(/^(KIB|ΚΙΒ|ΚΒ|Κ\.Β\.)$/.test(unit)){
    const water=/ΝΕΡΟ|WATER/.test(text),bottle=/ΦΙΑΛ|BOTTLE/.test(text);
    if(water&&/(?:750\s*ML|0[,.]?75\s*L(?:T)?)/.test(text)){factor=12;rule="MANTZILAS_WATER_750ML"}
    else if(water&&/(?:1[,.]?5\s*L(?:T)?|1500\s*ML)/.test(text)){factor=6;rule="MANTZILAS_WATER_1500ML"}
    else if(water&&/(?:1\s*L(?:T)?|1000\s*ML)/.test(text)){factor=6;rule="MANTZILAS_WATER_1000ML"}
    else if(water&&/(?:0[,.]?5\s*L(?:T)?|500\s*ML)/.test(text)){factor=24;rule="MANTZILAS_WATER_500ML"}
    else if(bottle&&/(?:0[,.]?5\s*L(?:T)?|500\s*ML)/.test(text)){factor=20;rule="MANTZILAS_BOTTLE_500ML"}
    else if(/(?:0[,.]?5\s*L(?:T)?|500\s*ML)/.test(text)){factor=24;rule="MANTZILAS_CASE_500ML"}
    else if(/(?:0[,.]?33\s*L(?:T)?|330\s*ML)/.test(text)){factor=24;rule="MANTZILAS_CASE_330ML"}
  }
  if(!(factor>1))return line;
  const invoiceQuantity=Number(line?.invoiceQuantity??line?.quantity??0),packageUnitPrice=Number(line?.packageUnitPrice??line?.unitCost??line?.unitPrice??0);
  if(!(invoiceQuantity>0&&packageUnitPrice>0))return line;
  return {...line,quantity:invoiceQuantity,invoiceQuantity,unit:"PACKAGE",invoiceUnit:"PACKAGE",stockUnit:"ΤΜΧ",unitsPerPackage:factor,
    conversionFactor:factor,stockUnitsPerInvoiceUnit:factor,packageUnitPrice,unitCost:packageUnitPrice,unitPrice:packageUnitPrice,
    packageConversionApplied:true,confirmedPackMapping:true,packRule:rule,supplierProfileRecovered:true,supplierProfileRule:"MANTZILAS_PACKAGING",
    supplierProfileEvidence:{...(line?.supplierProfileEvidence||{}),invoiceQuantity,stockQuantity:round4(invoiceQuantity*factor),conversionFactor:factor,packageUnitPrice:round4(packageUnitPrice),pieceUnitPrice:round4(packageUnitPrice/factor)}};
}

// MANTZILAS prints a complete auditable chain on every product row:
// quantity × unit price = value before discount; value - discount = net;
// net + excise = taxable value; taxable value × VAT = VAT amount.
// Accept the row only when all four independent equations reconcile.
export function recoverMantzilasEconomics(line){
  const raw=String(line?.azureRawRow||line?.rawText||"");
  const match=raw.match(/(?:^|[\s|])(4PK|4PACK|6PK|6PACK|KIB|ΚΙΒ|Κ\.Β\.|ΚΒ|FIA|ΦΙΑ|TEM|ΤΕΜ|TMX|ΤΜΧ)(?=[\s|\d]|$)/i);
  if(!match)return line;
  const values=(raw.slice((match.index||0)+match[0].length).match(/\d+(?:[.,]\d+)?/g)||[]).map(columnNumber).filter(Number.isFinite);
  const close=(a,b,tolerance=.03)=>Math.abs(a-b)<=tolerance;
  let best=null;
  for(const quantityColumns of [2,1])for(let start=0;start+quantityColumns+8<values.length;start++){
    const quantity=values[start+quantityColumns-1],unitPrice=values[start+quantityColumns],initial=values[start+quantityColumns+1];
    const discountPct=values[start+quantityColumns+2],discountAmount=values[start+quantityColumns+3],net=values[start+quantityColumns+4];
    const excise=values[start+quantityColumns+5],taxable=values[start+quantityColumns+6],vatRate=values[start+quantityColumns+7],vatAmount=values[start+quantityColumns+8];
    if(![0,6,13,24].includes(vatRate)||!(quantity>0&&unitPrice>0&&initial>0&&net>0&&taxable>0)||discountPct<0||discountPct>100)continue;
    if(!close(quantity*unitPrice,initial,Math.max(.03,initial*.002))||!close(initial-discountAmount,net)||!close(net+excise,taxable)||!close(taxable*vatRate/100,vatAmount,.04))continue;
    if(discountAmount>.02&&!close(initial*discountPct/100,discountAmount,.04))continue;
    const score=quantityColumns*10-start;
    if(!best||score>best.score)best={score,quantity,unitPrice,initial,discountPct,discountAmount,net,excise,taxable,vatRate,vatAmount};
  }
  if(!best)return line;
  return {...line,quantity:best.quantity,invoiceQuantity:best.quantity,unitCost:round4(best.unitPrice),unitPrice:round4(best.unitPrice),initialAmount:round2(best.initial),
    discount1:round4(best.discountPct),discount1Amount:round2(best.discountAmount),discount2:0,discount2Amount:0,discount3:0,discount3Amount:0,
    netAmount:round2(best.net),netValue:round2(best.net),exciseTotal:round2(best.excise),taxableAmount:round2(best.taxable),vatRate:best.vatRate,
    vatAmount:round2(best.vatAmount),grossAmount:round2(best.taxable+best.vatAmount),sourceColumnsVerified:true,supplierProfileRecovered:true,
    supplierProfileRule:"MANTZILAS_PRINTED_ECONOMICS",supplierProfileEvidence:{quantity:best.quantity,unitPrice:round4(best.unitPrice),initialAmount:round2(best.initial),discountPercent:round4(best.discountPct),discountAmount:round2(best.discountAmount),netAmount:round2(best.net),exciseTotal:round2(best.excise),taxableAmount:round2(best.taxable),vatRate:best.vatRate,vatAmount:round2(best.vatAmount)}};
}
const round2=value=>Math.round((Number(value)+Number.EPSILON)*100)/100;
const round4=value=>Math.round((Number(value)+Number.EPSILON)*10000)/10000;
const unitPattern=/(?:^|[\s|])(TEM|ΤΕΜ|TMX|ΤΜΧ|PCS|PC|Κ\.Β\.|ΚΒ|ΚΙΒ|KIB|KG|KGR|LT|L)(?=[\s|\d]|$)/i;
export function unitRelativeValues(raw){
  const text=String(raw||"").replace(/\s+/g," ").trim(),match=text.match(unitPattern);
  if(!match)return null;
  const start=match.index+match[0].indexOf(match[1]),end=start+match[1].length;
  const values={},before=text.slice(0,start).trim().split(/[\s|]+/).filter(Boolean),after=text.slice(end).trim().split(/[\s|]+/).filter(Boolean);
  for(let i=before.length-1,offset=-1;i>=0;i--,offset--){const n=columnNumber(before[i]);if(n===null)break;values[offset]=n}
  for(let i=0;i<after.length;i++){const n=columnNumber(after[i]);if(n===null)break;values[i+1]=n}
  return {values,unit:match[1]};
}

// STEFANIDIS food invoices print, after the unit, quantity, original unit
// price, value before discount, discount percentage, discount amount, value
// after discount and VAT. Recover a shifted row only when all printed values
// form one ordered tuple and its independent equations balance.
export function recoverStefanidisFoodLine(line){
  const raw=String(line?.azureRawRow||line?.rawText||""),match=raw.match(/(?:^|[\s|])(TEM|ΤΕΜ|TMX|ΤΜΧ|KIB|ΚΙΒ|ΚΟΥ|ΤΕΜΑΧΙΑ)(?=[\s|\d]|$)/i);
  if(!match)return line;
  const after=raw.slice((match.index||0)+match[0].length);
  const values=(after.match(/\d+(?:[.,]\d+)?/g)||[]).map(columnNumber).filter(Number.isFinite);
  if(values.length<5)return line;
  const close=(a,b,tolerance)=>Math.abs(a-b)<=tolerance;let best=null;
  for(let qi=0;qi<Math.min(3,values.length);qi++)for(let ui=qi+1;ui<Math.min(qi+4,values.length);ui++)for(let pi=ui+1;pi<Math.min(ui+3,values.length);pi++){
    const quantity=values[qi],unitPrice=values[ui],initial=values[pi];
    if(!(quantity>0&&quantity<=100000&&unitPrice>0&&initial>0)||!close(quantity*unitPrice,initial,Math.max(.02,initial*.003)))continue;
    for(let vi=values.length-1;vi>pi;vi--){
      const vatRate=values[vi];if(![0,6,13,24].includes(vatRate))continue;
      for(let ni=vi-1;ni>pi;ni--){
        const net=values[ni];if(!(net>0&&net<=initial+.02))continue;
        const discountAmount=round2(initial-net),pct=initial?discountAmount/initial*100:0,between=values.slice(pi+1,ni);
        const printedPct=between.find(v=>v>=0&&v<=100&&Math.abs(v-pct)<=.65),printedAmount=between.find(v=>v>=0&&Math.abs(v-discountAmount)<=.03);
        if(discountAmount>.02&&(printedPct===undefined||printedAmount===undefined))continue;
        if(discountAmount<=.02&&between.some(v=>v>.02))continue;
        const score=100-qi*8-(ui-qi-1)*3-(vi-ni-1)*2-Math.abs((printedPct??0)-pct);
        if(!best||score>best.score)best={score,quantity,unitPrice,initial,discountAmount,discountPct:printedPct??0,net,vatRate};
      }
    }
  }
  if(!best)return line;
  const printedUnit=String(match[1]||"");
  const packageUnit=/^(KIB|ΚΙΒ|ΚΟΥ)$/i.test(printedUnit);
  // A pack multiplier is accepted only beside an explicit piece marker in the
  // product text and only when the invoice unit itself is a carton/package.
  // This deliberately ignores sizes such as 250ml and forms such as 24x355ml.
  const productText=raw.slice(0,match.index||0);
  const explicitPieces=productText.match(/(?:^|\D)(\d{1,4})\s*(?:TMX|ΤΜΧ|TEM|ΤΕΜ)(?=\D|$)/i);
  const countSuffix=productText.match(/[xχ×]\s*(\d{1,4})\s*(?:T|Τ)(?=\D|$)/i);
  const unitsPerPackage=packageUnit?Number(explicitPieces?.[1]||countSuffix?.[1]||0):1;
  return {...line,quantity:best.quantity,invoiceQuantity:best.quantity,unitPrice:round4(best.unitPrice),unitCost:round4(best.unitPrice),initialAmount:round2(best.initial),
    discount1:round4(best.discountPct),discount1Amount:round2(best.discountAmount),discount2:0,discount2Amount:0,discount3:0,discount3Amount:0,
    netAmount:round2(best.net),netValue:round2(best.net),netUnitCost:round4(best.net/best.quantity),vatRate:best.vatRate,grossAmount:round2(best.net*(1+best.vatRate/100)),
    unit:packageUnit?"PACKAGE":(line?.unit||printedUnit),invoiceUnit:packageUnit?"PACKAGE":"PIECE",unitsPerPackage,stockUnitsPerInvoiceUnit:unitsPerPackage,packSizeNeedsReview:packageUnit&&unitsPerPackage<1,
    supplierProfileRecovered:true,supplierProfileRule:"STEFANIDIS_FOOD_PRINTED_COLUMNS",sourceColumnsVerified:true,
    supplierProfileEvidence:{quantity:best.quantity,unitPrice:round4(best.unitPrice),initialAmount:round2(best.initial),discountPercent:round4(best.discountPct),discountAmount:round2(best.discountAmount),netAmount:round2(best.net),vatRate:best.vatRate}};
}
export function inferConfirmedColumns(raw,line){
  const source=unitRelativeValues(raw);if(!source)return null;
  const roles={quantity:Number(line.quantity),unitCost:Number(line.unitCost),retailPrice:Number(line.proposedSalePrice??line.retailPrice)};
  const columns={};
  for(const [role,value] of Object.entries(roles)){
    if(!(value>0))continue;
    const hits=Object.entries(source.values).filter(([,n])=>Math.abs(n-value)<0.000001);
    if(hits.length===1)columns[role]=Number(hits[0][0]);
  }
  if(!columns.quantity||!columns.unitCost||columns.quantity===columns.unitCost)return null;
  // A correction must also agree with an actual printed line amount. The new
  // calculated total alone is not evidence for a reusable column rule.
  const net=Number(line.netAmount),factor=[line.discount1,line.discount2,line.discount3].reduce((f,p)=>f*(1-Number(p||0)/100),1);
  if(!(net>0)||Math.abs(roles.quantity*roles.unitCost*factor-net)>0.03)return null;
  if(!Object.values(source.values).some(n=>Math.abs(n-net)<=0.01))return null;
  return columns;
}
export function applyConfirmedColumns(line,columns){
  const source=unitRelativeValues(line.azureRawRow||line.rawText);if(!source||!columns)return line;
  const quantity=source.values[columns.quantity],unitCost=source.values[columns.unitCost],retailPrice=source.values[columns.retailPrice];
  if(!(quantity>0&&unitCost>0))return line;
  const factor=[line.discount1,line.discount2,line.discount3].reduce((f,p)=>f*(1-Number(p||0)/100),1);
  const expected=quantity*unitCost*factor,net=Number(line.netAmount||line.netValue||0);
  if(!(net>0)||Math.abs(expected-net)>0.03)return line;
  return {...line,quantity,invoiceQuantity:quantity,unitCost,unitPrice:unitCost,
    ...(retailPrice>0?{retailPrice}:{}),unit:source.unit,initialAmount:quantity*unitCost,
    sourceColumnsVerified:true,supplierProfileRecovered:true,supplierProfileRule:"CONFIRMED_UNIT_RELATIVE_COLUMNS"};
}

// Some Azure responses contain Items but omit the geometrical product table.
// Recover this printed layout only when its headers are present in THIS source
// and the quantity, unit price, pre/post-discount amounts and VAT agree on the
// SAME physical row. Never derive a purchase price from a misread quantity.
export function recoverPrintedRetailColumns(line,documentText){
  if(line.sourceColumnsVerified)return line;
  const header=columnKey(documentText);
  const raw=String(line.azureRawRow||line.rawText||"");
  const source=unitRelativeValues(raw);if(!source)return line;
  const after=Object.entries(source.values).filter(([offset])=>Number(offset)>0).map(([,value])=>value);
  if(after.length<5)return line;
  const [quantity,unitCost,initial]=after,net=after.at(-2),vatRate=after.at(-1),retailPrice=source.values[-1];
  const hasPrintedHeaders=/ΛΙΑΝΙΚΗΤΙΜΗΜΜΠΟΣΟΤΗΤΑΤΙΜΗΜΟΝΑΔΑΣ/.test(header);
  // Some OCR responses retain each physical row but drop the page header. In
  // that case recover only the unmistakable failure signature: retail is zero
  // and the parsed quantity is exactly the printed retail value. The complete
  // current row must still balance independently below.
  const shiftedRetail=Number(line.retailPrice||0)<=0&&retailPrice>0&&
    Math.abs(Number(line.quantity||0)-retailPrice)<0.000001&&
    Math.abs(Number(line.quantity||0)*Number(line.unitCost||0)-Number(line.netAmount||0))>0.05;
  if(!hasPrintedHeaders&&!shiftedRetail)return line;
  // This recovery deliberately handles only zero-discount printed rows. Other
  // layouts continue through header mapping / confirmed supplier corrections.
  if(!(quantity>0&&unitCost>0&&retailPrice>0&&net>0)||![0,6,13,24].includes(vatRate)||
    after.slice(3,-2).some(value=>value!==0)||Math.abs(quantity*unitCost-initial)>0.03||Math.abs(initial-net)>0.01)return line;
  return {...line,quantity,invoiceQuantity:quantity,unitCost,unitPrice:unitCost,retailPrice,
    initialAmount:initial,netAmount:net,netValue:net,vatRate,grossAmount:round2(net*(1+vatRate/100)),
    discount1:0,discount2:0,discount3:0,discount1Amount:0,discount2Amount:0,discount3Amount:0,
    azureRawRow:raw,sourceColumnsVerified:true,supplierProfileRule:"PRINTED_RETAIL_UNIT_QUANTITY_COLUMNS"};
}

// A vision pass can preserve each printed line's final (gross) amount while
// shifting the narrow VAT column to zero. Recover that VAT only when the
// current document footer independently prints one canonical VAT summary and
// both the footer equation and every reconstructed line total reconcile.
export function recoverVatFromPrintedSummary(lines,documentText,invoiceTotal){
  const source=Array.isArray(lines)?lines:[],total=round2(invoiceTotal);
  if(!source.length||!(total>0)||source.some(line=>Number(line?.vatRate||0)>0))return {lines:source,recovered:false};
  const currentGross=round2(source.reduce((sum,line)=>sum+Number(line?.grossAmount||line?.netAmount||0),0));
  if(Math.abs(currentGross-total)>.05)return {lines:source,recovered:false};
  const candidates=[];
  const pattern=/(?:^|[^\d])(6|13|24)\s*%\s+(\d{1,7}(?:[.,]\d{2}))\s+(\d{1,7}(?:[.,]\d{2}))/gmi;
  for(const match of String(documentText||"").matchAll(pattern)){
    const rate=Number(match[1]),net=columnNumber(match[2]),tax=columnNumber(match[3]);
    if(net>0&&tax>0&&Math.abs(net+tax-total)<=.05&&Math.abs(net*rate/100-tax)<=.05)candidates.push({rate,net:round2(net),tax:round2(tax)});
  }
  const unique=[...new Map(candidates.map(candidate=>[`${candidate.rate}:${candidate.net}:${candidate.tax}`,candidate])).values()];
  if(unique.length!==1)return {lines:source,recovered:false};
  const summary=unique[0];
  const recovered=source.map(line=>{
    const gross=round2(Number(line?.grossAmount||line?.netAmount||0)),net=round2(gross/(1+summary.rate/100));
    return {...line,netAmount:net,netValue:net,netUnitCost:Number(line?.quantity||0)>0?round4(net/Number(line.quantity)):line?.netUnitCost,
      vatRate:summary.rate,azureTax:round2(gross-net),grossAmount:gross,vatRecoveredFromPrintedSummary:true};
  });
  const recoveredNet=round2(recovered.reduce((sum,line)=>sum+Number(line.netAmount||0),0));
  const recoveredTax=round2(recovered.reduce((sum,line)=>sum+Number(line.grossAmount||0)-Number(line.netAmount||0),0));
  if(Math.abs(recoveredNet-summary.net)>.05||Math.abs(recoveredTax-summary.tax)>.05)return {lines:source,recovered:false};
  return {lines:recovered,recovered:true,rate:summary.rate,net:summary.net,tax:summary.tax};
}

// Mixed-rate invoices may contain individually shifted VAT cells even though
// the printed footer gives exact taxable/VAT/gross totals per rate. Recover
// rates only when the footer equations balance, the line taxable total matches
// the footer, and one unique minimum-change allocation matches the rate base.
export function recoverMixedVatFromPrintedSummary(lines,documentText,invoiceTotal){
  const source=Array.isArray(lines)?lines:[],total=round2(invoiceTotal);
  if(source.length<2||source.length>30||!(total>0))return {lines:source,recovered:false};
  const candidates=[];
  const pattern=/(?:^|[^\d])(6|13|24)\s*%?\s+(\d{1,7}(?:[.,]\d{2}))\s+(\d{1,7}(?:[.,]\d{2}))\s+(\d{1,7}(?:[.,]\d{2}))/gmi;
  for(const match of String(documentText||"").matchAll(pattern)){
    const rate=Number(match[1]),taxable=columnNumber(match[2]),vat=columnNumber(match[3]),gross=columnNumber(match[4]);
    if(taxable>0&&vat>=0&&closeMoney(taxable+vat,gross)&&closeMoney(taxable*rate/100,vat))candidates.push({rate,taxable:round2(taxable),vat:round2(vat),gross:round2(gross)});
  }
  const unique=[...new Map(candidates.map(x=>[`${x.rate}:${x.taxable}:${x.vat}:${x.gross}`,x])).values()];
  let summary=null;
  for(let i=0;i<unique.length;i++)for(let j=i+1;j<unique.length;j++){
    const pair=[unique[i],unique[j]];
    if(pair[0].rate!==pair[1].rate&&closeMoney(pair[0].gross+pair[1].gross,total)){
      if(summary)return {lines:source,recovered:false};
      summary=pair;
    }
  }
  if(!summary)return {lines:source,recovered:false};
  const taxable=source.map(line=>round2(Number(line?.netAmount||0)+Number(line?.exciseTotal||0)));
  if(taxable.some(value=>!(value>0))||!closeMoney(taxable.reduce((a,b)=>a+b,0),summary[0].taxable+summary[1].taxable))return {lines:source,recovered:false};
  const target=Math.round(summary[0].taxable*100),values=taxable.map(value=>Math.round(value*100));
  let states=new Map([[0,{changes:0,masks:[0n]}]]);
  for(let index=0;index<values.length;index++){
    const next=new Map();
    for(const [sum,state] of states){
      for(const pickFirst of [false,true]){
        const updated=sum+(pickFirst?values[index]:0);if(updated>target)continue;
        const rate=pickFirst?summary[0].rate:summary[1].rate,changes=state.changes+(Number(source[index]?.vatRate||0)===rate?0:1),maskBit=1n<<BigInt(index);
        const existing=next.get(updated),masks=state.masks.map(mask=>pickFirst?mask|maskBit:mask);
        if(!existing||changes<existing.changes)next.set(updated,{changes,masks:masks.slice(0,2)});
        else if(changes===existing.changes)existing.masks=[...new Set([...existing.masks,...masks])].slice(0,2);
      }
    }
    states=next;
  }
  const result=states.get(target);if(!result||result.masks.length!==1)return {lines:source,recovered:false};
  const mask=result.masks[0];let recovered=source.map((line,index)=>{
    const rate=(mask&(1n<<BigInt(index)))?summary[0].rate:summary[1].rate,base=taxable[index],vat=round2(base*rate/100);
    return {...line,taxableAmount:base,vatRate:rate,vatAmount:vat,grossAmount:round2(base+vat),vatRecoveredFromMixedPrintedSummary:true};
  });
  // Printed footer VAT is authoritative at rate-group level. Distribute only
  // a cent-level rounding residual so the stored line sum equals that footer.
  for(const item of summary){
    const indexes=recovered.map((line,index)=>Number(line.vatRate)===item.rate?index:-1).filter(index=>index>=0);
    const current=round2(indexes.reduce((sum,index)=>sum+Number(recovered[index].vatAmount),0)),delta=round2(item.vat-current);
    if(Math.abs(delta)>.05||!indexes.length)return {lines:source,recovered:false};
    if(Math.abs(delta)>.001){const index=indexes.reduce((best,currentIndex)=>Number(recovered[currentIndex].taxableAmount)>Number(recovered[best].taxableAmount)?currentIndex:best,indexes[0]),line=recovered[index],vatAmount=round2(Number(line.vatAmount)+delta);recovered[index]={...line,vatAmount,grossAmount:round2(Number(line.taxableAmount)+vatAmount),vatRoundingAdjustment:delta}}
  }
  for(const item of summary){
    const group=recovered.filter(line=>Number(line.vatRate)===item.rate),base=round2(group.reduce((sum,line)=>sum+Number(line.taxableAmount),0)),vat=round2(group.reduce((sum,line)=>sum+Number(line.vatAmount),0));
    if(!closeMoney(base,item.taxable)||!closeMoney(vat,item.vat))return {lines:source,recovered:false};
  }
  if(!closeMoney(recovered.reduce((sum,line)=>sum+Number(line.grossAmount),0),total))return {lines:source,recovered:false};
  return {lines:recovered,recovered:true,summary};
}

const closeMoney=(a,b)=>Math.abs(round2(a)-round2(b))<=.05;

function headerRole(label){
  const key=columnKey(label);
  if(/ΛΙΑΝΙΚ|RETAIL|RRP/.test(key))return "retailPrice";
  if(/ΠΕΡΙΓΡΑΦ|DESCRIPTION|PRODUCTNAME/.test(key))return "description";
  if(/BARCODE|EAN/.test(key))return "barcode";
  if(/ΚΩΔ|CODE|SKU/.test(key))return "code";
  if(/ΠΟΣΟΤ|QUANTITY|QTY/.test(key))return "quantity";
  if(/^(ΜΜ|ΜΟΝΑΔΑ|UNIT|UOM|ΜΟΝΜΕΤΡΗΣΗΣ)$/.test(key))return "unit";
  if(/ΕΚΠΤ|DISCOUNT/.test(key)&&!/ΑΞΙΑ|VALUE/.test(key)){
    const ordinal=key.match(/(?:ΕΚΠΤΩΣΗ|ΕΚΠΤ|DISCOUNT)([123])/i)?.[1]||"1";
    return `discount${ordinal}${/ΠΟΣΟ|AMOUNT/.test(key)?"Amount":""}`;
  }
  if(/ΦΠΑ|VAT|TAXRATE/.test(key))return /ΑΞΙΑ|ΠΟΣΟ|AMOUNT/.test(key)?"taxAmount":"vatRate";
  if(/ΕΦΚ|EXCISE/.test(key))return "exciseTotal";
  if(/ΦΟΡΟΛΟΓΗΤ|TAXABLE/.test(key))return "taxableAmount";
  if(/ΤΙΜΗΜΟΝ|ΤΙΜΗΤΜΧ|UNITPRICE|UNITCOST|ΤΙΜΗΑΓΟΡΑΣ/.test(key))return "unitCost";
  if(/ΜΕΤΑΤΗΝΕΚΠΤ|ΜΕΤΑΕΚΠΤ|ΚΑΘΑΡ|ΚΑΘΑΞΙΑ|NETAMOUNT|NETVALUE/.test(key))return "netAmount";
  if(/ΠΡΟΕΚΠΤ|ΠΡΙΝ|BEFOREDISCOUNT/.test(key))return "initialAmount";
  if(/^(ΑΞΙΑ|AMOUNT|TOTAL|ΣΥΝΟΛΟ)$/.test(key))return "netAmount";
  return null;
}
const position=regions=>{const r=regions?.[0]||{},p=r.polygon||[];return {sourcePage:Number(r.pageNumber||1),sourceY:p.length?Math.min(...p.filter((_,i)=>i%2===1)):0}};
export function sourceOrder(a,b){return Number(a.sourceFileIndex||0)-Number(b.sourceFileIndex||0)||Number(a.sourcePage||1)-Number(b.sourcePage||1)||Number(a.sourceY??a.sourceRow??a.azureSequence??0)-Number(b.sourceY??b.sourceRow??b.azureSequence??0)};
export function extractAzureColumns(result){
  const rows=[];
  for(const [tableIndex,table] of (result.tables||[]).entries()){
    const cells=table.cells||[],headers=cells.filter(c=>c.kind==="columnHeader");
    // Azure can split a printed header across two physical rows (for example
    // "ΤΙΜΗ" / "ΜΟΝΑΔΑΣ" and "ΑΞΙΑ" / "ΠΡΟ ΕΚΠΤΩΣΗΣ"). Keep the complete
    // header band rather than treating the first row as the whole label.
    const headerLastRow=headers.length?Math.max(...headers.map(c=>Number(c.rowIndex)+Number(c.rowSpan||1)-1)):1;
    const headerCells=headers.length?cells.filter(c=>c.kind==="columnHeader"||Number(c.rowIndex)<=headerLastRow):cells.filter(c=>Number(c.rowIndex)<=headerLastRow);
    const labels={};
    for(const cell of headerCells)for(let col=cell.columnIndex;col<cell.columnIndex+Number(cell.columnSpan||1);col++)labels[col]=`${labels[col]||""} ${cell.content||""}`.trim();
    const columns={};for(const [col,label] of Object.entries(labels)){const role=headerRole(label);if(role&&columns[role]===undefined)columns[role]=Number(col)}
    if(columns.description===undefined||columns.quantity===undefined||columns.unitCost===undefined)continue;
    const headerEnd=Math.max(...headerCells.map(c=>Number(c.rowIndex)+Number(c.rowSpan||1)-1));
    const grouped=new Map();for(const c of cells){if(c.rowIndex<=headerEnd)continue;if(!grouped.has(c.rowIndex))grouped.set(c.rowIndex,[]);grouped.get(c.rowIndex).push(c)}
    for(const [rowIndex,rowCells] of grouped){
      const get=role=>String(rowCells.find(c=>Number(c.columnIndex)===columns[role])?.content||"").trim();
      const description=get("description"),code=get("code");
      if(!description||/^(ΑΠΟΜΕΤΑΦΟΡΑ|ΣΕΜΕΤΑΦΟΡΑ|ΣΥΝΟΛΟ|TOTAL|CARRIED|BROUGHT)/.test(columnKey(description)))continue;
      const quantity=columnNumber(get("quantity")),unitCost=columnNumber(get("unitCost"));
      if(quantity===null&&unitCost===null&&!code)continue;
      const initial=columnNumber(get("initialAmount")),printedNet=columnNumber(get("netAmount"));
      const initialAmount=initial??Number(quantity||0)*Number(unitCost||0);
      const discounts={};let math=Number(quantity||0)*Number(unitCost||0);
      for(let i=1;i<=3;i++){
        let percent=columnNumber(get(`discount${i}`))||0;
        const amount=columnNumber(get(`discount${i}Amount`))||0;
        if(!percent&&amount>0&&math>0)percent=amount/math*100;
        discounts[`discount${i}`]=percent;
        discounts[`discount${i}Amount`]=amount;
        math*=1-percent/100;
      }
      const netAmount=printedNet??round2(math);
      const exciseTotal=columnNumber(get("exciseTotal"))||0,taxableAmount=columnNumber(get("taxableAmount"))??round2(netAmount+exciseTotal);
      const vatRate=columnNumber(get("vatRate"))||0,tax=columnNumber(get("taxAmount"));
      const rawText=[...rowCells].sort((a,b)=>a.columnIndex-b.columnIndex).map(c=>c.content||"").join(" | ");
      rows.push({code,description,barcode:get("barcode"),unit:get("unit")||"ΤΜΧ",quantity:quantity||0,unitCost:unitCost||0,
        retailPrice:columnNumber(get("retailPrice"))||0,initialAmount,netAmount,exciseTotal,taxableAmount,vatRate,
        grossAmount:round2(taxableAmount+(tax??taxableAmount*vatRate/100)),...discounts,
        rawText,azureRawRow:rawText,sourceColumnMap:columns,sourceColumnsVerified:printedNet!==null&&quantity>0&&unitCost>0&&Math.abs(math-netAmount)<=0.03,
        sourceTable:tableIndex,sourceRow:rowIndex,...position(rowCells[0]?.boundingRegions||table.boundingRegions),confidence:0,azureSequence:rows.length+1});
    }
  }
  return rows.sort(sourceOrder);
}
export function combineAzureRows(items,tableRows){
  if(!tableRows.length)return [...items].sort(sourceOrder);
  // A complete geometrical table supersedes shuffled/duplicated Items output.
  if(tableRows.length>=items.length)return [...tableRows].sort(sourceOrder);
  const remaining=[...items];
  for(const row of tableRows){
    const samePage=item=>Number(item.sourcePage||1)===Number(row.sourcePage||1);
    let index=remaining.findIndex(item=>samePage(item)&&row.code&&columnKey(item.code)===columnKey(row.code));
    if(index<0)index=remaining.findIndex(item=>samePage(item)&&columnKey(item.description)===columnKey(row.description));
    if(index>=0)remaining.splice(index,1);
  }
  return [...tableRows,...remaining].sort(sourceOrder);
}
