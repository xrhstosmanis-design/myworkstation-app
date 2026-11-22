// Display metadata only. Never fetch a document, render it, or invoke OCR.
export const MAX_PAGE_COUNT_BYTES=8_000_000;
export const PAGE_COUNT_TIMEOUT_MS=5000;
const PDF_PREFIX=/^data:application\/pdf;base64,/i;
const IMAGE_PREFIX=/^data:image\/(?:jpeg|png|webp);base64,/i;
const validCount=value=>Number.isSafeInteger(value)&&value>0;

export function invoiceFileSource(page){
  // An unsupported original must not silently become a different cleaned file.
  if(typeof page?.originalDataUrl==="string"&&page.originalDataUrl)return page.originalDataUrl;
  return typeof page?.dataUrl==="string"?page.dataUrl:"";
}
export const invoiceFileKind=source=>PDF_PREFIX.test(source)?"pdf":IMAGE_PREFIX.test(source)?"image":"unknown";
export const sameInvoiceFileSources=(a,b)=>a.length===b.length&&a.every((source,index)=>source===b[index]);
export const invoiceFileCountLabel=count=>`${count} ${count===1?"αρχείο":"αρχεία"}`;

export function invoiceFileCountModel(sources,counts=[]){
  const files=sources.map((source,index)=>{
    const kind=invoiceFileKind(source),count=counts[index];
    return {index,kind,pages:kind==="pdf"&&validCount(count)?count:null,
      state:kind!=="pdf"?kind:validCount(count)?"counted":count===undefined?"pending":"unknown"};
  });
  return {files,fileCount:files.length,imageCount:files.filter(f=>f.kind==="image").length,
    pdfCount:files.filter(f=>f.kind==="pdf").length,
    countedPdfPages:files.reduce((sum,file)=>sum+(file.pages||0),0),
    pendingPdfCount:files.filter(f=>f.state==="pending").length,
    unknownPdfCount:files.filter(f=>f.kind==="pdf"&&f.state==="unknown").length};
}

export async function countInvoicePdfPages(source,{signal,timeoutMs=PAGE_COUNT_TIMEOUT_MS,
  loadPdfJs=()=>import("./invoice-pdf-count-loader.js")}={}){
  if(signal?.aborted||typeof source!=="string"||!PDF_PREFIX.test(source))return null;
  const encoded=source.slice(source.indexOf(",")+1);
  if(!encoded||encoded.length>Math.ceil(MAX_PAGE_COUNT_BYTES/3)*4||
    encoded.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))return null;
  let bytes;
  try{
    const raw=atob(encoded);
    if(!raw.length||raw.length>MAX_PAGE_COUNT_BYTES)return null;
    bytes=Uint8Array.from(raw,char=>char.charCodeAt(0));
  }catch{return null}
  let active=true,task=null,destroyed=false,stop,timer;
  const destroy=()=>{
    if(!task||destroyed)return;
    destroyed=true;
    try{Promise.resolve(task.destroy()).catch(()=>{})}catch{}
  };
  const stopped=new Promise(resolve=>{stop=()=>{active=false;destroy();resolve(null)}});
  signal?.addEventListener("abort",stop,{once:true});
  const budget=Number.isFinite(timeoutMs)&&timeoutMs>0?Math.min(timeoutMs,PAGE_COUNT_TIMEOUT_MS):PAGE_COUNT_TIMEOUT_MS;
  timer=setTimeout(stop,budget);
  const work=(async()=>{
    const pdfjs=await loadPdfJs();
    if(!active||signal?.aborted)return null;
    // The worker receives a NEW byte array, never the retained original source.
    task=pdfjs.getDocument({data:bytes,isEvalSupported:false,disableFontFace:true,
      useSystemFonts:false,disableAutoFetch:true,disableStream:true,stopAtErrors:true});
    const document=await task.promise;
    return active&&!signal?.aborted&&validCount(document.numPages)?document.numPages:null;
  })().catch(()=>null);
  try{return await Promise.race([work,stopped])}
  finally{active=false;clearTimeout(timer);signal?.removeEventListener("abort",stop);destroy()}
}
