export function showPurchaseSupplierCorrection({root,parent,order,suppliers,api,modal,esc,money,refresh,current}){
 const valid=()=>root.isConnected&&parent.isConnected&&current();
 if(!valid()||parent.dataset.supplierCorrectionBusy)return;
 parent.dataset.supplierCorrectionBusy='1';
 const m=modal(`<div class="po-modal-title blue"><h2>Διόρθωση προμηθευτή τιμολογίου</h2><button data-po-close>×</button></div><form data-supplier-correction><p>Παραστατικό <b>${esc(order.invoiceNumber||'')}</b> · ${esc(order.supplierName||'Χωρίς προμηθευτή')}</p><label>Σωστός προμηθευτής<select name="supplierId" required><option value="">Επίλεξε βάσει πρωτοτύπου και ΑΦΜ</option>${suppliers.filter(s=>s.id!==order.supplierId&&/^\d{9}$/.test(String(s.taxId||'').trim())).map(s=>`<option value="${esc(s.id)}">${esc(s.name)} · ΑΦΜ ${esc(s.taxId)}</option>`).join('')}</select></label><button type="button" data-preview>Έλεγχος διόρθωσης</button><div data-preview-result></div><p role="alert"></p><button type="button" data-po-close>Άκυρο</button><button type="submit" disabled>Επιβεβαίωση διόρθωσης προμηθευτή</button></form>`);
 const form=m.querySelector('[data-supplier-correction]'),select=form.elements.supplierId,previewButton=form.querySelector('[data-preview]'),host=form.querySelector('[data-preview-result]'),submit=form.querySelector('[type=submit]'),error=form.querySelector('[role=alert]');
 let preview=null,busy=false,generation=0;
 const alive=()=>valid()&&m.isConnected;
 const update=()=>{submit.disabled=busy||!preview||!form.elements.reason?.value.trim()||form.elements.reason.value.trim().length<5||!form.elements.original?.checked||Boolean(preview.payment)&&!form.elements.payment?.checked};
 const invalidate=()=>{generation++;preview=null;host.innerHTML='';error.textContent='';update()};
 select.addEventListener('change',invalidate);
 form.addEventListener('input',update);form.addEventListener('change',update);
 m.addEventListener('click',event=>{if(event.target===m||event.target.closest('[data-po-close]')){generation++;delete parent.dataset.supplierCorrectionBusy}},{capture:true});
 previewButton.addEventListener('click',async()=>{
  if(!alive()||busy||!select.value)return;
  invalidate();const request=++generation,supplierId=select.value;previewButton.disabled=true;
  try{
   const p=await api(`/api/purchase-orders/${encodeURIComponent(order.id)}/supplier-correction-preview?storeId=${encodeURIComponent(order.storeId)}&supplierId=${encodeURIComponent(supplierId)}`);
   if(!alive()||request!==generation||supplierId!==select.value)return;
   preview=p;host.innerHTML=`<p><b>${esc(p.beforeSupplier?.name||'Χωρίς προμηθευτή')}</b> → <b>${esc(p.targetSupplier.name)} · ΑΦΜ ${esc(p.targetSupplier.taxId)}</b></p><p>Αξία τιμολογίου ${money(p.totalGross)}. Η κατάσταση της αγοράς και το απόθεμα διατηρούνται.</p>${p.payment?`<p>Υπάρχουσα πληρωμή ${money(p.payment.amount)}. Θα αλλάξει μόνο η σύνδεσή της στον σωστό προμηθευτή· ποσό, βάρδια και ημερομηνία διατηρούνται.</p><label><input name="payment" type="checkbox"> Επιβεβαιώνω ότι η ίδια αρχική πληρωμή αφορά τον σωστό προμηθευτή. Δεν γίνεται νέα χρέωση.</label>`:'<p>Δεν υπάρχει συνδεδεμένη πληρωμή. Δεν δημιουργείται πληρωμή.</p>'}<label><input name="original" type="checkbox"> Έλεγξα το πρωτότυπο, τον αριθμό τιμολογίου και το ΑΦΜ του σωστού προμηθευτή.</label><label>Αιτιολογία<textarea name="reason" minlength="5" maxlength="500" required></textarea></label>`;update();
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
