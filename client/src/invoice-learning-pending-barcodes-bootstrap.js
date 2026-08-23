const PATH='/platform-admin/invoice-learning-lab';
if(window.location.pathname.replace(/\/+$/,'')===PATH){
  const KEY='mws_invoice_learning_lab_v1';
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')||{documents:[],profiles:{},master:[]}}catch{return {documents:[],profiles:{},master:[]}}};
  const write=state=>localStorage.setItem(KEY,JSON.stringify(state));
  const headers=()=>({Authorization:`Bearer ${localStorage.getItem('token')||''}`});
  const productKey=(supplierTaxId,supplierName,supplierItemCode,description)=>[supplierTaxId||norm(supplierName),supplierItemCode||'',norm(description)].join('|');
  let centralProducts=[];

  const collect=()=>{
    const state=read(),map=new Map();
    for(const doc of state.documents||[]){
      if(doc?.status!=='LEARNED')continue;
      for(const line of doc.lines||[]){
        if(!line||line.status==='REJECTED')continue;
        const key=productKey(doc?.supplierTaxId,doc?.supplierName,line?.supplierItemCode,line?.description);if(!key)continue;
        const cur=map.get(key)||{key,supplierName:doc.supplierName||'',supplierTaxId:doc.supplierTaxId||'',supplierItemCode:line.supplierItemCode||'',description:line.description||'',barcode:line.barcode||'',category:line.category||'',subcategory:line.subcategory||'',vatRate:line.vatRate??'',invoiceNo:doc.invoiceNo||doc.invoiceNumber||doc.filename||'',invoiceDate:doc.invoiceDate||'',occurrences:0,masterProductId:line.masterProductId||'',masterProductName:line.masterProductName||'',knowledgeId:'',central:false};
        cur.occurrences++;if(line.barcode)cur.barcode=line.barcode;if(line.category)cur.category=line.category;if(line.subcategory)cur.subcategory=line.subcategory;if(line.masterProductId){cur.masterProductId=line.masterProductId;cur.masterProductName=line.masterProductName||cur.masterProductName}map.set(key,cur);
      }
    }
    for(const x of centralProducts||[]){
      const key=productKey(x.supplierTaxId,x.supplierName,x.supplierItemCode,x.description);if(!key)continue;
      const k=x.knowledge&&typeof x.knowledge==='object'?x.knowledge:{};
      const cur=map.get(key)||{key,supplierName:x.supplierName||'',supplierTaxId:x.supplierTaxId||'',supplierItemCode:x.supplierItemCode||'',description:x.description||'',barcode:'',category:k.category||'',subcategory:k.subcategory||'',vatRate:x.vatRate??k.vatRate??'',invoiceNo:k.invoiceNo||k.invoiceNumber||'',invoiceDate:k.invoiceDate||'',occurrences:0,masterProductId:'',masterProductName:'',knowledgeId:'',central:true};
      cur.central=true;cur.knowledgeId=x.id||cur.knowledgeId;cur.supplierName=cur.supplierName||x.supplierName||'';cur.supplierTaxId=cur.supplierTaxId||x.supplierTaxId||'';cur.supplierItemCode=cur.supplierItemCode||x.supplierItemCode||'';cur.description=cur.description||x.description||'';
      if(x.barcode)cur.barcode=x.barcode;if(x.masterProductId){cur.masterProductId=x.masterProductId;cur.masterProductName=x.masterProductName||cur.masterProductName}if(!cur.category&&k.category)cur.category=k.category;if(!cur.subcategory&&k.subcategory)cur.subcategory=k.subcategory;if((cur.vatRate===''||cur.vatRate==null)&&x.vatRate!=null)cur.vatRate=x.vatRate;
      cur.invoiceUnit=x.invoiceUnit||k.invoiceUnit||'';cur.stockUnit=x.stockUnit||k.stockUnit||'';cur.unitsPerPackage=x.unitsPerPackage??k.unitsPerPackage??'';cur.conversionFactor=x.conversionFactor??k.stockConversion?.factor??k.conversionFactor??'';cur.barcodeStatus=x.barcodeStatus||'';map.set(key,cur);
    }
    return [...map.values()].sort((a,b)=>Number(Boolean(a.barcode))-Number(Boolean(b.barcode))||String(a.supplierName).localeCompare(String(b.supplierName),'el')||String(a.description).localeCompare(String(b.description),'el'));
  };

  async function loadCentralKnowledge(){
    const r=await fetch('/api/platform/invoice-learning/product-knowledge',{headers:headers()});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Σφάλμα ${r.status}`);centralProducts=Array.isArray(d.products)?d.products:[];return centralProducts;
  }

  const saveBarcode=async(item,barcode)=>{
    const clean=String(barcode||'').replace(/\D/g,'');if(clean.length<8||clean.length>14)throw new Error('Το barcode πρέπει να έχει 8 έως 14 ψηφία.');
    const state=read();let localChanged=0;
    for(const doc of state.documents||[]){for(const line of doc.lines||[]){if(productKey(doc?.supplierTaxId,doc?.supplierName,line?.supplierItemCode,line?.description)!==item.key)continue;line.barcode=clean;line.barcodeSource='MANUAL_CONFIRMED';line.barcodeReference='CENTRAL_PRODUCT_KNOWLEDGE';localChanged++}}
    if(localChanged)write(state);
    let centralChanged=0;
    if(item.knowledgeId){const r=await fetch(`/api/platform/invoice-learning/product-knowledge/${encodeURIComponent(item.knowledgeId)}/barcode`,{method:'PUT',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify({barcode:clean})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Σφάλμα ${r.status}`);const idx=centralProducts.findIndex(x=>x.id===item.knowledgeId);if(idx>=0)centralProducts[idx]={...centralProducts[idx],...(d.product||{}),barcode:clean,barcodeStatus:'KNOWN'};centralChanged=1}
    if(!localChanged&&!centralChanged)throw new Error('Δεν βρέθηκε το προϊόν στο Learning.');return localChanged+centralChanged;
  };

  const style=()=>{if(document.getElementById('pendingBarcodeStyle'))return;const s=document.createElement('style');s.id='pendingBarcodeStyle';s.textContent=`.pb-card{background:#fff;border:1px solid #d8e1e6;border-radius:14px;padding:18px;margin:16px 0;box-shadow:0 5px 18px #102a3a0b}.pb-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.pb-head h2{margin:0;color:#17324a}.pb-badge{background:#fff4df;color:#9a5a00;border-radius:999px;padding:6px 10px;font-weight:900}.pb-table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}.pb-table th{background:#173f59;color:white;padding:9px;text-align:left}.pb-table td{padding:8px;border-bottom:1px solid #e4eaed;vertical-align:middle}.pb-open,.pb-save,.pb-find{border:0;border-radius:8px;padding:8px 11px;font-weight:900;cursor:pointer}.pb-open{background:#eef5f8;color:#173f59}.pb-save{background:#0f8877;color:#fff}.pb-find{background:#153f61;color:#fff}.pb-input{padding:8px;border:1px solid #c9d4da;border-radius:7px;min-width:170px}.pb-central{display:inline-block;margin-top:3px;font-size:10px;font-weight:900;color:#087b68;background:#e9f8f4;border-radius:999px;padding:2px 6px}.pb-modal{position:fixed;inset:0;background:#071b2dcc;display:flex;align-items:center;justify-content:center;z-index:2147483500;padding:18px}.pb-box{background:white;border-radius:16px;padding:22px;max-width:1180px;width:min(1180px,96vw);max-height:94vh;overflow:auto;box-shadow:0 25px 80px #0006}.pb-close{float:right;border:1px solid #999;background:#f7f7f7;border-radius:4px;padding:12px 15px;font-weight:900;cursor:pointer}.pb-search{background:#f2f8fc;border:1px solid #b8d1df;border-radius:12px;padding:14px;margin:12px 0}.pb-search-row{display:grid;grid-template-columns:1fr auto auto;gap:10px}.pb-search-row input{min-height:48px;font-size:16px}.pb-results{display:grid;gap:8px;margin-top:10px}.pb-result{border:1px solid #cbdde8;border-radius:10px;padding:11px;background:#fff;display:grid;gap:4px}.pb-result button{justify-self:start;padding:7px 10px;font-size:16px}.pb-form{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}.pb-form label{font-weight:900}.pb-form input{min-height:46px}.pb-wide{grid-column:1/-1}.pb-footer{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}.pb-footer button{padding:12px 16px;font-weight:900}.pb-muted{color:#5f7180;font-size:12px}@media(max-width:780px){.pb-search-row,.pb-form{grid-template-columns:1fr}.pb-wide{grid-column:auto}}`;document.head.appendChild(s)};
  async function searchProducts(q){const r=await fetch(`/api/platform/invoice-learning/product-search?q=${encodeURIComponent(q)}`,{headers:headers()});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Σφάλμα ${r.status}`);return d}

  const openModal=item=>{
    const m=document.createElement('div');m.className='pb-modal';
    m.innerHTML=`<div class="pb-box"><button class="pb-close">×</button><h2 style="margin:2px 0">Νέα εγγραφή προϊόντος</h2><div style="font-size:17px;margin-bottom:8px">${esc(item.description)}</div><div class="pb-search"><b style="font-size:18px">Βρες πρώτα το σωστό προϊόν / barcode</b><div class="pb-search-row"><input data-q value="${esc(item.description)}"><button class="pb-open" data-master>🔎 Master Catalog</button><button class="pb-find" data-google>🌐 Google / Barcode</button></div><div class="pb-results" data-results></div></div><div class="pb-form"><label class="pb-wide">Περιγραφή<input data-desc value="${esc(item.description)}"></label><label class="pb-wide">Barcode<input data-barcode value="${esc(item.barcode||'')}" placeholder="Επίλεξε αποτέλεσμα ή γράψε barcode"></label><label>Κατηγορία<input value="${esc(item.category||'')}" readonly></label><label>Υποκατηγορία<input value="${esc(item.subcategory||'')}" readonly></label><label>ΦΠΑ %<input value="${esc(item.vatRate??'')}" readonly></label><label>Supplier Code<input value="${esc(item.supplierItemCode||'')}" readonly></label></div><div class="pb-footer"><button data-cancel>Ακύρωση</button><button class="pb-save" data-save>✓ Αποθήκευση Barcode</button></div></div>`;
    const results=m.querySelector('[data-results]'),q=m.querySelector('[data-q]'),barcode=m.querySelector('[data-barcode]');
    const showMaster=async()=>{results.innerHTML='<div class="pb-muted">Αναζήτηση Master Catalog…</div>';try{const d=await searchProducts(q.value.trim());const rows=d.master||[];results.innerHTML=rows.length?rows.map(x=>`<div class="pb-result"><b>${esc(x.name)}</b><span class="pb-muted">MASTER CATALOG · ${esc(x.sourceCode||'')}</span>${(x.barcodes||[]).length?(x.barcodes||[]).map(b=>`<button type="button" data-b="${esc(b)}">${esc(b)}</button>`).join(''):'<span>Χωρίς barcode</span>'}</div>`).join(''):'<div>Δεν βρέθηκε στο Master Catalog.</div>';results.querySelectorAll('[data-b]').forEach(b=>b.onclick=()=>barcode.value=b.dataset.b)}catch(e){results.innerHTML=`<div>${esc(e.message)}</div>`}};
    const showGoogle=async()=>{results.innerHTML='<div class="pb-muted">Αναζήτηση Google / Barcode…</div>';try{const d=await searchProducts(q.value.trim());const rows=d.google||[];results.innerHTML=rows.length?rows.map(x=>`<div class="pb-result"><b>${esc(x.name)}</b><span class="pb-muted">${esc(x.provider||'GOOGLE')} · ${esc(x.barcode)}</span>${x.snippet?`<small>${esc(x.snippet)}</small>`:''}<button type="button" data-b="${esc(x.barcode)}">${esc(x.barcode)}</button></div>`).join(''):(d.googleConfigured?'<div>Δεν βρέθηκε ασφαλές barcode. Άλλαξε λίγο την περιγραφή και ξαναδοκίμασε.</div>':'<div>Δεν είναι ρυθμισμένη online αναζήτηση Google.</div>');results.querySelectorAll('[data-b]').forEach(b=>b.onclick=()=>barcode.value=b.dataset.b)}catch(e){results.innerHTML=`<div>${esc(e.message)}</div>`}};
    m.querySelector('[data-master]').onclick=showMaster;m.querySelector('[data-google]').onclick=showGoogle;
    m.querySelector('[data-save]').onclick=async()=>{try{const n=await saveBarcode(item,barcode.value);alert(`Το barcode αποθηκεύτηκε σε ${n} εγγραφή/ές Learning.`);m.remove();render()}catch(e){alert(e.message)}};
    m.querySelector('.pb-close').onclick=()=>m.remove();m.querySelector('[data-cancel]').onclick=()=>m.remove();m.onclick=e=>{if(e.target===m)m.remove()};document.body.appendChild(m)
  };

  const render=()=>{
    style();const main=document.querySelector('.ill main');if(!main)return false;
    let host=document.querySelector('[data-pending-barcodes]');if(!host){host=document.createElement('section');host.className='pb-card';host.dataset.pendingBarcodes='1';const history=[...main.querySelectorAll('.card')].find(x=>x.textContent.includes('Εκπαιδευμένα τιμολόγια'));if(history)main.insertBefore(host,history);else main.appendChild(host)}
    const items=collect(),pending=items.filter(x=>!x.barcode);
    host.innerHTML=`<div class="pb-head"><div><h2>3. Προϊόντα / Εκκρεμή Barcodes</h2><div>Κεντρικό Learning + εκπαιδευμένα τιμολόγια. Βρες barcode από Master Catalog ή Google όπου χρειάζεται.</div></div><span class="pb-badge">${pending.length} χωρίς barcode</span></div><div style="overflow:auto"><table class="pb-table"><thead><tr><th>Προμηθευτής</th><th>Supplier Code</th><th>Προϊόν</th><th>Barcode</th><th></th></tr></thead><tbody>${items.length?items.map((x,i)=>`<tr data-i="${i}"><td>${esc(x.supplierName)}${x.central?'<br><span class="pb-central">CENTRAL LEARNING</span>':''}</td><td>${esc(x.supplierItemCode||'—')}</td><td><b>${esc(x.description)}</b><br><small>${esc(x.invoiceNo||x.masterProductName||'')}</small></td><td><input class="pb-input" value="${esc(x.barcode||'')}" placeholder="Εκκρεμεί"></td><td><button class="pb-open">Άνοιγμα / Εύρεση Barcode</button> <button class="pb-save">Αποθήκευση</button></td></tr>`).join(''):'<tr><td colspan="5">Δεν υπάρχουν ακόμη εκπαιδευμένα προϊόντα.</td></tr>'}</tbody></table></div>`;
    host.querySelectorAll('tbody tr[data-i]').forEach(row=>{const item=items[Number(row.dataset.i)],input=row.querySelector('.pb-input');row.querySelector('.pb-open').onclick=()=>openModal(item);row.querySelector('.pb-save').onclick=async()=>{try{const n=await saveBarcode(item,input.value);alert(`Το barcode αποθηκεύτηκε σε ${n} εγγραφή/ές Learning.`);render()}catch(e){alert(e.message)}}});return true;
  };

  const refreshCentral=async()=>{try{await loadCentralKnowledge();render()}catch(e){console.warn('Invoice Learning central product knowledge unavailable:',e)}};
  const nativeSet=Storage.prototype.setItem;let busy=false;
  Storage.prototype.setItem=function(k,v){nativeSet.call(this,k,v);if(this===localStorage&&k===KEY&&!busy){busy=true;queueMicrotask(()=>{busy=false;render()})}};
  const timer=setInterval(()=>{if(render()){clearInterval(timer);refreshCentral()}},300);window.addEventListener('load',refreshCentral,{once:true});
}
