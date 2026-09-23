// A supplier whose central profile requires complete-table verification must
// never publish a wildly inflated unverified OCR table as a purchase draft.
// Ordinary header differences and up to two identified review rows continue
// through the existing review path.
export function catastrophicUnverifiedInvoiceMismatch({requiresCompletePrintedTable,verifiedProductLines,verifiedAtOwnTotal,reviewableProductLines,productLines,expectedGross}){
  if(!requiresCompletePrintedTable||verifiedProductLines||verifiedAtOwnTotal||reviewableProductLines)return false;
  const expected=Number(expectedGross);
  if(!(expected>0)||!Array.isArray(productLines)||!productLines.length)return false;
  const actual=productLines.reduce((sum,line)=>sum+Number(line?.grossAmount||0),0);
  return Number.isFinite(actual)&&actual>expected*3&&actual-expected>500;
}
