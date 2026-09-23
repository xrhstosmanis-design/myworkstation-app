const round2=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
const CANONICAL_VAT=new Set([0,6,13,24]);
const COMPLETE_ROW_SOURCES=new Set([
  "AI_COMPLETE_PRINTED_TABLE_VERIFIED",
  "AI_PRINTED_ROW_FULL_MATH_VERIFIED",
  "SIBLING_PRICE_DISCOUNT_SCALE_VERIFIED",
  "MANTZILAS_CODE_00009_PACK24_SCALE_VERIFIED",
  "MANTZILAS_CODE_00009_FINAL_NORMALIZATION",
  "MANTZILAS_PRINTED_ECONOMICS_VERIFIED"
]);

export function claimsCompletePrintedTable(productLines){
  const lines=Array.isArray(productLines)?productLines:[];
  return lines.length>0&&lines.some(line=>line?.sourceColumnsVerified===true&&COMPLETE_ROW_SOURCES.has(line?.quantitySource));
}

function verifiedRowMathIsIntact(line){
  const quantity=Number(line?.quantity||0),unitCost=Number(line?.unitCost||0);
  const net=Number(line?.netAmount||0),excise=Math.max(0,Number(line?.exciseTotal||0));
  const vatRate=Number(line?.vatRate||0),gross=Number(line?.grossAmount||0);
  if(!(quantity>0&&unitCost>0&&net>0&&gross>0)||!CANONICAL_VAT.has(Math.round(vatRate)))return false;
  let discounted=quantity*unitCost;
  for(const value of [line?.discount1,line?.discount2,line?.discount3]){
    const percent=Number(value||0);
    if(!Number.isFinite(percent)||percent<0||percent>=100)return false;
    discounted*=1-percent/100;
  }
  if(Math.abs(discounted-net)>Math.max(0.05,net*0.005))return false;
  const taxable=net+excise;
  return Math.abs(taxable*(1+Math.round(vatRate)/100)-gross)<=Math.max(0.05,gross*0.002);
}

export function reconcileInvoiceLines(productLines,invoiceTotal,tolerance=0.05){
  const lines=Array.isArray(productLines)?productLines:[];
  const total=round2(invoiceTotal);
  const netTotal=round2(lines.reduce((sum,line)=>sum+Math.max(0,Number(line?.netAmount||0))+Math.max(0,Number(line?.exciseTotal||0)),0));
  const headerEqualsNet=total>0&&Math.abs(netTotal-total)<=tolerance;
  let correctedLines=0;
  const normalizedLines=lines.map(line=>{
    const netAmount=round2(Math.max(0,Number(line?.netAmount||0)));
    const exciseTotal=round2(Math.max(0,Number(line?.exciseTotal||0))),vatBase=round2(netAmount+exciseTotal),rawVat=Number(line?.vatRate||0);
    const canonicalVat=CANONICAL_VAT.has(Math.round(rawVat))?Math.round(rawVat):0;
    const vatRate=headerEqualsNet?0:canonicalVat;
    const grossAmount=headerEqualsNet?vatBase:round2(vatBase*(1+vatRate/100));
    const storedGross=round2(line?.grossAmount);
    if(Math.abs(grossAmount-storedGross)>0.005||vatRate!==rawVat)correctedLines+=1;
    return {...line,netAmount,exciseTotal,vatRate,grossAmount,vatAmount:round2(grossAmount-vatBase)};
  });
  const grossTotal=round2(normalizedLines.reduce((sum,line)=>sum+line.grossAmount,0));
  return {normalizedLines,netTotal,grossTotal,correctedLines,strategy:headerEqualsNet?"HEADER_TOTAL_EQUALS_NET":"NET_PLUS_CANONICAL_VAT",difference:round2(Math.abs(grossTotal-total))};
}
 
// A complete visual reread has already passed per-row arithmetic, contiguous
// printed order, VAT-footer groups and the independent invoice total. Keep
// that authoritative table intact for persistence instead of sending it
// through the older heuristic finalizer, which can reinterpret printed piece
// units or discounts a second time.
export function verifiedPrintedTableForPersistence(productLines,invoiceTotal,tolerance=0.05){
  const lines=Array.isArray(productLines)?productLines:[];
  if(!lines.length||!lines.every(line=>line?.sourceColumnsVerified===true&&COMPLETE_ROW_SOURCES.has(line?.quantitySource)&&verifiedRowMathIsIntact(line)))return null;
  const expected=round2(invoiceTotal),actual=round2(lines.reduce((sum,line)=>sum+Number(line.grossAmount||0),0));
  if(Math.abs(actual-expected)>tolerance+Number.EPSILON)return null;
  // The complete-table verifier already proved the printed VAT footer and
  // every horizontal row. Do not run the legacy header/net heuristic here:
  // a malformed replay could otherwise turn printed VAT into zero.
  return lines.map(line=>({...line,quantity:Number(line.quantity),unitCost:Number(line.unitCost),discount1:Number(line.discount1||0),discount2:Number(line.discount2||0),discount3:Number(line.discount3||0),netAmount:round2(line.netAmount),exciseTotal:round2(line.exciseTotal),vatRate:Math.round(Number(line.vatRate||0)),vatAmount:round2(Number(line.grossAmount||0)-Number(line.netAmount||0)-Number(line.exciseTotal||0)),grossAmount:round2(line.grossAmount)}));
}

// An identified minority of uncertain rows can be reviewed in an unapproved
// draft. The other rows must still carry independent printed-column proof.
// Missing rows, an empty read, or three uncertain rows cannot use this path.
export function reviewablePrintedTableForPersistence(productLines,invoiceTotal,tolerance=0.05){
  const lines=Array.isArray(productLines)?productLines:[];
  if(lines.length<3||!(Number(invoiceTotal)>0))return null;
  const uncertain=lines.filter(line=>line?.sourceColumnsVerified!==true);
  if(uncertain.length<1||uncertain.length>2)return null;
  if(lines.some(line=>{
    if(line?.sourceColumnsVerified===true)return !verifiedRowMathIsIntact(line);
    return !String(line?.rawText||"").trim()||!String(line?.description||"").trim()||
      !(Number(line?.quantity)>0&&Number(line?.unitCost)>0&&Number(line?.netAmount)>0&&Number(line?.grossAmount)>0)||
      !CANONICAL_VAT.has(Math.round(Number(line?.vatRate)));
  }))return null;
  const gross=round2(lines.reduce((sum,line)=>sum+Number(line.grossAmount||0),0));
  if(Math.abs(gross-round2(invoiceTotal))<=tolerance)return null;
  return lines.map(line=>({...line,sourceColumnsVerified:line.sourceColumnsVerified===true}));
}
