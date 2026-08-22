const PATH='/platform-admin/invoice-learning-lab';
if(window.location.pathname.replace(/\/+$/,'')===PATH){
  const KEY='mws_invoice_learning_lab_v1';
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')||{documents:[],profiles:{},master:[]}}catch{return {documents:[],profiles:{},master:[]}}};
  const write=state=>localStorage.setItem(KEY,JSON.stringify(state));
  const productKey=(doc,line)=>[doc?.supplierTaxId||norm(doc?.supplierName),line?.supplierItemCode||'',norm(line?.description)].join('|');
  const collect=()=>{
    const state=read(),map=new Map();
    for(const doc of state.documents||[]){
      if(doc?.status!=='LEARNED')continue;
      for(const line of doc.lines||[]){
        if(!line||line.status==='REJECTED')continue;
        const key=productKey(doc,line);if(!key)continue;
        const cur=map.get(key)||{key,supplierName:doc.supplierName||'',supplierTaxId:doc.supplierTaxId||'',supplierItemCode:line.supplierItemCode||'',description:line.description||'',barcode:line.barcode||'',invoiceNo:doc.invoiceNo||doc.invoiceNumber||doc.filename||'',invoiceDate:doc.invoiceDate||'',occurrences:0,masterProductId:line.masterProductId||'',masterProductName:line.masterProductName||''};
        cur.occurrences++;if(line.barcode)cur.barcode=line.barcode;if(line.masterProductId){cur.masterProductId=line.masterProductId;cur.masterProductName=line.masterProductName||cur.masterProductName}map.set(key,cur);
      }
    }
    return [...map.values()].sort((a,b)=>Number(Boolean(a.barcode))-Number(Boolean(b.barcode))||a.description.localeCompare(b.description,'el'));
  };
  const saveBarcode=(key,barcode)=>{
    const clean=String(barcode||'').replace(/\D/g,'');
    if(clean.length<8||clean.length>14)throw new Error('Το barcode πρέπει να έχει 8 έως 14 ψηφία.');
    const state=read();let changed=0;
    for(const doc of state.documents||[]){
      for(const line of doc.lines||[]){
        if(productKey(doc,line)!==key)continue;
        line.barcode=clean;line.barcodeSource='MANUAL_CONFIRMED';line.barcodeReference='PENDING_BARCODE_REGISTRY';changed++;
      }
    }
    for(const profile of Object.values(state.profiles||{})){
      for(const mapping of Object.values(profile?.mappings||{})){
        const code=String(mapping?.sourceCode||mapping?.supplierItemCode||'');
        const item=collect().find(x=>x.key===key);
        if(item&&((code&&code===item.supplierItemCode)||mapping?.masterProductId===item.masterProductId))mapping.barcode=clean;
      }
    }
    if(!changed)throw new Error('Δεν βρέθηκε το προϊόν στα εκπαιδευμένα τιμολόγια.');
    write(state);return changed;
  };
  const style=()=>{if(document.getElementById('pendingBarcodeStyle'))return;const s=document.createElement('style');s.id='pendingBarcodeStyle';s.textContent=`.pb-card{background:#fff;border:1px solid #d8e1e6;border-radius:14px;padding:18px;margin:16px 0;box-shadow:0 5px 18px #102a3a0b}.pb-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.pb-head h2{margin:0;color:#17324a}.pb-badge{background:#fff4df;color:#9a5a00;border-radius:999px;padding:6px 10px;font-weight:900}.pb-table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}.pb-table th{background:#173f59;color:white;padding:9px;text-align:left}.pb-table td{padding:8px;border-bottom:1px solid #e4eaed;vertical-align:middle}.pb-open,.pb-save{border:0;border-radius:8px;padding:8px 11px;font-weight:900;cursor:pointer}.pb-open{background:#eef5f8;color:#173f59}.pb-save{background:#0f8877;color:#fff}.pb-input{padding:8px;border:1px solid #c9d4da;border-radius:7px;min-width:170px}.pb-modal{position:fixed;inset:0;background:#0007;display:flex;align-items:center;justify-content:center;z-index:99999}.pb-box{background:white;border-radius:14px;padding:22px;max-width:650px;width:min(650px,92vw);box-shadow:0 20px 60px #0004}.pb-box h3{margin-top:0}.pb-grid{display:grid;grid-template-columns:160px 1fr;gap:9px}.pb-close{float:right;border:0;background:#eee;border-radius:8px;padding:7px 10px;font-weight:900;cursor:pointer}`;document.head.appendChild(s)};
  const openModal=item=>{const m=document.createElement('div');m.className='pb-modal';m.innerHTML=`<div class="pb-box"><button class="pb-close">✕</button><h3>${esc(item.description)}</h3><div class="pb-grid"><b>Προμηθευτής</b><span>${esc(item.supplierName)}</span><b>Supplier code</b><span>${esc(item.supplierItemCode||'—')}</span><b>Τελευταίο τιμολόγιο</b><span>${esc(item.invoiceNo||'—')} ${esc(item.invoiceDate||'')}</span><b>Master προϊόν</b><span>${esc(item.masterProductName||'Δεν έχει γίνει αντιστοίχιση')}</span><b>Barcode</b><span>${esc(item.barcode||'Εκκρεμεί')}</span><b>Εμφανίσεις</b><span>${item.occurrences}</span></div></div>`;m.querySelector('.pb-close').onclick=()=>m.remove();m.onclick=e=>{if(e.target===m)m.remove()};document.body.appendChild(m)};
  const render=()=>{
    style();const main=document.querySelector('.ill main');if(!main)return false;
    let host=document.querySelector('[data-pending-barcodes]');if(!host){host=document.createElement('section');host.className='pb-card';host.dataset.pendingBarcodes='1';const history=[...main.querySelectorAll('.card')].find(x=>x.textContent.includes('Εκπαιδευμένα τιμολόγια'));if(history)main.insertBefore(host,history);else main.appendChild(host)}
    const items=collect(),pending=items.filter(x=>!x.barcode);
    host.innerHTML=`<div class="pb-head"><div><h2>3. Προϊόντα / Εκκρεμή Barcodes</h2><div>Τα προϊόντα παραμένουν στο κεντρικά συγχρονισμένο Invoice Learning Workspace μέχρι να μάθεις το barcode.</div></div><span class="pb-badge">${pending.length} χωρίς barcode</span></div><div style="overflow:auto"><table class="pb-table"><thead><tr><th>Προμηθευτής</th><th>Supplier Code</th><th>Προϊόν</th><th>Barcode</th><th></th></tr></thead><tbody>${items.length?items.map((x,i)=>`<tr data-i="${i}"><td>${esc(x.supplierName)}</td><td>${esc(x.supplierItemCode||'—')}</td><td><b>${esc(x.description)}</b><br><small>${esc(x.invoiceNo||'')}</small></td><td><input class="pb-input" value="${esc(x.barcode||'')}" placeholder="Συμπλήρωσε όταν το μάθεις"></td><td><button class="pb-open">Άνοιγμα</button> <button class="pb-save">Αποθήκευση Barcode</button></td></tr>`).join(''):'<tr><td colspan="5">Δεν υπάρχουν ακόμη εκπαιδευμένα προϊόντα.</td></tr>'}</tbody></table></div>`;
    host.querySelectorAll('tbody tr[data-i]').forEach(row=>{const item=items[Number(row.dataset.i)],input=row.querySelector('.pb-input');row.querySelector('.pb-open').onclick=()=>openModal(item);row.querySelector('.pb-save').onclick=()=>{try{const n=saveBarcode(item.key,input.value);alert(`Το barcode αποθηκεύτηκε σε ${n} εκπαιδευμένη/ες εγγραφή/ές.`);render()}catch(e){alert(e.message)}}});
    return true;
  };
  const nativeSet=Storage.prototype.setItem;let busy=false;
  Storage.prototype.setItem=function(k,v){nativeSet.call(this,k,v);if(this===localStorage&&k===KEY&&!busy){busy=true;queueMicrotask(()=>{busy=false;render()})}};
  const timer=setInterval(()=>{if(render())clearInterval(timer)},300);window.addEventListener('load',render,{once:true});
}
