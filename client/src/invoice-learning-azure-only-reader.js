const PATH='/platform-admin/invoice-learning-lab';
if(window.location.pathname.replace(/\/+$/,'')===PATH){
  const token=()=>localStorage.getItem('token')||'';
  const readFile=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=reject;r.readAsDataURL(file)});
  let selectedFile=null,selectedDataUrl='',running=false;
  const status=()=>document.querySelector('#status');
  const provider=data=>data?.provider==='AZURE_DOCUMENT_INTELLIGENCE'?'Azure Document Intelligence':data?.provider==='OPENAI'?'OpenAI fallback':'AI';

  async function run(button){
    if(running||!selectedFile||!selectedDataUrl)return;
    running=true;if(button)button.disabled=true;
    const old=button?.textContent||'';if(button)button.textContent='✨ Azure / AI ανάγνωση…';
    if(status())status().textContent='Azure Document Intelligence διαβάζει το πρωτότυπο παραστατικό. Δεν χρησιμοποιείται local OCR.';
    try{
      const r=await fetch('/api/platform/invoice-learning/ai-recheck',{method:'POST',headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body:JSON.stringify({filename:selectedFile.name,mimeType:selectedFile.type||'image/jpeg',fileData:selectedDataUrl})});
      const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||`AI σφάλμα ${r.status}`);
      if(typeof window.__MWS_INVOICE_LEARNING_APPLY_AI_RESULT__!=='function')throw new Error('Δεν φορτώθηκε η φόρμα αποτελεσμάτων του Learning Lab.');
      window.__MWS_INVOICE_LEARNING_APPLY_AI_RESULT__(data);
      const learned=(data.productLines||[]).filter(x=>x.learnedMatch).length;
      if(status())status().textContent=`Ανάγνωση ολοκληρώθηκε μόνο με ${provider(data)}: ${(data.productLines||[]).length} προϊόντα${learned?` • ${learned} από Central Learning`:''}.`;
    }catch(error){if(status())status().textContent=`Azure/AI: ${error.message}`;console.error('Invoice Learning Azure-only read failed',error)}
    finally{running=false;if(button){button.disabled=false;button.textContent=old}}
  }

  async function selected(e){
    const file=e.target.files?.[0];if(!file)return;
    selectedFile=file;selectedDataUrl=await readFile(file);
    const b=document.querySelector('[data-azure-only-read]');
    setTimeout(()=>run(b),0);
  }

  function install(){
    document.querySelectorAll('#pdfFile,#photoFile').forEach(input=>{if(input.dataset.azureOnlyReader)return;input.dataset.azureOnlyReader='1';input.addEventListener('change',selected)});
    const host=document.querySelector('.uploadBtns');if(!host)return false;
    let b=host.querySelector('[data-azure-only-read]');if(!b){b=document.createElement('button');b.type='button';b.dataset.azureOnlyRead='1';b.textContent='✨ Ανάγνωση: Azure → AI';b.style.cssText='background:#6d28d9!important;color:#fff!important;border:1px solid #6d28d9!important;font-weight:900';b.onclick=()=>run(b);host.appendChild(b)}
    return true;
  }
  install();new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});
}
