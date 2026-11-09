const vatDigits=value=>String(value||"").replace(/\D/g,"");

export function reviewFastSupplierVat(header,recipientVat,ocrSupplierVat){
  const recipient=vatDigits(recipientVat);
  if(recipient.length!==9||![ocrSupplierVat,header.supplierTaxId].some(value=>vatDigits(value)===recipient))return header;
  return {...header,supplierId:"",supplierName:"",supplierTaxId:"",supplierVatNeedsReview:true};
}
