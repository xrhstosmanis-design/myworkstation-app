// Attachments and physical pages are different: one PDF can contain many sheets.
export async function invoiceAssistantPageLayout(pages){
  const pageSources=[];
  for(const [sourceFileIndex,page] of pages.entries()){
    let count=1;
    if(page.mimeType==="application/pdf"){
      const bytes=Buffer.from(String(page.contentData||"").split(",").pop(),"base64");
      if(!bytes.length||bytes.length>8_000_000)throw new Error("Το PDF του τιμολογίου δεν μπορεί να αναγνωστεί με ασφάλεια.");
      const {getDocument}=await import("pdfjs-dist/legacy/build/pdf.mjs");
      const task=getDocument({data:new Uint8Array(bytes),disableFontFace:true,useSystemFonts:true});
      try{const document=await task.promise;count=document.numPages}finally{await task.destroy()}
    }
    if(pageSources.length+count>5)throw new Error("Ο βοηθός υποστηρίζει από 1 έως 5 φυσικές σελίδες ανά τιμολόγιο.");
    for(let sourcePage=1;sourcePage<=count;sourcePage++)pageSources.push({sourceFileIndex,sourcePage});
  }
  if(pageSources.length<1||pageSources.length>5)throw new Error("Ο βοηθός υποστηρίζει από 1 έως 5 φυσικές σελίδες ανά τιμολόγιο.");
  return {pageCount:pageSources.length,pageSources};
}

export async function invoiceAssistantPageCount(pages){
  return (await invoiceAssistantPageLayout(pages)).pageCount;
}

export function normalizePdfPageEvidence(evidence,pages,reference){
  if(!pages.every(page=>page.mimeType==="application/pdf")||!Array.isArray(evidence))return evidence;
  const normalized=value=>String(value??"").replace(/\s/g,"").toUpperCase();
  return evidence.map(page=>normalized(page.documentNumber)&&normalized(page.documentNumber)===normalized(reference)?{...page,documentNumber:reference}:page);
}
