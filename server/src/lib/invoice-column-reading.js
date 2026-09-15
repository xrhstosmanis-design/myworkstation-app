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
  const pieces=text.match(/(?:^|\D)(\d{1,4})\s*(?:TEM|TMX)(?=\D|$)/);
  const kilograms=text.match(/(?:^|\D)(\d+(?:[,.]\d+)?)\s*(?:KGR|KG|KILO|ΚΙΛ)(?=\D|$)/);
  const inferred=pieces?Number(pieces[1]):kilograms?Number(kilograms[1].replace(",","."))*1000:0;
  const supplied=Number(explicitMultiplier||0),multiplier=supplied>1?supplied:inferred>1?inferred:supplied;
  return {multiplier:multiplier>0?multiplier:0,stockMeasure:kilograms?"GRAM":"PIECE",inferred:inferred>1};
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
    const headerCells=headers.length?headers:cells.filter(c=>Number(c.rowIndex)===0);
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
      const vatRate=columnNumber(get("vatRate"))||0,tax=columnNumber(get("taxAmount"));
      const rawText=[...rowCells].sort((a,b)=>a.columnIndex-b.columnIndex).map(c=>c.content||"").join(" | ");
      rows.push({code,description,barcode:get("barcode"),unit:get("unit")||"ΤΜΧ",quantity:quantity||0,unitCost:unitCost||0,
        retailPrice:columnNumber(get("retailPrice"))||0,initialAmount,netAmount,vatRate,
        grossAmount:round2(netAmount+(tax??netAmount*vatRate/100)),...discounts,
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
