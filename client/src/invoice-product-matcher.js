export function installInvoiceProductMatcher({modal,orderId,storeId,lineId,description,api,onSelect,esc,money}){
 const query=modal.querySelector('[data-product-q]'),results=modal.querySelector('[data-product-results]'),search=modal.querySelector('[data-product-search]'),form=modal.querySelector('form'),barcode=form.elements.barcode;
 const panel=modal.querySelector('[data-new-product-barcode]');
 const note=document.createElement('p');note.setAttribute('role','status');note.dataset.barcodeCheck='';panel.appendChild(note);
 let revision=0,timer,barcodeSelection=null;
 const endpoint=`/api/commerce/purchase-orders/${encodeURIComponent(orderId)}/ocr-lines/${encodeURIComponent(lineId)}/catalog-matches`;
 const lookup=params=>api(`${endpoint}?${new URLSearchParams({storeId,...params})}`);
 const clear=()=>{revision++;clearTimeout(timer);barcodeSelection=null;onSelect(null);panel.hidden=false;results.replaceChildren();note.textContent='';};
 function pick(product,{exactBarcode=null}={}){
  revision++;clearTimeout(timer);
  if(!exactBarcode){form.querySelector('[name="barcodeMode"][value="NONE"]').checked=true;barcode.value='';barcode.disabled=true;}
  barcodeSelection=exactBarcode?{barcode:exactBarcode,id:product.id}:null;onSelect(product);panel.hidden=true;
  // Preserve the supplier's invoice description and every purchase field.
  results.innerHTML=`<p style="color:#176b32;font-weight:800">✓ ${exactBarcode?'Αντιστοίχιση barcode':'Επιλέχθηκε'}: ${esc(product.name)} · ${esc(product.sku||'')}<br><small>Η περιγραφή του τιμολογίου παραμένει ίδια.</small></p><button type="button" data-clear-product>Αλλαγή αντιστοίχισης</button>`;
  results.querySelector('[data-clear-product]').onclick=clear;
 }
 function render(data,{exactBarcode=null}={}){
  results.innerHTML=`<p>${exactBarcode?'Βρέθηκαν περισσότερα είδη με το ίδιο barcode. Επίλεξε το σωστό:':`Πιθανές αντιστοιχίσεις · ${data.total}${data.truncated?'+':''} είδη · ${data.offset+1}–${data.offset+data.rows.length}. Επιβεβαίωσε γεύση και συσκευασία.`}</p>${data.rows.map((p,i)=>`<div style="display:flex;justify-content:space-between;gap:8px;border:1px solid #d8e2e8;border-radius:7px;padding:7px;margin-top:4px"><span><b>${esc(p.name)}</b><small style="display:block">${esc(p.sku||'')} · ${money(p.salePrice)} · ${esc((p.barcodes||[]).join(', '))}</small></span><button type="button" data-product-pick="${i}">Επιλογή</button></div>`).join('')}${!exactBarcode&&data.offset>0?'<button type="button" data-match-previous>Προηγούμενα</button>':''}${data.hasMore?'<button type="button" data-match-next>Επόμενα είδη</button>':''}${data.truncated?'<p>Για περισσότερα είδη, πρόσθεσε γεύση ή βάρος στην αναζήτηση.</p>':''}`;
  results.querySelectorAll('[data-product-pick]').forEach(button=>button.onclick=()=>pick(data.rows[Number(button.dataset.productPick)],{exactBarcode}));
  results.querySelector('[data-match-next]')?.addEventListener('click',()=>findNames(data.offset+25));results.querySelector('[data-match-previous]')?.addEventListener('click',()=>findNames(data.offset-25));
 }
 async function findNames(offset=0){
  const current=++revision,q=query.value.trim();clearTimeout(timer);if(q.length<2){results.textContent='Γράψε τουλάχιστον 2 χαρακτήρες.';return}
  results.textContent='Αναζήτηση στο κατάστημα…';
  try{const data=await lookup({q,offset:String(offset)});if(current!==revision||!modal.isConnected)return;if(data.rows.length)render(data,{exactBarcode:data.barcode||null});else results.textContent='Δεν βρέθηκε υπάρχον είδος στο κατάστημα με αυτή την αναζήτηση.'}catch(error){if(current===revision&&modal.isConnected)results.textContent=error.message}
 }
 async function checkBarcode({saving=false}={}){
  const mode=form.elements.barcodeMode.value;if(mode==='NONE')return;
  const value=barcode.value.trim(),current=++revision;clearTimeout(timer);
  if(!/^\d{6,18}$/.test(value)){note.textContent='Συμπλήρωσε barcode 6–18 ψηφίων.';if(saving)throw Error(note.textContent);return}
  note.textContent='Έλεγχος barcode στην αποθήκη…';
  try{
   const data=await lookup({barcode:value});
   if(current!==revision||!modal.isConnected||barcode.value.trim()!==value||form.elements.barcodeMode.value!==mode){if(saving)throw Error('Το barcode άλλαξε. Πάτησε ξανά Καταχώρηση.');return}
   if(data.rows.length===1){pick(data.rows[0],{exactBarcode:value});note.textContent='Βρέθηκε υπάρχον είδος. Θα αντιστοιχιστεί χωρίς νέα εγγραφή.';return}
   if(data.rows.length>1){
    if(saving&&barcodeSelection?.barcode===value&&data.rows.some(p=>p.id===barcodeSelection.id))return;
    onSelect(null);panel.hidden=false;barcodeSelection=null;render(data,{exactBarcode:value});note.textContent='Επίλεξε ένα από τα υπάρχοντα είδη. Δεν θα δημιουργηθεί νέο.';if(saving)throw Error(note.textContent);return;
   }
   barcodeSelection=null;onSelect(null);panel.hidden=false;results.replaceChildren();note.textContent='Δεν βρέθηκε άλλο είδος στο κατάστημα με αυτό το barcode. Μπορείς να καταχωρήσεις νέο είδος.';
  }catch(error){if(current===revision&&modal.isConnected)note.textContent=`Ο έλεγχος δεν ολοκληρώθηκε: ${error.message}`;if(saving)throw error}
 }
 search.onclick=()=>findNames();
 query.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();findNames()}});
 barcode.addEventListener('input',()=>{revision++;clearTimeout(timer);if(barcodeSelection){onSelect(null);barcodeSelection=null;panel.hidden=false}note.textContent='';timer=setTimeout(()=>checkBarcode(),250)});
 barcode.addEventListener('change',()=>checkBarcode());
 barcode.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();checkBarcode()}});
 form.querySelectorAll('[name="barcodeMode"]').forEach(radio=>radio.addEventListener('change',()=>{revision++;clearTimeout(timer);note.textContent='';barcodeSelection=null}));
 const observer=new MutationObserver(()=>{if(!modal.isConnected){revision++;clearTimeout(timer);observer.disconnect()}});observer.observe(document.body,{childList:true});
 query.value=description;findNames();
 return {beforeSave:()=>checkBarcode({saving:true})};
}
