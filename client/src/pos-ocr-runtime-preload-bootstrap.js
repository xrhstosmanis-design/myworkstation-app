// Preload OCR/PDF runtime dependencies as soon as the POS app loads.
// This prevents an already-open POS tab from requesting an old lazy chunk after a new deploy.
Promise.allSettled([
  import('tesseract.js'),
  import('pdfjs-dist/legacy/build/pdf.mjs'),
]).then((results)=>{
  window.__MWS_OCR_RUNTIME_PRELOADED__ = results.every((r)=>r.status==='fulfilled');
}).catch(()=>{
  window.__MWS_OCR_RUNTIME_PRELOADED__ = false;
});
