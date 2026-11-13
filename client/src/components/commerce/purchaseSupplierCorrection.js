export function showPurchaseSupplierCorrection({root,parent,order,suppliers,api,modal,esc,money,refresh,current}){
 const valid=()=>root.isConnected&&parent.isConnected&&current();
 if(!valid()||parent.dataset.supplierCorrectionBusy)return;
 parent.dataset.supplierCorrectionBusy='1';
 const issuerVat=String(order.mydataIssuerVat||'');
 const issuerName=order.mydataIssuerName;
 const existingIssuer=suppliers.find(s=>String(s.taxId||'').trim()===issuerVat);
 const issuerForm=!order.supplierId&&issuerName&&/^\d{9}$/.test(issuerVat)&&!existingIssuer?`
  <details><summary>Νέος προμηθευτής από myDATA</summary>
   <label>Επωνυμία <input value="${esc(issuerName)}" readonly></label>
   <label>ΑΦΜ <input value="${esc(issuerVat)}" readonly></label>
   <button type="button" data-create-mydata-supplier>Δημιουργία προμηθευτή</button>
  </details>`:'';
 const m=modal(`<div class="po-modal-title blue"><h2>Διόρθωση προμηθευτή τιμολογίου</h2><button data-po-close>×</button></div><form data-supplier-correction style="padding:20px;display:grid;gap:16px;font-size:18px"><p>Παραστατικό <b>${esc(order.invoiceNumber||'')}</b> · ${esc(order.supplierName||'Χωρίς προμηθευτή')}</p><label>Σωστός προμηθευτής<select name="supplierId" required style="display:block;width:100%;min-height:48px;font-size:18px"><option value="">Επίλεξε βάσει πρωτοτύπου και ΑΦΜ</option>${suppliers.filter(s=>s.id!==order.supplierId&&/^\d{9}$/.test(String(s.taxId||'').trim())).map(s=>`<option value="${esc(s.id)}">${esc(s.name)} · ΑΦΜ ${esc(s.taxId)}</option>`).join('')}</select></label>${issuerForm}<button type="button" data-preview>Έλεγχος διόρθωσης</button><div data-preview-result style="display:grid;gap:14px"></div><p role="alert"></p><button type="button" data-po-close>Άκυρο</button><button type="submit" class="primary" disabled>Επιβεβαίωση διόρθωσης προμηθευτή</button></form>`);
 const form=m.querySelector('[data-supplier-correction]'),select=form.elements.supplierId,previewButton=form.querySelector('[data-preview]'),host=form.querySelector('[data-preview-result]'),submit=form.querySelector('[type=submit]'),error=form.querySelector('[role=alert]');
 let preview=null,busy=false,generation=0;
 const alive=()=>valid()&&m.isConnected;
 const update=()=>{submit.disabled=busy||!preview||!form.elements.reason?.value.trim()||form.elements.reason.value.trim().length<5||!form.elements.original?.checked||Boolean(preview.payment)&&!form.elements.payment?.checked};
 const invalidate=()=>{generation++;preview=null;host.innerHTML='';error.textContent='';update()};
 select.addEventListener('change',invalidate);
 form.addEventListener('input',update);form.addEventListener('change',update);
 m.addEventListener('click',event=>{if(event.target===m||event.target.closest('[data-po-close]')){generation++;delete parent.dataset.supplierCorrectionBusy}},{capture:true});
 const createButton=form.querySelector('[data-create-mydata-supplier]');
 createButton?.addEventListener('click',async()=>{
  if(!alive()||busy)return;
  invalidate();busy=true;select.disabled=true;createButton.disabled=true;previewButton.disabled=true;
  let supplierId='';
  try{
   const lookup=await api(`/api/commerce/vat-lookup?storeId=${encodeURIComponent(order.storeId)}&taxId=${issuerVat}`);
   if(!alive())return;
   const supplier=lookup.existingSupplier||await api('/api/commerce/suppliers',{method:'POST',body:JSON.stringify({name:issuerName,taxId:issuerVat})});
   if(!alive())return;
   if(!supplier?.id)throw new Error('Δεν βρέθηκε η καρτέλα προμηθευτή.');
   supplierId=supplier.id;
   if(!Array.from(select.options).some(option=>option.value===supplierId)){
    const option=document.createElement('option');
    option.value=supplierId;option.textContent=`${supplier.name||issuerName} · ΑΦΜ ${issuerVat}`;
    select.appendChild(option);
   }
   select.value=supplierId;
   createButton.closest('details').remove();
  }catch(e){if(alive())error.textContent=e.message}
  finally{busy=false;if(alive()){select.disabled=false;createButton.disabled=false;previewButton.disabled=false;update()}}
  if(alive()&&supplierId)previewButton.click();
 });
 previewButton.addEventListener('click',async()=>{
  if(!alive()||busy||!select.value)return;
  invalidate();const request=++generation,supplierId=select.value;previewButton.disabled=true;
  try{
   const p=await api(`/api/purchase-orders/${encodeURIComponent(order.id)}/supplier-correction-preview?storeId=${encodeURIComponent(order.storeId)}&supplierId=${encodeURIComponent(supplierId)}`);
   if(!alive()||request!==generation||supplierId!==select.value)return;
   preview=p;host.innerHTML=`<p><b>${esc(p.beforeSupplier?.name||'Χωρίς προμηθευτή')}</b> → <b>${esc(p.targetSupplier.name)} · ΑΦΜ ${esc(p.targetSupplier.taxId)}</b></p><p>Αξία τιμολογίου ${money(p.totalGross)}. Η κατάσταση της αγοράς και το απόθεμα διατηρούνται.</p>${p.payment?`<p>Υπάρχουσα πληρωμή ${money(p.payment.amount)}. Θα αλλάξει μόνο η σύνδεσή της στον σωστό προμηθευτή· ποσό, βάρδια και ημερομηνία διατηρούνται.</p><label><input name="payment" type="checkbox"> Επιβεβαιώνω ότι η ίδια αρχική πληρωμή αφορά τον σωστό προμηθευτή. Δεν γίνεται νέα χρέωση.</label>`:'<p>Δεν υπάρχει συνδεδεμένη πληρωμή. Δεν δημιουργείται πληρωμή.</p>'}<label><input name="original" type="checkbox"> Έλεγξα το πρωτότυπο, τον αριθμό τιμολογίου και το ΑΦΜ του σωστού προμηθευτή.</label><label>Αιτιολογία<textarea name="reason" minlength="5" maxlength="500" required style="display:block;width:100%;min-height:80px;font-size:18px"></textarea></label>`;update();
  }catch(e){if(alive()&&request===generation)error.textContent=e.message}finally{if(alive())previewButton.disabled=false}
 });
 form.addEventListener('submit',async event=>{
  event.preventDefault();update();if(!alive()||submit.disabled||busy||!preview)return;
  busy=true;update();select.disabled=true;previewButton.disabled=true;error.textContent='';
  try{
   await api(`/api/purchase-orders/${encodeURIComponent(order.id)}/supplier-correction`,{method:'POST',body:JSON.stringify({storeId:order.storeId,supplierId:select.value,version:preview.version,reason:form.elements.reason.value.trim(),confirmOriginal:form.elements.original.checked,confirmPaymentSupplier:Boolean(form.elements.payment?.checked)})});
   if(!alive())return;m.remove();delete parent.dataset.supplierCorrectionBusy;await refresh();
  }catch(e){if(alive()){error.textContent=e.message;preview=null;submit.disabled=true}}finally{busy=false;if(alive()){select.disabled=false;previewButton.disabled=false;update()}}
 });
 return m;
}
