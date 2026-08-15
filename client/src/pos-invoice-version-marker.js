function mark(){
  document.querySelectorAll('.pos-invoice-scan-v2').forEach(panel=>{
    if(panel.querySelector('.mws-ocr-ai-version'))return;
    const badge=document.createElement('div');
    badge.className='mws-ocr-ai-version';
    badge.textContent='OCR/AI v2 · Auto AI <65%';
    badge.style.cssText='display:inline-block;margin:0 0 8px;padding:4px 8px;border-radius:999px;background:#e6f7ef;color:#075f46;font-size:12px;font-weight:800';
    panel.insertBefore(badge,panel.firstChild);
  });
}
mark();
new MutationObserver(mark).observe(document.documentElement,{childList:true,subtree:true});
