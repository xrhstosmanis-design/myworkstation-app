const PATH='/platform-admin/invoice-learning-lab';
if(window.location.pathname.replace(/\/+$/,'')===PATH){
  const token=()=>localStorage.getItem('token')||'';
  const headers=()=>({Authorization:`Bearer ${token()}`,'Content-Type':'application/json'});
  async function persistWorkspace(state){
    const r=await fetch('/api/platform/invoice-learning/workspace',{method:'PUT',headers:headers(),body:JSON.stringify({state})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||'Δεν αποθηκεύτηκε κεντρικά ο χάρτης στηλών.');
    return data;
  }
  const value=(row,key)=>row.querySelector(`[data-k="${key}"]`)?.value||'';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  let targets=null;

  async function loadTargets(){
    if(targets)return targets;
    const r=await fetch('/api/platform/invoice-learning/catalog-targets',{headers:headers()}),data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||'Δεν φορτώθηκαν τα καταστήματα.');
    targets=data.companies||[];return targets;
  }
  function closeModal(){document.querySelector('[data-ill-master-modal]')?.remove()}
  async function openCreate(row){
    const supplierName=document.querySelector('#supplierName')?.value||'',supplierTaxId=document.querySelector('#supplierTaxId')?.value||'',commercialFamily=document.querySelector('#commercialFamily')?.value||'',distributorName=document.querySelector('#distributorName')?.value||'';
    let companies;try{companies=await loadTargets()}catch(error){alert(error.message);return}
    const modal=document.createElement('div');modal.dataset.illMasterModal='1';modal.style.cssText='position:fixed;inset:0;background:#0b223966;z-index:10000;display:grid;place-items:center;padding:18px';
    modal.innerHTML=`<section style="background:#fff;max-width:780px;width:100%;max-height:88vh;overflow:auto;border-radius:14px;padding:20px;color:#17324a"><h2 style="margin:0 0 8px">Νέο προϊόν στο Master Catalog</h2><p style="margin:0 0 14px">Θα δημιουργηθεί κεντρικά και θα εμφανιστεί έτοιμο μόνο στα καταστήματα που επιλέγεις. Απόθεμα και λιανική παραμένουν 0.</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label>Περιγραφή<input data-name value="${esc(value(row,'description'))}"></label><label>Κωδικός προμηθευτή<input data-code value="${esc(value(row,'supplierItemCode'))}"></label><label>Barcode<input data-barcode value="${esc(value(row,'barcode'))}"></label><label>ΦΠΑ %<input data-vat value="${esc(value(row,'vatRate'))}"></label><label>Τιμή αγοράς<input data-cost value="${esc(value(row,'unitPrice'))}"></label><label>Λιανική<input data-retail value="" placeholder="Θα οριστεί από το κατάστημα"></label></div><div style="margin-top:15px"><b>Διάθεση σε καταστήματα</b> <button type="button" data-all style="margin-left:8px">Επιλογή όλων</button><div style="margin-top:7px;display:grid;gap:6px">${companies.map(c=>`<div><b>${esc(c.name)}</b>${(c.stores||[]).map(s=>`<label style="display:block;font-weight:500"><input type="checkbox" data-store value="${esc(s.id)}"> ${esc(s.name)}${s.city?` · ${esc(s.city)}`:''}</label>`).join('')}</div>`).join('')}</div></div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px"><button type="button" data-cancel>Άκυρο</button><button type="button" data-save style="background:#0f8877;color:#fff;border:0;border-radius:8px;padding:10px 14px;font-weight:800">Δημιουργία & διάθεση</button></div></section>`;
    modal.addEventListener('click',event=>{if(event.target===modal)closeModal()});document.body.appendChild(modal);
    modal.querySelector('[data-cancel]').onclick=closeModal;
    modal.querySelector('[data-all]').onclick=event=>{const boxes=[...modal.querySelectorAll('[data-store]')],all=boxes.every(x=>x.checked);boxes.forEach(x=>x.checked=!all);event.currentTarget.textContent=all?'Επιλογή όλων':'Καμία επιλογή'};
    modal.querySelector('[data-save]').onclick=async()=>{
      const button=modal.querySelector('[data-save]'),storeIds=[...modal.querySelectorAll('[data-store]:checked')].map(x=>x.value);
      button.disabled=true;button.textContent='Αποθήκευση…';
      try{
        const listPrice=Number(modal.querySelector('[data-cost]').value||0),d1=Number(value(row,'discount1')||0),d2=Number(value(row,'discount2')||0),d3=Number(value(row,'discount3')||0),netCost=listPrice*(1-d1/100)*(1-d2/100)*(1-d3/100);
        const body={description:modal.querySelector('[data-name]').value,supplierItemCode:modal.querySelector('[data-code]').value,barcode:modal.querySelector('[data-barcode]').value,supplierName,supplierTaxId,vatRate:modal.querySelector('[data-vat]').value,defaultCostPrice:Number.isFinite(netCost)?netCost:modal.querySelector('[data-cost]').value,defaultRetailPrice:modal.querySelector('[data-retail]').value,storeIds};
        const r=await fetch('/api/platform/invoice-learning/master-products',{method:'POST',headers:headers(),body:JSON.stringify(body)}),data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'Δεν δημιουργήθηκε το Master προϊόν.');
        const search=row.querySelector('[data-master-search]');search.value=data.master.name;search.dispatchEvent(new Event('input',{bubbles:true}));
        setTimeout(()=>row.querySelector(`.results [data-id="${CSS.escape(data.master.id)}"]`)?.click(),360);
        const status=document.querySelector('#status');if(status)status.textContent=`Το «${data.master.name}» αποθηκεύτηκε στο Master Catalog και διατέθηκε σε ${data.stores} κατάστημα/τα. Η λιανική παραμένει προς ορισμό.`;
        closeModal();
      }catch(error){alert(error.message);button.disabled=false;button.textContent='Δημιουργία & διάθεση'}
    };
  }
  function installMasterButtons(){
    document.querySelectorAll('#lines tr').forEach(row=>{const cell=row.querySelector('.master'),search=row.querySelector('[data-master-search]');if(!cell||!search||cell.querySelector('[data-create-master]'))return;
      const button=document.createElement('button');button.type='button';button.dataset.createMaster='1';button.textContent='＋ Νέο Master / Διάθεση';button.style.cssText='margin-top:5px;border:1px solid #0f766e;color:#0f766e;background:#fff;border-radius:6px;padding:5px 7px;font-weight:800;font-size:11px;cursor:pointer';button.onclick=()=>openCreate(row);cell.appendChild(button);
    });
  }
  const columnRoles=[
    ['IGNORE','— Δεν χρησιμοποιείται —'],['SUPPLIER_CODE','Κωδικός είδους'],['DESCRIPTION','Περιγραφή'],['RETAIL_PRICE','Λιανική τιμή (αγνοείται στην αγορά)'],['UNIT','Μονάδα μέτρησης'],['QUANTITY','Ποσότητα'],['UNIT_PRICE','Τιμή μονάδας αγοράς'],['AMOUNT_BEFORE_DISCOUNT','Αξία προ έκπτωσης'],['DISCOUNT_1','Έκπτωση 1 %'],['DISCOUNT_2','Έκπτωση 2 %'],['DISCOUNT_3','Έκπτωση 3 %'],['AMOUNT_AFTER_DISCOUNT','Αξία μετά έκπτωσης'],['VAT_RATE','ΦΠΑ %']
  ];
  const profileKey=()=>{const name=document.querySelector('#supplierName')?.value?.trim()||'',taxId=(document.querySelector('#supplierTaxId')?.value||'').replace(/\D/g,'');return {name,taxId,key:taxId||name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g,'')};};
  function closeColumnModal(){document.querySelector('[data-ill-column-modal]')?.remove()}
  function openColumnMap(){
    const {name,taxId,key}=profileKey();if(!name&&!taxId){alert('Συμπλήρωσε πρώτα προμηθευτή ή ΑΦΜ.');return}
    let state;try{state=JSON.parse(localStorage.getItem('mws_invoice_learning_lab_v1')||'{}')}catch{state={}};const old=state?.profiles?.[key]||{};
    const preset={1:'SUPPLIER_CODE',2:'DESCRIPTION',3:'RETAIL_PRICE',4:'UNIT',5:'QUANTITY',6:'UNIT_PRICE',7:'AMOUNT_BEFORE_DISCOUNT',8:'DISCOUNT_1',9:'DISCOUNT_2',10:'DISCOUNT_3',11:'AMOUNT_AFTER_DISCOUNT',12:'VAT_RATE'};
    const existing=old?.readingRule?.columns||old?.columnMap?.columns||preset;
    const modal=document.createElement('div');modal.dataset.illColumnModal='1';modal.style.cssText='position:fixed;inset:0;background:#0b223966;z-index:10001;display:grid;place-items:center;padding:18px';
    modal.innerHTML=`<section style="background:#fff;max-width:850px;width:100%;max-height:88vh;overflow:auto;border-radius:14px;padding:22px;color:#17324a"><h2 style="margin:0 0 7px">Χάρτης στηλών προμηθευτή</h2><p style="margin:0 0 14px">Ορίζεις μία φορά τι σημαίνει κάθε στήλη. Η λιανική ξεχωρίζει από την τιμή αγοράς και ο κανόνας αποθηκεύεται κεντρικά για όλα τα καταστήματα.</p><div style="padding:10px;background:#eef7f5;border-radius:8px;margin-bottom:14px"><b>${esc(name||taxId)}</b>${taxId?` · ΑΦΜ ${esc(taxId)}`:''}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px"><label>Εμπορική οικογένεια / μορφή<input data-family value="${esc(old.commercialFamily||old.formatFamily||'')}" placeholder="π.χ. ΔΕΛΤΑ"></label><label>Διανομέας / περιοχή<input data-distributor value="${esc(old.distributorName||old.distributor||'')}" placeholder="π.χ. ΜΑΝΤΖΑΒΑΣ"></label></div><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">${Array.from({length:12},(_,i)=>{const n=i+1;return `<label>Στήλη ${n}<select data-column="${n}">${columnRoles.map(([v,label])=>`<option value="${v}" ${existing[n]===v?'selected':''}>${esc(label)}</option>`).join('')}</select></label>`}).join('')}</div><p style="font-size:12px;color:#486274;margin:15px 0 0">Η οικογένεια ΔΕΛΤΑ συνδέει μόνο τη διάταξη/στήλες. Δεν μεταφέρει ποσότητες, τιμές, εκπτώσεις ή οφειλές από άλλο ΑΦΜ. Έλεγχος ασφαλείας: ποσότητα × τιμή μονάδας πρέπει να συμφωνεί με την αξία της γραμμής.</p><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px"><button type="button" data-cancel>Άκυρο</button><button type="button" data-save style="background:#0f8877;color:#fff;border:0;border-radius:8px;padding:10px 14px;font-weight:800">Αποθήκευση κανόνα</button></div></section>`;
    document.body.appendChild(modal);modal.addEventListener('click',e=>{if(e.target===modal)closeColumnModal()});modal.querySelector('[data-cancel]').onclick=closeColumnModal;
    modal.querySelector('[data-save]').onclick=async()=>{const columns={};modal.querySelectorAll('[data-column]').forEach(select=>columns[select.dataset.column]=select.value);const needed=['SUPPLIER_CODE','DESCRIPTION','UNIT','QUANTITY','UNIT_PRICE'];if(needed.some(role=>!Object.values(columns).includes(role))){alert('Συμπλήρωσε τουλάχιστον κωδικό, περιγραφή, μονάδα, ποσότητα και τιμή μονάδας.');return}const saveButton=modal.querySelector('[data-save]');saveButton.disabled=true;saveButton.textContent='Κεντρική αποθήκευση…';state.profiles=state.profiles&&typeof state.profiles==='object'?state.profiles:{};state.profiles[key]={...old,supplierName:name||old.supplierName||'',supplierTaxId:taxId||old.supplierTaxId||'',commercialFamily:modal.querySelector('[data-family]')?.value?.trim()||old.commercialFamily||'',distributorName:modal.querySelector('[data-distributor]')?.value?.trim()||old.distributorName||'',central:true,readingRule:{...(old.readingRule||{}),layoutMode:'DECLARED_COLUMNS',columns,quantityMode:'LINE_TOTAL_MATCH'},columnMap:{columns},ruleKey:'DECLARED_COLUMNS',ruleDescription:'Χάρτης στηλών ανά εμπορική μορφή. Δεν αντιγράφει οικονομικές τιμές.'};try{await persistWorkspace(state);localStorage.setItem('mws_invoice_learning_lab_v1',JSON.stringify(state));const status=document.querySelector('#status');if(status)status.textContent='Ο χάρτης στηλών και η εμπορική οικογένεια αποθηκεύτηκαν κεντρικά. Οι τιμές θα διαβάζονται από το νέο τιμολόγιο.';closeColumnModal();const trigger=document.querySelector('[data-column-map]');if(trigger)trigger.textContent='✓ Χάρτης μορφής αποθηκεύτηκε'}catch(error){alert(error.message);saveButton.disabled=false;saveButton.textContent='Αποθήκευση κανόνα'}};
  }
  function installColumnMap(){
    const review=document.querySelector('#review');if(!review||review.querySelector('[data-column-map]'))return;
    const button=document.createElement('button');button.type='button';button.dataset.columnMap='1';button.textContent='Ρύθμιση στηλών προμηθευτή';button.style.cssText='margin:0 0 12px;border:1px solid #5b43ce;background:#f5f2ff;color:#4428a7;border-radius:8px;padding:9px 11px;font-weight:900;cursor:pointer';button.onclick=openColumnMap;
    review.querySelector('.sectionTitle')?.after(button);
  }
  const install=()=>{installMasterButtons();installColumnMap()};install();new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});
}
