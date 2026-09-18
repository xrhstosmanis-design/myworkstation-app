const round2=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
const CANONICAL_VAT=new Set([0,6,13,24]);

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
  if(!lines.length||!lines.every(line=>line?.sourceColumnsVerified===true&&line?.quantitySource==="AI_COMPLETE_PRINTED_TABLE_VERIFIED"))return null;
  const reconciliation=reconcileInvoiceLines(lines,invoiceTotal,tolerance);
  return reconciliation.difference<=tolerance+Number.EPSILON?reconciliation.normalizedLines:null;
}
