// The store payment form needs a header before the durable product reader.
// Only the server may decide whether this is a verified multipage PDF.
export function fastInvoiceHeaderRequest({storeId,sourcePage}){
  const mimeType=sourcePage.file.type||"image/jpeg";
  return {
    storeId,
    filename:sourcePage.file.name||"timologio.jpg",
    mimeType,
    dataUrl:sourcePage.dataUrl,
    ...(mimeType==="application/pdf"?{pdfHeaderPriority:true}:{})
  };
}
