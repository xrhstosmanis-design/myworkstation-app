export function assessInvoicePages({expectedPageCount,visiblePageNumbers,sourcePageCount,printedLines,printedTotal}){
  const pagesComplete=Number.isInteger(expectedPageCount)&&expectedPageCount>0&&expectedPageCount===sourcePageCount&&Array.isArray(visiblePageNumbers)&&visiblePageNumbers.length===sourcePageCount&&visiblePageNumbers.every((page,index)=>page===index+1);
  const amounts=printedLines.map(line=>String(line.grossAmount??"").trim());
  const gross=amounts.map(value=>Number(value.replace(",",".")));
  const totalsAgree=Number.isFinite(printedTotal)&&printedLines.length>0&&amounts.every(Boolean)&&gross.every(Number.isFinite)&&Math.abs(gross.reduce((sum,value)=>sum+value,0)-printedTotal)<=0.05;
  return pagesComplete&&totalsAgree;
}
