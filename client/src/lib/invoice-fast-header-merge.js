const cleanTaxId=value=>String(value||"").replace(/\D/g,"");
const STEFANIDIS_TAX_ID="998878583";

export function mergeFastInvoiceHeaders(headers=[],{imageTotals}={}){
  const available=(headers||[]).filter(Boolean);
  const supplierHeader=available.find(header=>header.supplierId||header.supplierName)||null;
  let documentHeader=available.find(header=>header.documentNumber||header.documentDate)||null;
  let totalHeader=available.filter(header=>Number(header.totalGross||0)>0).at(-1)||null;
  const stefanidis=available.some(header=>cleanTaxId(header.supplierTaxId)===STEFANIDIS_TAX_ID);
  if(stefanidis){
    const numbered=available.filter(header=>/\d/.test(String(header.documentNumber||""))).map(header=>({header,digits:String(header.documentNumber).replace(/\D/g,"")})).filter(item=>item.digits);
    numbered.sort((a,b)=>a.digits.length-b.digits.length);
    const canonical=numbered.find(candidate=>numbered.every(other=>other.digits===candidate.digits||other.digits.endsWith(candidate.digits)))||numbered[0];
    if(canonical)documentHeader={...(documentHeader||{}),...canonical.header,documentNumber:canonical.digits};
    totalHeader=available.filter(header=>Number(header.totalGross||0)>0).sort((a,b)=>Number(b.totalGross)-Number(a.totalGross))[0]||null;
  }
  let totalNeedsReview=false;
  if(imageTotals&&!stefanidis){
    const candidates=imageTotals.filter(header=>Number.isFinite(Number(header.totalGross))&&Number(header.totalGross)>0);
    const distinct=new Set(candidates.map(header=>Number(header.totalGross).toFixed(2)));
    const proven=candidates.filter(header=>header.totalGrossVerified===true);
    const verified=new Set(proven.map(header=>Number(header.totalGross).toFixed(2)));
    totalNeedsReview=distinct.size>1&&verified.size!==1;
    totalHeader=totalNeedsReview?null:proven[0]||candidates[0]||null;
  }
  return {supplierHeader,documentHeader,totalHeader,totalNeedsReview,confidence:available.reduce((best,header)=>Math.max(best,Number(header.confidence||0)),0),stefanidis};
}
