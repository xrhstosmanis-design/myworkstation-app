const round2=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
const CANONICAL_VAT=new Set([0,6,13,24]);

export function reconcileInvoiceLines(productLines,invoiceTotal,tolerance=0.05){
  const lines=Array.isArray(productLines)?productLines:[];
  const total=round2(invoiceTotal);
  const netTotal=round2(lines.reduce((sum,line)=>sum+Math.max(0,Number(line?.netAmount||0)),0));
  const headerEqualsNet=total>0&&Math.abs(netTotal-total)<=tolerance;
  let correctedLines=0;
  const normalizedLines=lines.map(line=>{
    const netAmount=round2(Math.max(0,Number(line?.netAmount||0)));
    const rawVat=Number(line?.vatRate||0);
    const canonicalVat=CANONICAL_VAT.has(Math.round(rawVat))?Math.round(rawVat):0;
    const vatRate=headerEqualsNet?0:canonicalVat;
    const grossAmount=headerEqualsNet?netAmount:round2(netAmount*(1+vatRate/100));
    const storedGross=round2(line?.grossAmount);
    if(Math.abs(grossAmount-storedGross)>0.005||vatRate!==rawVat)correctedLines+=1;
    return {...line,netAmount,vatRate,grossAmount,vatAmount:round2(grossAmount-netAmount)};
  });
  const grossTotal=round2(normalizedLines.reduce((sum,line)=>sum+line.grossAmount,0));
  return {normalizedLines,netTotal,grossTotal,correctedLines,strategy:headerEqualsNet?"HEADER_TOTAL_EQUALS_NET":"NET_PLUS_CANONICAL_VAT",difference:round2(Math.abs(grossTotal-total))};
}
