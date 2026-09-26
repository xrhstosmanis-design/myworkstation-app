export function assessInvoicePages({expectedPageCount,visiblePageNumbers,sourcePageCount,printedLines,printedTotal}){
  const pagesComplete=Number.isInteger(expectedPageCount)&&expectedPageCount>0&&expectedPageCount===sourcePageCount&&Array.isArray(visiblePageNumbers)&&visiblePageNumbers.length===sourcePageCount&&visiblePageNumbers.every((page,index)=>page===index+1);
  const amounts=printedLines.map(line=>String(line.grossAmount??"").trim());
  const gross=amounts.map(value=>Number(value.replace(",",".")));
  const totalsAgree=Number.isFinite(printedTotal)&&printedLines.length>0&&amounts.every(Boolean)&&gross.every(Number.isFinite)&&Math.abs(gross.reduce((sum,value)=>sum+value,0)-printedTotal)<=0.05;
  return pagesComplete&&totalsAgree;
}

// A single physical sheet may have no page count (including "Σελίδα: 1").
// Require the header, all rows and payable footer; a printed 2/2 never qualifies.
export function normalizedAssistantPages({expectedPageCount,visiblePageNumbers,singlePageComplete,sourcePageCount}){
  if(sourcePageCount===1&&expectedPageCount===0&&Array.isArray(visiblePageNumbers)&&(visiblePageNumbers.length===0||(visiblePageNumbers.length===1&&visiblePageNumbers[0]===1))&&singlePageComplete===true)return {expectedPageCount:1,visiblePageNumbers:[1]};
  return {expectedPageCount,visiblePageNumbers};
}
