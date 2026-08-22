const labPath=window.location.pathname.replace(/\/+$/,'')==='/platform-admin/invoice-learning-lab';
if(labPath){
  let selectedFile=null,selectedDataUrl='';
  const token=()=>localStorage.getItem('token')||'';
  const readFile=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=reject;r.readAsDataURL(file)});
  const capture=async e=>{const f=e.target.files?.[0];if(!f)return;selectedFile=f;selectedDataUrl=await readFile(f).catch(()=>"")};
  const currentOcrConfidence=()=>{const t=document.querySelector('#ocrBadge')?.textContent||'';const m=t.match(/OCR\s*(\d+)/i);return m?Number(m[1]):0};
  const value=(row,key)=>row.querySelector(`[data-k="${key}"]`)?.value||'';
  const change=(el,val)=>{if(!el)return;el.value=val??'';el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new Event('input',{bubbles:true}))};
  const collectRows=()=>[...document.querySelectorAll('#lines tr')].map(row=>({text:[value(row,'supplierItemCode'),value(row,'description'),value(row,'quantity'),value(row,'unitsPerPackage'),value(row,'unitPrice'),value(row,'discount1'),value(row,'discount2'),value(row,'discount3'),value(row,'vatRate')].filter(Boolean).join(' | '),description:value(row,'description')}));
  const applyResult=data=>{
    if(data?.supplier?.name)change(document.querySelector('#supplierName'),data.supplier.name);
    if(data?.supplier?.taxId)change(document.querySelector('#supplierTaxId'),data.supplier.taxId);
    if(data?.documentNumber)change(document.querySelector('#invoiceNo'),data.documentNumber);
    if(data?.documentDate)change(document.querySelector('#invoiceDate'),data.documentDate);
    const body=document.querySelector('#lines');if(!body)return;
    const oldRows=[...body.querySelectorAll('tr')];oldRows.forEach(row=>change(row.querySelector('[data-k="status"]'),'REJECTED'));
    const products=data.productLines||[];
    products.forEach((line,i)=>{
      let row=oldRows[i];
      if(!row)return;
      change(row.querySelector('[data-k="supplierItemCode"]'),line.supplierItemCode||'');
      change(row.querySelector('[data-k="description"]'),line.description||'');
      change(row.querySelector('[data-k="quantity"]'),line.quantity||'');
      change(row.querySelector('[data-k="unitsPerPackage"]'),line.unitsPerPackage||'');
      change(row.querySelector('[data-k="unitPrice"]'),line.unitPrice||'');
      change(row.querySelector('[data-k="discount1"]'),line.discount1||0);
      change(row.querySelector('[data-k="discount2"]'),line.discount2||0);
      change(row.querySelector('[data-k="discount3"]'),line.discount3||0);
      change(row.querySelector('[data-k="vatRate"]'),line.vatRate||'');
      change(row.querySelector('[data-k="barcode"]'),line.barcode||'');
      change(row.querySelector('[data-k="status"]'),Number(line.confidence||0)>=85?'CONFIRMED':'REVIEW');
      row.style.display='';row.dataset.aiConfidence=String(line.confidence||0);row.title=`AI confidence ${Number(line.confidence||0).toFixed(0)}%`;
    });
    oldRows.slice(products.length).forEach(row=>{row.style.display='none'});
    const badge=document.querySelector('#ocrBadge');if(badge)badge.textContent=`AI ${Number(data.aiConfidence||0).toFixed(0)}% • ${products.length} προϊόντα`;
  };
  const runAi=async button=>{
    if(!selectedFile||!selectedDataUrl){alert('Επίλεξε ξανά το PDF ή τη φωτογραφία ώστε το AI να διαβάσει το πρωτότυπο παραστατικό.');return}
    button.disabled=true;const old=button.textContent;button.textContent='✨ AI επανέλεγχος...';
    const status=document.querySelector('#status');if(status)status.textContent='Το AI διαβάζει το πρωτότυπο παραστατικό και καθαρίζει τις πραγματικές γραμμές προϊόντων...';
    try{
      const r=await fetch('/api/platform/invoice-learning/ai-recheck',{method:'POST',headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body:JSON.stringify({filename:selectedFile.name,mimeType:selectedFile.type||'image/jpeg',fileData:selectedDataUrl,ocrRows:collectRows(),ocrConfidence:currentOcrConfidence()})});
      const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||`AI σφάλμα ${r.status}`);
      applyResult(data);if(status)status.textContent=`AI ολοκληρώθηκε: ${(data.productLines||[]).length} πραγματικές γραμμές προϊόντων • confidence ${Number(data.aiConfidence||0).toFixed(0)}%. Έλεγξε πριν την εκμάθηση.`;
    }catch(err){if(status)status.textContent=`AI: ${err.message}`;alert(err.message)}finally{button.disabled=false;button.textContent=old}
  };
  let statusChecked=false;
  const install=()=>{
    document.querySelectorAll('#pdfFile,#photoFile').forEach(el=>{if(el.dataset.aiCapture)return;el.dataset.aiCapture='1';el.addEventListener('change',capture)});
    const host=document.querySelector('.uploadBtns');if(!host)return false;
    let b=host.querySelector('[data-ai-recheck]');
    if(!b){b=document.createElement('button');b.type='button';b.dataset.aiRecheck='1';b.textContent='✨ Επανέλεγχος με AI';b.style.cssText='background:#6d28d9!important;color:#fff!important;border:1px solid #6d28d9!important;box-shadow:0 6px 16px #6d28d933;font-weight:900';b.addEventListener('click',()=>runAi(b));host.appendChild(b)}
    if(!statusChecked){statusChecked=true;fetch('/api/platform/invoice-learning/ai-status',{headers:{Authorization:`Bearer ${token()}`}}).then(r=>r.json()).then(s=>{b.title=s.connected?`AI συνδεδεμένο • ${s.model}`:'Χρειάζεται OPENAI_API_KEY στον server';b.textContent=s.connected?'✨ Επανέλεγχος με AI':'✨ AI — σύνδεση παρόχου';}).catch(()=>{b.title='Δεν ήταν δυνατός ο έλεγχος σύνδεσης AI';})}
    return true;
  };
  install();
  const observer=new MutationObserver(()=>install());observer.observe(document.documentElement,{childList:true,subtree:true});
  const timer=setInterval(()=>{if(install()&&document.querySelector('[data-ai-recheck]'))clearInterval(timer)},250);
  window.addEventListener('load',install,{once:true});
}
