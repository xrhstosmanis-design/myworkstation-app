export function parsePrintedPayable(value){
  const printed=String(value??"").trim();
  return /^\d+(?:[.,]\d{1,3})?$/.test(printed)?Number(printed.replace(",",".")):null;
}

export function invoicePageReviewChecks({expectedPageCount,visiblePageNumbers,sourcePageCount,printedLines,printedTotal,printedQuantityTotal,printedNetTotal,unnumberedPageEvidence,documentNumber}){
  const numberedPagesComplete=Number.isInteger(expectedPageCount)&&expectedPageCount>0&&expectedPageCount===sourcePageCount&&Array.isArray(visiblePageNumbers)&&visiblePageNumbers.length===sourcePageCount&&visiblePageNumbers.every((page,index)=>page===index+1);
  const amounts=printedLines.map(line=>String(line.grossAmount??"").trim());
  const gross=amounts.map(value=>Number(value.replace(",",".")));
  const totalsAgree=Number.isFinite(printedTotal)&&printedLines.length>0&&amounts.every(Boolean)&&gross.every(Number.isFinite)&&Math.abs(gross.reduce((sum,value)=>sum+value,0)-printedTotal)<=0.05;
  const printedQuantity=String(printedQuantityTotal??" ").trim(),printedNet=String(printedNetTotal??" ").trim();
  const columnAgrees=(printed,field)=>{
    if(!printed)return true;
    const total=Number(printed.replace(",","."));
    const values=printedLines.map(line=>String(line[field]??"").trim());
    if(!Number.isFinite(total)||values.some(value=>!value))return false;
    const numbers=values.map(value=>Number(value.replace(",",".")));
    return numbers.every(Number.isFinite)&&Math.abs(numbers.reduce((sum,value)=>sum+value,0)-total)<=(field==="quantity"?0.001:0.05);
  };
  const quantityAgrees=columnAgrees(printedQuantity,"quantity");
  const netValues=printedLines.map(line=>String(line.netAmount??"").trim());
  const exciseValues=printedLines.map(line=>String(line.exciseTotal??"").trim());
  const netNumbers=netValues.map(value=>Number(value.replace(",",".")));
  const exciseNumbers=exciseValues.map(value=>Number(value.replace(",",".")));
  const rawNetSum=netNumbers.reduce((sum,value)=>sum+value,0);
  const exciseSum=exciseNumbers.reduce((sum,value)=>sum+value,0);
  const printedNetNumber=Number(printedNet.replace(",","."));
  const rawNetAgrees=columnAgrees(printedNet,"netAmount");
  // Some invoice footers call the VAT taxable base "net": it includes excise.
  // Accept that basis only when every row has an explicit, valid excise amount.
  const exciseNetAgrees=printedNet!==""&&Number.isFinite(printedNetNumber)&&netValues.every(Boolean)&&exciseValues.every(Boolean)&&netNumbers.every(Number.isFinite)&&exciseNumbers.every(value=>Number.isFinite(value)&&value>=0)&&exciseSum>0&&Math.abs(rawNetSum+exciseSum-printedNetNumber)<=0.05;
  const netAgrees=rawNetAgrees||exciseNetAgrees;
  // Unnumbered multi-sheet invoices need evidence from every uploaded sheet and
  // all three printed totals. A missing middle sheet cannot pass the sums.
  const unnumberedPagesComplete=expectedPageCount===0&&Array.isArray(visiblePageNumbers)&&visiblePageNumbers.length===0&&sourcePageCount>1&&sourcePageCount<=5&&Array.isArray(unnumberedPageEvidence)&&unnumberedPageEvidence.length===sourcePageCount&&String(documentNumber??"").trim()!==""&&unnumberedPageEvidence.every((page,index)=>page?.imageIndex===index+1&&String(page.documentNumber??"").trim()===String(documentNumber).trim()&&page.fullPageVisible===true)&&unnumberedPageEvidence.at(-1)?.printedTotalsVisible===true&&Number.isFinite(printedTotal)&&printedQuantity!==""&&printedNet!==""&&totalsAgree&&quantityAgrees&&netAgrees;
  return {pagesComplete:numberedPagesComplete||unnumberedPagesComplete,grossAgrees:totalsAgree,quantityAgrees,netAgrees,grossSum:gross.every(Number.isFinite)?gross.reduce((sum,value)=>sum+value,0):null,quantitySum:printedLines.reduce((sum,line)=>sum+Number(String(line.quantity??"").replace(",",".")),0),netSum:exciseNetAgrees?rawNetSum+exciseSum:rawNetSum};
}

export function assessInvoicePages(input){
  const checks=invoicePageReviewChecks(input);
  return checks.pagesComplete&&checks.grossAgrees&&checks.quantityAgrees&&checks.netAgrees;
}

// The printed table often has net and VAT columns but no final gross per row.
// Derive only the absent gross, leaving a supplied contradictory amount intact.
export function fillMissingPrintedGross(lines,{printedTotal,exciseColumnAbsent=false}){
  if(!Number.isFinite(printedTotal))return lines;
  const decimal=value=>Number(String(value??"").trim().replace(",","."));
  return lines.map(original=>{
    const line=String(original.exciseTotal??"").trim()===""&&exciseColumnAbsent?{...original,exciseTotal:"0"}:original;
    if(String(line.grossAmount??"").trim())return line;
    const net=decimal(line.netAmount),excise=String(line.exciseTotal??"").trim()===""&&exciseColumnAbsent?0:decimal(line.exciseTotal),vat=decimal(line.vatRate);
    if([line.netAmount,line.vatRate].some(value=>String(value??"").trim()==="")||String(line.exciseTotal??"").trim()===""&&!exciseColumnAbsent||![net,excise,vat].every(Number.isFinite)||net<0||excise<0||![0,6,13,24].includes(vat))return line;
    return {...line,exciseTotal:String(excise),grossAmount:((net+excise)*(1+vat/100)).toFixed(2)};
  });
}

// A single physical sheet may have no page count (including "Σελίδα: 1").
// Require the header, all rows and payable footer; a printed 2/2 never qualifies.
export function normalizedAssistantPages({expectedPageCount,visiblePageNumbers,singlePageComplete,sourcePageCount}){
  if(sourcePageCount===1&&expectedPageCount===0&&Array.isArray(visiblePageNumbers)&&(visiblePageNumbers.length===0||(visiblePageNumbers.length===1&&visiblePageNumbers[0]===1))&&singlePageComplete===true)return {expectedPageCount:1,visiblePageNumbers:[1]};
  return {expectedPageCount,visiblePageNumbers};
}

export function hasEquivalentPrintedEconomics(existing,line){
  if(!existing||!line)return false;
  const values=[line.quantity,line.unitCost,line.netAmount,line.vatRate,line.grossAmount].map(value=>Number(String(value??"").trim().replace(",",".")));
  if([line.quantity,line.unitCost,line.netAmount,line.vatRate,line.grossAmount].some(value=>String(value??"").trim()==="")||!values.every(Number.isFinite))return false;
  return Math.abs(existing.quantity-values[0])<0.001&&Math.abs(existing.unitCost-values[1])<0.001&&Math.abs(existing.netAmount-values[2])<=0.05&&Math.abs(existing.vatRate-values[3])<0.001&&Math.abs(existing.grossAmount-values[4])<=0.05;
}
