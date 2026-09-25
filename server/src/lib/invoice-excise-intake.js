const amount=value=>Math.max(0,Number(value||0));

export function invoiceLineWithExcise(entry){
  const quantity=amount(entry?.quantity);
  const netAmount=amount(entry?.netAmount);
  const exciseTotal=amount(entry?.exciseTotal);
  const vatRate=amount(entry?.vatRate);
  const printedGross=amount(entry?.grossAmount);
  const grossAmount=printedGross||Math.round((netAmount+exciseTotal)*(1+vatRate/100)*100)/100;
  return {quantity,netAmount,exciseTotal,vatRate,grossAmount};
}

export function invoiceLineTaxAmounts({netAmount,exciseTotal,grossAmount,vatRate}){
  const taxable=amount(netAmount)+amount(exciseTotal);
  const gross=amount(grossAmount)||Math.round(taxable*(1+amount(vatRate)/100)*100)/100;
  return {exciseTotal:amount(exciseTotal),vatAmount:Math.max(0,Math.round((gross-taxable)*100)/100),grossAmount:gross};
}
