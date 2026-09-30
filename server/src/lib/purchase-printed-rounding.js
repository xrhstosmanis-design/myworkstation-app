import {invoicePrintedRounding,printedRoundingFields} from "../../../shared/invoice-printed-rounding.mjs";
const marker="MYWORKSTATION_PRINTED_ROUNDING_V1=";
export function purchasePrintedRounding(found,input,current={},calculated){
  let saved=null;
  try{const text=String(current.ocrRawText||"").split("\n").find(line=>line.startsWith(marker));if(text)saved=JSON.parse(text.slice(marker.length))}catch{}
  const unchanged=saved&&printedRoundingFields.every(key=>Number(saved[key])===Number(calculated[key]));
  const requested=input.printedNetAmount!==undefined;
  if(!requested&&!unchanged)return {calculated,rawText:String(current.ocrRawText||"").split("\n").filter(line=>!line.startsWith(marker)).join("\n")||null};
  if(found.sourceType!=="POS_OCR_DRAFT"||found.status!=="NEW")throw Object.assign(new Error("Η τυπωμένη αξία στρογγυλοποίησης εφαρμόζεται μόνο σε ενεργό πρόχειρο τιμολογίου."),{status:409});
  const printedNet=requested?Number(input.printedNetAmount):Number(saved.netAmount);
  const basis={...calculated,netAmount:printedNet};
  const rounding=invoicePrintedRounding(basis);
  if(!rounding||Math.abs(printedNet*100-Math.round(printedNet*100))>1e-6)throw Object.assign(new Error("Η τυπωμένη καθαρή αξία δεν εξηγείται από τη στρογγυλοποίηση της τιμής. Έλεγξε ποσότητα, τιμή και εκπτώσεις."),{status:400});
  const netAmount=rounding.net,vatAmount=Math.round((netAmount+calculated.exciseTotal)*calculated.vatRate)/100,grossAmount=netAmount+calculated.exciseTotal+vatAmount;
  const metadata=Object.fromEntries([...printedRoundingFields,"netAmount"].map(key=>[key,basis[key]]));
  const rawText=[...String(current.ocrRawText||"").split("\n").filter(line=>!line.startsWith(marker)&&line),marker+JSON.stringify(metadata)].join("\n");
  const stock=(input.invoiceUnit??current.invoiceUnit)==="PACKAGE"?Number(input.stockUnitsPerInvoiceUnit??current.stockUnitsPerInvoiceUnit??1):1;
  return {calculated:{...calculated,netAmount,vatAmount,grossAmount,finalUnitNet:netAmount/calculated.quantity,grossUnit:grossAmount/(calculated.quantity*stock),printedRoundingDifference:rounding.difference},rawText};
}
