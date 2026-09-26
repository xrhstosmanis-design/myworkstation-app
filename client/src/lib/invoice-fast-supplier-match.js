const taxDigits=value=>String(value||"").replace(/\D/g,"");

export function knownSupplierFromFastHeaders(headers,suppliers){
  for(const header of headers||[]){
    const id=String(header?.supplierId||"");
    const byId=(suppliers||[]).find(supplier=>String(supplier.id)===id);
    if(id&&byId)return byId;
  }
  for(const header of headers||[]){
    const taxId=taxDigits(header?.supplierTaxId);
    if(taxId.length!==9)continue;
    const matches=(suppliers||[]).filter(supplier=>taxDigits(supplier.taxId)===taxId);
    if(matches.length===1)return matches[0];
  }
  return null;
}
