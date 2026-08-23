const PATH='/platform-admin/invoice-learning-lab';
if(window.location.pathname.replace(/\/+$/,'')===PATH){
  const KEY='mws_invoice_learning_lab_v1';
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')||{documents:[],profiles:{},master:[]}}catch{return {documents:[],profiles:{},master:[]}}};
  const write=s=>localStorage.setItem(KEY,JSON.stringify(s));
  const headers=()=>({Authorization:`Bearer ${localStorage.getItem('token')||''}`});
  const productKey=(tax,name,code,desc)=>[tax||norm(name),code||'',norm(desc)].join('|');
  let centralProducts=[];

  const collect=()=>{
    const state=read(),map=new Map();
    for(const doc of state.documents||[]){
      if(doc?.status!=='LEARNED')continue;
      for(const line of doc.lines||[]){
        if(!line||line.status==='REJECTED')continue;
        const key=productKey(doc?.supplierTaxId,doc?.supplierName,line?.supplierItemCode,line?.description);
        const cur=map.get(key)||{key,supplierName:doc.supplierName||'',supplierTaxId:doc.supplierTaxId||'',supplierItemCode:line.supplierItemCode||'',description:line.description||'',barcode:line.barcode||'',category:line.category||'',subcategory:line.subcategory||'',vatRate:line.vatRate??'',invoiceUnit:line.invoiceUnit||'',stockUnit:line.stockUnit||line.unit||'',unitsPerPackage:line.unitsPerPackage??'',conversionFactor:line.conversionFactor??'',purchasePrice:line.purchasePrice??line.pieceNetCost??'',retailPrice:line.retailPrice??'',initialStock:line.initialStock??'',internalCode:line.internalCode||'',active:line.active!==false,trackStock:line.trackStock!==false,knowledgeId:'',central:false};
        if(line.barcode)cur.barcode=line.barcode;map.set(key,cur);
      }
    }
    for(const x of centralProducts||[]){
      const k=x.knowledge&&typeof x.knowledge==='object'?x.knowledge:{};
      const key=productKey(x.supplierTaxId,x.supplierName,x.supplierItemCode,x.description);
      const cur=map.get(key)||{key,supplierName:x.supplierName||'',supplierTaxId:x.supplierTaxId||'',supplierItemCode:x.supplierItemCode||'',description:x.description||'',barcode:'',category:'',subcategory:'',vatRate:'',invoiceUnit:'',stockUnit:'',unitsPerPackage:'',conversionFactor:'',purchasePrice:'',retailPrice:'',initialStock:'',internalCode:'',active:true,trackStock:true,knowledgeId:'',central:true};
      Object.assign(cur,{central:true,knowledgeId:x.id||cur.knowledgeId,supplierName:x.supplierName||cur.supplierName,supplierTaxId:x.supplierTaxId||cur.supplierTaxId,supplierItemCode:x.supplierItemCode||cur.supplierItemCode,description:x.description||cur.description,barcode:x.barcode||cur.barcode,category:k.category??cur.category,subcategory:k.subcategory??cur.subcategory,vatRate:x.vatRate??k.vatRate??cur.vatRate,invoiceUnit:x.invoiceUnit||k.invoiceUnit||cur.invoiceUnit,stockUnit:x.stockUnit||k.stockUnit||cur.stockUnit,unitsPerPackage:x.unitsPerPackage??k.unitsPerPackage??cur.unitsPerPackage,conversionFactor:x.conversionFactor??k.conversionFactor??cur.conversionFactor,purchasePrice:k.purchasePrice??cur.purchasePrice,retailPrice:k.retailPrice??cur.retailPrice,initialStock:k.initialStock??cur.initialStock,internalCode:k.internalCode||x.masterProductId||cur.internalCode,active:k.active!==false,trackStock:k.trackStock!==false});
      map.set(key,cur);
    }
    return [...map.values()].sort((a,b)=>Number(Boolean(a.barcode))-Number(Boolean(b.barcode))||String(a.supplierName).localeCompare(String(b.supplierName),'el')||String(a.description).localeCompare(String(b.description),'el'));
  };

  async function loadCentral(){
    const r=await fetch('/api/platform/invoice-learning/product-knowledge',{headers:headers()});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Σφάλμα ${r.status}`);centralProducts=Array.isArray(d.products)?d.products:[];
  }
  async function searchProducts(q){const r=await fetch(`/api/platform/invoice-learning/product-search?q=${encodeURIComponent(q)}`,{headers:headers()});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Σφάλμα ${r.status}`);return d}

  function saveLocal(item,data){
    const state=read();let changed=0;
    for(const doc of state.documents||[])for(const line of doc.lines||[]){
      if(productKey(doc?.supplierTaxId,doc?.supplierName,line?.supplierItemCode,line?.description)!==item.key)continue;
      Object.assign(line,{supplierItemCode:data.supplierItemCode,description:data.description,barcode:data.barcode,category:data.category,subcategory:data.subcategory,vatRate:data.vatRate,invoiceUnit:data.invoiceUnit,stockUnit:data.stockUnit,unitsPerPackage:data.unitsPerPackage,conversionFactor:data.conversionFactor,purchasePrice:data.purchasePrice,retailPrice:data.retailPrice,initialStock:data.initialStock,internalCode:data.internalCode,active:data.active,trackStock:data.trackStock,barcodeSource:data.barcode?'MANUAL_CONFIRMED':line.barcodeSource});changed++;
    }
    if(changed)write(state);return changed;
  }
  async function saveProduct(item,data){
    const localChanged=saveLocal(item,data);let centralChanged=0;
    if(item.knowledgeId){
      const r=await fetch(`/api/platform/invoice-learning/product-knowledge/${encodeURIComponent(item.knowledgeId)}`,{method:'PUT',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify(data)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Σφάλμα ${r.status}`);
      const i=centralProducts.findIndex(x=>x.id===item.knowledgeId);if(i>=0)centralProducts[i]={...centralProducts[i],...(d.product||{})};centralChanged=1;
    }
    if(!localChanged&&!centralChanged)throw new Error('Δεν βρέθηκε το προϊόν στο Learning.');return localChanged+centralChanged;
  }

  const style=()=>{if(document.getElementById('pendingBarcodeStyle'))return;const s=document.createElement('style');s.id='pendingBarcodeStyle';s.textContent=`
  .pb-card{background:#fff;border:1px solid #d8e1e6;border-radius:14px;padding:18px;margin:16px 0;box-shadow:0 5px 18px #102a3a0b}.pb-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.pb-head h2{margin:0;color:#17324a}.pb-badge{background:#fff4df;color:#9a5a00;border-radius:999px;padding:6px 10px;font-weight:900}.pb-table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}.pb-table th{background:#173f59;color:#fff;padding:9px;text-align:left}.pb-table td{padding:8px;border-bottom:1px solid #e4eaed;vertical-align:middle}.pb-open,.pb-save,.pb-find{border:0;border-radius:8px;padding:8px 11px;font-weight:900;cursor:pointer}.pb-open{background:#eef5f8;color:#173f59}.pb-save{background:#0f8877;color:#fff}.pb-find{background:#153f61;color:#fff}.pb-input{padding:8px;border:1px solid #c9d4da;border-radius:7px;min-width:170px}.pb-central{display:inline-block;margin-top:3px;font-size:10px;font-weight:900;color:#087b68;background:#e9f8f4;border-radius:999px;padding:2px 6px}
  .pb-modal{position:fixed;inset:0;background:#071b2dcc;display:flex;align-items:center;justify-content:center;z-index:2147483500;padding:12px}.pb-box{background:#fff;border-radius:12px;width:min(1500px,98vw);max-height:96vh;overflow:auto;box-shadow:0 25px 80px #0006}.pb-titlebar{background:#16315f;color:#fff;padding:16px 18px;font-size:22px;font-weight:900;display:flex;justify-content:space-between;align-items:center}.pb-close{border:0;background:transparent;color:#fff;font-size:26px;font-weight:900;cursor:pointer}.pb-body{padding:16px 18px 20px}.pb-hint{background:#eef8ff;border:1px solid #c9e2f4;border-radius:10px;padding:12px 14px;color:#345777;margin-bottom:16px}.pb-search{background:#f2f8fc;border:1px solid #b8d1df;border-radius:10px;padding:12px;margin-bottom:14px}.pb-search-row{display:grid;grid-template-columns:1fr auto auto;gap:10px}.pb-search-row input{min-height:46px;font-size:16px}.pb-results{display:grid;gap:8px;margin-top:10px}.pb-result{border:1px solid #cbdde8;border-radius:9px;padding:10px;background:#fff}.pb-result button{margin:6px 6px 0 0}.pb-form{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px}.pb-form label{font-weight:900;color:#1d3550;font-size:13px}.pb-form input,.pb-form select{display:block;width:100%;box-sizing:border-box;min-height:44px;margin-top:5px;border:1px solid #b9cbd7;border-radius:7px;padding:9px;font:inherit;background:#fff}.pb-wide{grid-column:1/-1}.pb-inline{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end}.pb-checks{display:flex;gap:22px;align-items:center;padding:12px 2px}.pb-checks label{display:flex;gap:8px;align-items:center;font-size:14px}.pb-checks input{width:auto;min-height:auto;margin:0}.pb-footer{display:flex;justify-content:flex-end;gap:10px;margin-top:18px;border-top:1px solid #e1e8ed;padding-top:14px}.pb-footer button{padding:12px 18px;font-weight:900;border-radius:7px;cursor:pointer}.pb-muted{color:#5f7180;font-size:12px}.pb-newbtn{min-height:44px;border:1px solid #1683a6;background:#fff;color:#12617a;border-radius:7px;font-weight:900;padding:0 14px;cursor:pointer}@media(max-width:850px){.pb-search-row,.pb-form{grid-template-columns:1fr}.pb-wide{grid-column:auto}.pb-inline{grid-template-columns:1fr}}
  `;document.head.appendChild(s)};

  const openModal=item=>{
    const cats=[...new Set(collect().map(x=>x.category).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'el'));
    const subs=[...new Set(collect().map(x=>x.subcategory).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'el'));
    const m=document.createElement('div');m.className='pb-modal';
    m.innerHTML=`<div class="pb-box"><div class="pb-titlebar"><span>Νέο είδος / Διόρθωση προϊόντος</span><button class="pb-close">×</button></div><div class="pb-body"><div class="pb-hint">Διόρθωσε από εδώ όλα τα στοιχεία του προϊόντος. Το Learning θα κρατήσει τις αλλαγές για τον συγκεκριμένο προμηθευτή.</div><div class="pb-search"><b>Βρες πρώτα το σωστό προϊόν / barcode</b><div class="pb-search-row"><input data-q value="${esc(item.description)}"><button class="pb-open" data-master>🔎 Master Catalog</button><button class="pb-find" data-google>🌐 Google / Barcode</button></div><div class="pb-results" data-results></div></div><div class="pb-form">
      <label class="pb-wide">Περιγραφή<input data-f="description" value="${esc(item.description)}"></label>
      <label>Barcode<input data-f="barcode" value="${esc(item.barcode||'')}" placeholder="Σκάναρε ή γράψε barcode"></label>
      <label>Εσωτερικός κωδικός<input data-f="internalCode" value="${esc(item.internalCode||'')}" placeholder="Αυτόματος / προαιρετικός"></label>
      <label><span>Κατηγορία</span><div class="pb-inline"><input list="pbCats" data-f="category" value="${esc(item.category||'')}" placeholder="π.χ. ΑΝΑΨΥΚΤΙΚΑ"><button type="button" class="pb-newbtn" data-newcat>+ Νέα</button></div></label>
      <label><span>Υποκατηγορία</span><div class="pb-inline"><input list="pbSubs" data-f="subcategory" value="${esc(item.subcategory||'')}" placeholder="Χωρίς υποκατηγορία"><button type="button" class="pb-newbtn" data-newsub>+ Νέα</button></div></label>
      <label>Τμήμα ΦΠΑ %<input data-f="vatRate" type="number" step="0.01" value="${esc(item.vatRate??'')}"></label>
      <label>Μονάδα μέτρησης<input data-f="stockUnit" value="${esc(item.stockUnit||'ΤΜΧ')}"></label>
      <label>Μονάδα τιμολογίου<input data-f="invoiceUnit" value="${esc(item.invoiceUnit||'')}"></label>
      <label>Supplier Code<input data-f="supplierItemCode" value="${esc(item.supplierItemCode||'')}"></label>
      <label>Τεμάχια / συσκευασία<input data-f="unitsPerPackage" type="number" step="0.0001" value="${esc(item.unitsPerPackage??'')}"></label>
      <label>Συντελεστής μετατροπής<input data-f="conversionFactor" type="number" step="0.0001" value="${esc(item.conversionFactor??'')}"></label>
      <label>Τιμή αγοράς<input data-f="purchasePrice" type="number" step="0.0001" value="${esc(item.purchasePrice??'')}"></label>
      <label>Τιμή λιανικής<input data-f="retailPrice" type="number" step="0.01" value="${esc(item.retailPrice??'')}"></label>
      <label>Αρχικό stock<input data-f="initialStock" type="number" step="0.001" value="${esc(item.initialStock??'')}"></label>
      <div class="pb-checks"><label><input data-f="active" type="checkbox" ${item.active!==false?'checked':''}> Ενεργό</label><label><input data-f="trackStock" type="checkbox" ${item.trackStock!==false?'checked':''}> Παρακολούθηση stock</label></div>
    </div><datalist id="pbCats">${cats.map(x=>`<option value="${esc(x)}"></option>`).join('')}</datalist><datalist id="pbSubs">${subs.map(x=>`<option value="${esc(x)}"></option>`).join('')}</datalist><div class="pb-footer"><button data-cancel>Ακύρωση</button><button class="pb-save" data-save>✓ Αποθήκευση όλων</button></div></div></div>`;
    const results=m.querySelector('[data-results]'),q=m.querySelector('[data-q]'),barcode=m.querySelector('[data-f="barcode"]');
    const showMaster=async()=>{results.innerHTML='<div class="pb-muted">Αναζήτηση Master Catalog…</div>';try{const d=await searchProducts(q.value.trim());const rows=d.master||[];results.innerHTML=rows.length?rows.map(x=>`<div class="pb-result"><b>${esc(x.name)}</b><div class="pb-muted">MASTER CATALOG · ${esc(x.sourceCode||'')}</div>${(x.barcodes||[]).map(b=>`<button type="button" class="pb-open" data-b="${esc(b)}">Χρήση ${esc(b)}</button>`).join('')}</div>`).join(''):'<div>Δεν βρέθηκε στο Master Catalog.</div>';results.querySelectorAll('[data-b]').forEach(b=>b.onclick=()=>barcode.value=b.dataset.b)}catch(e){results.innerHTML=`<div>${esc(e.message)}</div>`}};
    const showGoogle=async()=>{results.innerHTML='<div class="pb-muted">Αναζήτηση Google / Barcode…</div>';try{const d=await searchProducts(q.value.trim());const rows=d.google||[];results.innerHTML=rows.length?rows.map(x=>`<div class="pb-result"><b>${esc(x.name)}</b><div class="pb-muted">${esc(x.provider||'GOOGLE')} · ${esc(x.barcode||'')}</div>${x.snippet?`<small>${esc(x.snippet)}</small>`:''}<br><button type="button" class="pb-find" data-b="${esc(x.barcode||'')}">Χρήση ${esc(x.barcode||'')}</button></div>`).join(''):(d.googleConfigured?'<div>Δεν βρέθηκε ασφαλές barcode.</div>':'<div>Δεν είναι ρυθμισμένη online αναζήτηση Google.</div>');results.querySelectorAll('[data-b]').forEach(b=>b.onclick=()=>barcode.value=b.dataset.b)}catch(e){results.innerHTML=`<div>${esc(e.message)}</div>`}};
    m.querySelector('[data-master]').onclick=showMaster;m.querySelector('[data-google]').onclick=showGoogle;
    m.querySelector('[data-newcat]').onclick=()=>{const el=m.querySelector('[data-f="category"]');el.value='';el.focus()};m.querySelector('[data-newsub]').onclick=()=>{const el=m.querySelector('[data-f="subcategory"]');el.value='';el.focus()};
    m.querySelector('[data-save]').onclick=async()=>{try{
      const get=n=>m.querySelector(`[data-f="${n}"]`);const num=n=>get(n).value===''?'':Number(get(n).value);
      const data={description:get('description').value.trim(),barcode:get('barcode').value.replace(/\D/g,''),internalCode:get('internalCode').value.trim(),category:get('category').value.trim(),subcategory:get('subcategory').value.trim(),vatRate:num('vatRate'),stockUnit:get('stockUnit').value.trim(),invoiceUnit:get('invoiceUnit').value.trim(),supplierItemCode:get('supplierItemCode').value.trim(),unitsPerPackage:num('unitsPerPackage'),conversionFactor:num('conversionFactor'),purchasePrice:num('purchasePrice'),retailPrice:num('retailPrice'),initialStock:num('initialStock'),active:get('active').checked,trackStock:get('trackStock').checked};
      if(!data.description)throw new Error('Η περιγραφή είναι υποχρεωτική.');if(data.barcode&&(data.barcode.length<8||data.barcode.length>14))throw new Error('Το barcode πρέπει να έχει 8 έως 14 ψηφία.');
      const n=await saveProduct(item,data);alert(`Αποθηκεύτηκαν όλα τα στοιχεία του προϊόντος (${n} εγγραφή/ές Learning).`);m.remove();await loadCentral().catch(()=>{});render();
    }catch(e){alert(e.message)}};
    m.querySelector('.pb-close').onclick=()=>m.remove();m.querySelector('[data-cancel]').onclick=()=>m.remove();m.onclick=e=>{if(e.target===m)m.remove()};document.body.appendChild(m);
  };

  const render=()=>{
    style();const main=document.querySelector('.ill main');if(!main)return false;
    let host=document.querySelector('[data-pending-barcodes]');if(!host){host=document.createElement('section');host.className='pb-card';host.dataset.pendingBarcodes='1';const history=[...main.querySelectorAll('.card')].find(x=>x.textContent.includes('Εκπαιδευμένα τιμολόγια'));if(history)main.insertBefore(host,history);else main.appendChild(host)}
    const items=collect(),pending=items.filter(x=>!x.barcode);
    host.innerHTML=`<div class="pb-head"><div><h2>3. Προϊόντα / Εκκρεμή Barcodes</h2><div>Άνοιξε το προϊόν και διόρθωσε από ένα σημείο barcode, περιγραφή, κατηγορία, ΦΠΑ, μονάδες, τιμές και stock.</div></div><span class="pb-badge">${pending.length} χωρίς barcode</span></div><div style="overflow:auto"><table class="pb-table"><thead><tr><th>Προμηθευτής</th><th>Supplier Code</th><th>Προϊόν</th><th>Barcode</th><th></th></tr></thead><tbody>${items.length?items.map((x,i)=>`<tr data-i="${i}"><td>${esc(x.supplierName)}${x.central?'<br><span class="pb-central">CENTRAL LEARNING</span>':''}</td><td>${esc(x.supplierItemCode||'—')}</td><td><b>${esc(x.description)}</b></td><td>${esc(x.barcode||'Εκκρεμεί')}</td><td><button class="pb-open">Άνοιγμα / Διόρθωση προϊόντος</button></td></tr>`).join(''):'<tr><td colspan="5">Δεν υπάρχουν ακόμη προϊόντα Learning.</td></tr>'}</tbody></table></div>`;
    host.querySelectorAll('tbody tr[data-i]').forEach(row=>{const item=items[Number(row.dataset.i)];row.querySelector('.pb-open').onclick=()=>openModal(item)});return true;
  };

  const nativeSet=Storage.prototype.setItem;let busy=false;Storage.prototype.setItem=function(k,v){nativeSet.call(this,k,v);if(this===localStorage&&k===KEY&&!busy){busy=true;queueMicrotask(()=>{busy=false;render()})}};
  const start=async()=>{try{await loadCentral()}catch(e){console.warn('Central Learning unavailable',e)}render()};const timer=setInterval(()=>{if(document.querySelector('.ill main')){clearInterval(timer);start()}},300);window.addEventListener('load',start,{once:true});
}
