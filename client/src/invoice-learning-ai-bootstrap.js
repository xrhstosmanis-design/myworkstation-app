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
  const sourceLabel=(row,text,color='#31566b')=>{const cell=row.querySelector('.master');if(!cell)return;let el=cell.querySelector('[data-barcode-source]');if(!el){el=document.createElement('div');el.dataset.barcodeSource='1';el.style.cssText='font-size:10px;font-weight:900;margin-top:3px';cell.appendChild(el)}el.style.color=color;el.textContent=text};
  const showCandidates=(row,candidates=[])=>{const cell=row.querySelector('.master');if(!cell||!candidates.length)return;let box=cell.querySelector('[data-barcode-candidates]');if(box)box.remove();box=document.createElement('div');box.dataset.barcodeCandidates='1';box.style.cssText='display:flex;gap:4px;flex-wrap:wrap;margin-top:4px';candidates.slice(0,3).forEach(c=>{const b=document.createElement('button');b.type='button';b.textContent=c.barcode;b.title=`${c.source||''} • confidence ${c.confidence||0}%`;b.style.cssText='font-size:10px;padding:3px 5px;border:1px solid #b8c8d2;border-radius:5px;background:#fff;cursor:pointer';b.onclick=()=>{change(row.querySelector('[data-k="barcode"]'),c.barcode);sourceLabel(row,`✓ Επιβεβαιώθηκε: ${c.source==='MASTER_CATALOG'?'MASTER':'GOOGLE'}`,'#087565');box.remove()};box.appendChild(b)});cell.appendChild(box)};
  const resolveBarcodeRow=async row=>{
    if(row.style.display==='none')return {skipped:true};
    const existing=value(row,'barcode').replace(/\D/g,'');if(existing.length>=8)return {existing:true};
    const supplierItemCode=value(row,'supplierItemCode').trim(),description=value(row,'description').trim();if(!supplierItemCode&&!description)return {skipped:true};
    const input=row.querySelector('[data-k="barcode"]');if(input){input.placeholder='Αναζήτηση barcode…';input.disabled=true}sourceLabel(row,'🔎 Master Catalog → Online/Google…','#31566b');
    try{
      const r=await fetch('/api/platform/invoice-learning/barcode-resolve',{method:'POST',headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body:JSON.stringify({supplierItemCode,description})});
      const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||`Barcode lookup ${r.status}`);
      if(data.accepted&&data.barcode){change(input,data.barcode);sourceLabel(row,`✓ ${data.source==='MASTER_CATALOG'?'MASTER CATALOG':'GOOGLE'} • ${Number(data.confidence||0).toFixed(0)}%`,'#087565');if(data.masterProduct?.name){const ms=row.querySelector('[data-master-search]');if(ms&&!ms.value)ms.value=data.masterProduct.name}return {found:true,accepted:true}}
      if(data.candidates?.length){sourceLabel(row,`⚠ ${data.candidates.length} πιθανά barcode — επίλεξε`,'#a65f00');showCandidates(row,data.candidates);return {found:true,accepted:false}}
      sourceLabel(row,data.reason==='ONLINE_PROVIDER_NOT_CONFIGURED'?'Δεν έχει συνδεθεί online/Google πάροχος':'Δεν βρέθηκε ασφαλές barcode','#8a3b3b');return {found:false};
    }catch(err){sourceLabel(row,`Σφάλμα αναζήτησης: ${err.message}`,'#a33');return {error:true}}finally{if(input){input.disabled=false;if(!input.value)input.placeholder='Barcode αν βρεθεί'}}
  };
  const resolveAllBarcodes=async status=>{
    const rows=[...document.querySelectorAll('#lines tr')].filter(r=>r.style.display!=='none'&&!value(r,'barcode'));
    if(!rows.length)return {total:0,accepted:0,candidates:0};let accepted=0,candidates=0;
    if(status)status.textContent=`Αναζήτηση barcode σε Master Catalog και Online/Google: 0/${rows.length}…`;
    for(let i=0;i<rows.length;i++){const result=await resolveBarcodeRow(rows[i]);if(result?.accepted)accepted++;else if(result?.found)candidates++;if(status)status.textContent=`Αναζήτηση barcode: ${i+1}/${rows.length} • αυτόματα ${accepted} • χρειάζονται επιλογή ${candidates}`}
    if(status)status.textContent=`Barcode lookup ολοκληρώθηκε • ${accepted} αυτόματα • ${candidates} χρειάζονται επιβεβαίωση • ${rows.length-accepted-candidates} δεν βρέθηκαν.`;
    return {total:rows.length,accepted,candidates};
  };
  const applyResult=data=>{
    if(data?.supplier?.name)change(document.querySelector('#supplierName'),data.supplier.name);
    if(data?.supplier?.taxId)change(document.querySelector('#supplierTaxId'),data.supplier.taxId);
    if(data?.documentNumber)change(document.querySelector('#invoiceNo'),data.documentNumber);
    if(data?.documentDate)change(document.querySelector('#invoiceDate'),data.documentDate);
    const body=document.querySelector('#lines');if(!body)return;
    const oldRows=[...body.querySelectorAll('tr')];oldRows.forEach(row=>change(row.querySelector('[data-k="status"]'),'REJECTED'));
    const products=data.productLines||[];
    products.forEach((line,i)=>{const row=oldRows[i];if(!row)return;change(row.querySelector('[data-k="supplierItemCode"]'),line.supplierItemCode||'');change(row.querySelector('[data-k="description"]'),line.description||'');change(row.querySelector('[data-k="quantity"]'),line.quantity||'');change(row.querySelector('[data-k="unitsPerPackage"]'),line.unitsPerPackage||'');change(row.querySelector('[data-k="unitPrice"]'),line.unitPrice||'');change(row.querySelector('[data-k="discount1"]'),line.discount1||0);change(row.querySelector('[data-k="discount2"]'),line.discount2||0);change(row.querySelector('[data-k="discount3"]'),line.discount3||0);change(row.querySelector('[data-k="vatRate"]'),line.vatRate||'');change(row.querySelector('[data-k="barcode"]'),line.barcode||'');change(row.querySelector('[data-k="status"]'),Number(line.confidence||0)>=85?'CONFIRMED':'REVIEW');row.style.display='';row.dataset.aiConfidence=String(line.confidence||0);row.title=`AI confidence ${Number(line.confidence||0).toFixed(0)}%`});
    oldRows.slice(products.length).forEach(row=>{row.style.display='none'});const badge=document.querySelector('#ocrBadge');if(badge)badge.textContent=`AI ${Number(data.aiConfidence||0).toFixed(0)}% • ${products.length} προϊόντα`;
  };
  const runAi=async button=>{
    if(!selectedFile||!selectedDataUrl){alert('Επίλεξε ξανά το PDF ή τη φωτογραφία ώστε το AI να διαβάσει το πρωτότυπο παραστατικό.');return}
    button.disabled=true;const old=button.textContent;button.textContent='✨ AI επανέλεγχος...';const status=document.querySelector('#status');if(status)status.textContent='Το AI διαβάζει το πρωτότυπο παραστατικό και καθαρίζει τις πραγματικές γραμμές προϊόντων...';
    try{const r=await fetch('/api/platform/invoice-learning/ai-recheck',{method:'POST',headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body:JSON.stringify({filename:selectedFile.name,mimeType:selectedFile.type||'image/jpeg',fileData:selectedDataUrl,ocrRows:collectRows(),ocrConfidence:currentOcrConfidence()})});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||`AI σφάλμα ${r.status}`);applyResult(data);if(status)status.textContent=`AI ολοκληρώθηκε: ${(data.productLines||[]).length} προϊόντα. Ξεκινά αυτόματη εύρεση barcode…`;await resolveAllBarcodes(status)}catch(err){if(status)status.textContent=`AI: ${err.message}`;alert(err.message)}finally{button.disabled=false;button.textContent=old}
  };
  let statusChecked=false;
  const install=()=>{
    document.querySelectorAll('#pdfFile,#photoFile').forEach(el=>{if(el.dataset.aiCapture)return;el.dataset.aiCapture='1';el.addEventListener('change',capture)});const host=document.querySelector('.uploadBtns');if(!host)return false;
    let b=host.querySelector('[data-ai-recheck]');if(!b){b=document.createElement('button');b.type='button';b.dataset.aiRecheck='1';b.textContent='✨ Επανέλεγχος με AI';b.style.cssText='background:#6d28d9!important;color:#fff!important;border:1px solid #6d28d9!important;box-shadow:0 6px 16px #6d28d933;font-weight:900';b.addEventListener('click',()=>runAi(b));host.appendChild(b)}
    let lookup=host.querySelector('[data-barcode-lookup]');if(!lookup){lookup=document.createElement('button');lookup.type='button';lookup.dataset.barcodeLookup='1';lookup.textContent='🔎 Εύρεση Barcodes';lookup.style.cssText='background:#0f766e!important;color:#fff!important;border:1px solid #0f766e!important;font-weight:900';lookup.onclick=async()=>{lookup.disabled=true;const old=lookup.textContent;lookup.textContent='🔎 Αναζήτηση…';try{await resolveAllBarcodes(document.querySelector('#status'))}finally{lookup.disabled=false;lookup.textContent=old}};host.appendChild(lookup)}
    if(!statusChecked){statusChecked=true;fetch('/api/platform/invoice-learning/ai-status',{headers:{Authorization:`Bearer ${token()}`}}).then(r=>r.json()).then(s=>{b.title=s.connected?`AI συνδεδεμένο • ${s.model}`:'Χρειάζεται OPENAI_API_KEY στον server';b.textContent=s.connected?'✨ Επανέλεγχος με AI':'✨ AI — σύνδεση παρόχου';}).catch(()=>{b.title='Δεν ήταν δυνατός ο έλεγχος σύνδεσης AI';})}return true;
  };
  install();const observer=new MutationObserver(()=>install());observer.observe(document.documentElement,{childList:true,subtree:true});const timer=setInterval(()=>{if(install()&&document.querySelector('[data-ai-recheck]')&&document.querySelector('[data-barcode-lookup]'))clearInterval(timer)},250);window.addEventListener('load',install,{once:true});
}
