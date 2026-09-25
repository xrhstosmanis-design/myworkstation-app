const noAccents=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
const reference=value=>noAccents(value).replace(/Β/g,"B").replace(/[^A-ZΑ-Ω0-9]/g,"");

export function parseSupplierProofText(source){
  const text=noAccents(source).slice(0,20000);
  const amountMatches=[...text.matchAll(/(?:ΠΟΣΟ ΕΙΚΟΝΙΚΗΣ ΕΞΟΦΛΗΣΗΣ|ΣΧΕΔΙΑΣΜΕΝΟ ΠΟΣΟ|ΠΟΣΟ ΠΛΗΡΩΜΗΣ|ΠΛΗΡΩΘΕΝ ΠΟΣΟ|PAYMENT AMOUNT|AMOUNT PAID)\s*:\s*([0-9.,]+)/g)];
  const methodMatches=[...text.matchAll(/(?:ΜΕΘΟΔΟΣ ΔΟΚΙΜΗΣ|ΣΧΕΔΙΑΣΜΕΝΟΣ ΤΡΟΠΟΣ|ΤΡΟΠΟΣ ΠΛΗΡΩΜΗΣ|PAYMENT METHOD)\s*:\s*([^\n]+)/g)];
  const invoiceMatches=[...text.matchAll(/(?:ΠΑΡΑΣΤΑΤΙΚΟ(?: ΠΙΣΤΩΣΗΣ)?|INVOICE(?: NUMBER)?)\s*:\s*([^\n]+)/g)];
  // Multiple labelled values are ambiguous; leave them for manual review.
  if(amountMatches.length>1||methodMatches.length>1||invoiceMatches.length>1)return null;
  const amountText=amountMatches[0]?.[1],methodText=methodMatches[0]?.[1],invoiceText=invoiceMatches[0]?.[1];
  const amount=amountText?Number(amountText.replace(/\.(?=\d{3}(?:\D|$))/g,"").replace(",",".")):null;
  let method=null;
  if(methodText){
    if(/ΤΡΑΠΕΖΙΚΗ ΜΕΤΑΦΟΡΑ|BANK TRANSFER|WIRE TRANSFER|SEPA/.test(methodText))method="BANK_TRANSFER";
    else if(/ΕΤΑΙΡΙΚΗ ΚΑΡΤΑ|CORPORATE CARD/.test(methodText))method="CORPORATE_CARD";
    else if(/ΜΕΤΡΗΤΑ|CASH/.test(methodText))method="CASH_SHIFT";
    else if(/ΕΠΙΣΤΡΟΦΗ ΥΠΑΛΛΗΛΟΥ|EMPLOYEE REIMBURSEMENT/.test(methodText))method="EMPLOYEE_REIMBURSEMENT";
  }
  return {amount:Number.isFinite(amount)?amount:null,method,invoiceReference:invoiceText?reference(invoiceText.split(/[·|]/)[0]):null};
}

// Scans and unrecognised PDFs remain unverified for a human reviewer.
async function readProofPdfText(bytes){
  const {getDocument}=await import("pdfjs-dist/legacy/build/pdf.mjs");
  let task;
  try{
    task=getDocument({data:new Uint8Array(bytes),disableFontFace:true,useSystemFonts:true});
    const doc=await task.promise;
    if(doc.numPages>5)return null;
    const lines=[];
    for(let pageNumber=1;pageNumber<=doc.numPages;pageNumber++){
      const page=await doc.getPage(pageNumber);
      const content=await page.getTextContent();
      lines.push(...content.items.map(item=>String(item.str||"").trim()).filter(Boolean));
    }
    return lines.join("\n");
  }catch{return null}
  finally{if(task)await task.destroy().catch(()=>{})}
}

export async function readSupplierProofPdf(bytes){
  const text=await readProofPdfText(bytes);
  return text===null?null:parseSupplierProofText(text);
}

export async function readBankDepositProofPdf(bytes){
  const source=await readProofPdfText(bytes);
  if(source===null)return null;
  const text=noAccents(source).slice(0,20000);
  const amounts=[...text.matchAll(/(?:ΠΟΣΟ ΚΑΤΑΘΕΣΗΣ ΚΑΙ ΑΠΟΔΕΙΚΤΙΚΟΥ|ΠΟΣΟ ΚΑΤΑΘΕΣΗΣ|DEPOSIT AMOUNT)\s*:\s*([0-9.,]+)/g)];
  if(amounts.length!==1)return null;
  const amount=Number(amounts[0][1].replace(/\.(?=\d{3}(?:\D|$))/g,"").replace(",","."));
  return Number.isFinite(amount)&&amount>0?amount:null;
}

export function supplierProofMismatch(proof,{amount,method,documentNumbers=[]}){
  if(!proof)return null;
  if(proof.amount!==null&&proof.amount!==undefined&&Math.abs(proof.amount-amount)>.005)return "Το ποσό στο αποδεικτικό διαφέρει από την πληρωμή.";
  if(proof.method&&proof.method!==method)return "Ο τρόπος πληρωμής στο αποδεικτικό διαφέρει από τον επιλεγμένο.";
  if(proof.invoiceReference&&documentNumbers.length===1&&reference(documentNumbers[0])!==proof.invoiceReference)return "Το παραστατικό στο αποδεικτικό διαφέρει από το επιλεγμένο τιμολόγιο.";
  return null;
}
