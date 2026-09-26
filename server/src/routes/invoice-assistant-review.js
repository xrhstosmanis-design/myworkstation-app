export function invoicePageReviewChecks({expectedPageCount,visiblePageNumbers,sourcePageCount,printedLines,printedTotal,printedQuantityTotal,printedNetTotal}){
  const pagesComplete=Number.isInteger(expectedPageCount)&&expectedPageCount>0&&expectedPageCount===sourcePageCount&&Array.isArray(visiblePageNumbers)&&visiblePageNumbers.length===sourcePageCount&&visiblePageNumbers.every((page,index)=>page===index+1);
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
  return {pagesComplete,grossAgrees:totalsAgree,quantityAgrees:columnAgrees(printedQuantity,"quantity"),netAgrees:columnAgrees(printedNet,"netAmount"),grossSum:gross.every(Number.isFinite)?gross.reduce((sum,value)=>sum+value,0):null,quantitySum:printedLines.reduce((sum,line)=>sum+Number(String(line.quantity??"").replace(",",".")),0),netSum:printedLines.reduce((sum,line)=>sum+Number(String(line.netAmount??"").replace(",",".")),0)};
}

export function assessInvoicePages(input){
  const checks=invoicePageReviewChecks(input);
  return checks.pagesComplete&&checks.grossAgrees&&checks.quantityAgrees&&checks.netAgrees;
}

// The printed table often has net and VAT columns but no final gross per row.
// Derive only the absent gross, leaving a supplied contradictory amount intact.
export function fillMissingPrintedGross(lines,{printedNetTotal,printedTotal}){
  if(!String(printedNetTotal??"").trim()||!Number.isFinite(printedTotal))return lines;
  const decimal=value=>Number(String(value??"").trim().replace(",","."));
  return lines.map(line=>{
    if(String(line.grossAmount??"").trim())return line;
    const net=decimal(line.netAmount),excise=decimal(line.exciseTotal),vat=decimal(line.vatRate);
    if([line.netAmount,line.exciseTotal,line.vatRate].some(value=>String(value??"").trim()==="")||![net,excise,vat].every(Number.isFinite)||net<0||excise<0||![0,6,13,24].includes(vat))return line;
    return {...line,grossAmount:((net+excise)*(1+vat/100)).toFixed(2)};
  });
}

// A single physical sheet may have no page count (including "Σελίδα: 1").
// Require the header, all rows and payable footer; a printed 2/2 never qualifies.
export function normalizedAssistantPages({expectedPageCount,visiblePageNumbers,singlePageComplete,sourcePageCount}){
  if(sourcePageCount===1&&expectedPageCount===0&&Array.isArray(visiblePageNumbers)&&(visiblePageNumbers.length===0||(visiblePageNumbers.length===1&&visiblePageNumbers[0]===1))&&singlePageComplete===true)return {expectedPageCount:1,visiblePageNumbers:[1]};
  return {expectedPageCount,visiblePageNumbers};
}
