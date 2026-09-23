// A supplier whose central profile requires complete-table verification must
// never publish a wildly inflated unverified OCR table as a purchase draft.
// Internally consistent OCR rows may still be thousands of euros away from
// the independently confirmed header. Only a table verified against that
// header bypasses this extreme-discrepancy guard.
export function catastrophicUnverifiedInvoiceMismatch({requiresCompletePrintedTable,verifiedProductLines,productLines,expectedGross}){
  if(!requiresCompletePrintedTable||verifiedProductLines)return false;
  const expected=Number(expectedGross);
  if(!(expected>0)||!Array.isArray(productLines)||!productLines.length)return false;
  const actual=productLines.reduce((sum,line)=>sum+Number(line?.grossAmount||0),0);
  return Number.isFinite(actual)&&actual>expected*3&&actual-expected>500;
}
