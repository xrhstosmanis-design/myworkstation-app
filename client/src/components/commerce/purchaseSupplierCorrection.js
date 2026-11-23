export function showPurchaseSupplierCorrection({root,parent,order,suppliers,api,modal,esc,money,refresh,current,staff=false,lookup=true,officialLookup=false,create=true}){
 const valid=()=>root.isConnected&&parent.isConnected&&current();
 if(!valid()||parent.dataset.supplierCorrectionBusy)return;
 parent.dataset.supplierCorrectionBusy='1';
 const issuerVat=String(order.mydataIssuerVat||'');
 const issuerName=order.mydataIssuerName;
 const existingIssuer=suppliers.find(s=>s.id!==order.supplierId&&String(s.taxId||'').replace(/\D/g,'')===issuerVat);
 const canFindIssuer=lookup&&!order.supplierId&&/^\d{9}$/.test(issuerVat);
 const lookupButton=canFindIssuer?`<button type="button" data-find-mydata-supplier>Εύρεση προμηθευτή με ΑΦΜ ${esc(issuerVat)}</button>`:'';
 const issuerForm=create&&canFindIssuer&&issuerName&&!existingIssuer?`
  <details><summary>Νέος προμηθευτής από myDATA</summary>
   <label>Επωνυμία <input value="${esc(issuerName)}" readonly></label>
   <label>ΑΦΜ <input value="${esc(issuerVat)}" readonly></label>
   <button type="button" data-create-mydata-supplier>Δημιουργία προμηθευτή</button>
  </details>`:'';
 const m=modal(`<div class="po-modal-title blue"><h2>Διόρθωση προμηθευτή τιμολογίου</h2><button data-po-close>×</button></div><form data-supplier-correction novalidate style="padding:20px;display:grid;gap:16px;font-size:18px"><p>Παραστατικό <b>${esc(order.invoiceNumber||'')}</b> · ${esc(order.supplierName||'Χωρίς προμηθευτή')}</p><label>Αναζήτηση προμηθευτή<input type="search" name="supplierSearch" placeholder="Επωνυμία ή ΑΦΜ"></label><label>Σωστός προμηθευτής<select name="supplierId" required style="display:block;width:100%;min-height:48px;font-size:18px"><option value="">Επίλεξε βάσει πρωτοτύπου και ΑΦΜ</option>${suppliers.filter(s=>s.id!==order.supplierId&&/^\d{9}$/.test(String(s.taxId||'').trim())).map(s=>`<option value="${esc(s.id)}">${esc(s.name)} · ΑΦΜ ${esc(s.taxId)}</option>`).join('')}</select></label>${lookupButton}${officialLookup?'<button type="button" data-official-supplier>Έλεγχος ΑΦΜ στην ΑΑΔΕ</button><p data-official-supplier-result role="status"></p>':""}${issuerForm}<button type="button" data-preview>Έλεγχος διόρθωσης</button><div data-preview-result style="display:grid;gap:14px"></div><p role="alert" tabindex="-1"></p><p data-save-status role="status"></p><button type="button" data-po-close>Άκυρο</button><button type="submit" class="primary" disabled>Αποθήκευση διόρθωσης προμηθευτή</button></form>`);
 const form=m.querySelector('[data-supplier-correction]'),select=form.elements.supplierId,previewButton=form.querySelector('[data-preview]'),host=form.querySelector('[data-preview-result]'),submit=form.querySelector('[type=submit]'),error=form.querySelector('[role=alert]');
 let preview=null,busy=false,generation=0;
 const alive=()=>valid()&&m.isConnected;
 const status=form.querySelector('[data-save-status]');
 let issuerSelected=false;
 const update=()=>{
  let message='';
  if(busy)message='Η ενέργεια εκτελείται…';
  else if(!select.value)message='Επίλεξε τον σωστό προμηθευτή.';
  else if(!preview)message='Πάτησε «Έλεγχος διόρθωσης» πριν την αποθήκευση.';
  else if(!form.elements.original?.checked)message='Επιβεβαίωσε ότι έλεγξες το πρωτότυπο.';
  else if(preview.payment&&!form.elements.payment?.checked)message='Επιβεβαίωσε χωριστά τη σύνδεση της υπάρχουσας πληρωμής.';
  else if((form.elements.reason?.value.trim().length??0)>500)message='Η αιτιολογία μπορεί να έχει έως 500 χαρακτήρες.';
  else if((form.elements.reason?.value.trim().length??0)<5)message='Συμπλήρωσε αιτιολογία με τουλάχιστον 5 χαρακτήρες.';
  submit.disabled=Boolean(message);
  status.textContent=message||(issuerSelected?'Ο προμηθευτής επιλέχθηκε. Πάτησε «Αποθήκευση διόρθωσης προμηθευτή».':'');
 };
 const showError=e=>{error.textContent=e.message;error.focus()};
 update();
 const invalidate=()=>{generation++;preview=null;host.innerHTML='';error.textContent='';update()};
 select.addEventListener('change',()=>{issuerSelected=false;invalidate()});
 const search=form.elements.supplierSearch;
 const fold=value=>String(value||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('el').trim();
 search.addEventListener('input',()=>{
  const query=fold(search.value);
  for(const option of select.options)option.hidden=Boolean(option.value&&option.value!==select.value&&!fold(option.textContent).includes(query));
 });

 form.addEventListener('input',update);form.addEventListener('change',update);
 m.addEventListener('click',event=>{if(event.target===m||event.target.closest('[data-po-close]')){generation++;delete parent.dataset.supplierCorrectionBusy}},{capture:true});
 const createButton=form.querySelector('[data-create-mydata-supplier]');
 const findButton=form.querySelector('[data-find-mydata-supplier]');
 const officialButton=form.querySelector('[data-official-supplier]'),officialResult=form.querySelector('[data-official-supplier-result]');
 let officialGeneration=0,officialPending=false;
 const targetVat=()=>select.value
  ? String(suppliers.find(s=>s.id===select.value)?.taxId||select.selectedOptions[0]?.dataset.taxId||'').replace(/\D/g,'')
  : issuerVat;
 const updateOfficial=()=>{if(officialButton)officialButton.disabled=officialPending||!/^\d{9}$/.test(targetVat())};
 select.addEventListener('change',()=>{
  officialGeneration++;
  if(officialResult)officialResult.textContent='';
  updateOfficial();
 });
 updateOfficial();
 officialButton?.addEventListener('click',async()=>{
  const taxId=targetVat();
  if(!alive()||officialButton.disabled||!/^\d{9}$/.test(taxId))return;
  const request=++officialGeneration;
  officialPending=true;
  updateOfficial();
  officialResult.textContent='Έλεγχος ΑΦΜ στην ΑΑΔΕ…';
  try{
   const result=await api(`/api/commerce/vat-lookup?storeId=${encodeURIComponent(order.storeId)}&taxId=${encodeURIComponent(taxId)}&official=1`);
   if(alive()&&request===officialGeneration)officialResult.textContent=[result.name,result.address].filter(Boolean).join(' · ');
  }catch(e){if(alive()&&request===officialGeneration)officialResult.textContent=e.message}
  finally{officialPending=false;if(alive())updateOfficial()}
 });
 async function resolveIssuer(createIfMissing){

  if(!alive()||busy)return;
  invalidate();busy=true;select.disabled=true;if(createButton)createButton.disabled=true;findButton.disabled=true;previewButton.disabled=true;
  let supplierId='';
  try{
   const lookup=existingIssuer?{existingSupplier:existingIssuer}:await api(`/api/commerce/vat-lookup?storeId=${encodeURIComponent(order.storeId)}&taxId=${issuerVat}&localOnly=1`);
   if(!alive())return;
   if(!lookup.existingSupplier&&!createIfMissing){
    if(createButton)createButton.closest('details').open=true;
    throw new Error('Δεν βρέθηκε καταχωρισμένος προμηθευτής με αυτό το ΑΦΜ.');
   }
   const supplier=lookup.existingSupplier||await api(staff?`/api/commerce/purchase-orders/${encodeURIComponent(order.id)}/issuer-supplier`:'/api/commerce/suppliers',{method:'POST',body:JSON.stringify(staff?{storeId:order.storeId}:{name:issuerName,taxId:issuerVat})});
   if(!alive())return;
   if(!supplier?.id)throw new Error('Δεν βρέθηκε η καρτέλα προμηθευτή.');
   supplierId=supplier.id;
   if(!Array.from(select.options).some(option=>option.value===supplierId)){
    const option=select.ownerDocument.createElement('option');
    option.value=supplierId;option.dataset.taxId=issuerVat;option.textContent=`${supplier.name||issuerName} · ΑΦΜ ${issuerVat}`;
    select.appendChild(option);
   }
   select.value=supplierId;
   search.value='';
   for(const option of select.options)option.hidden=false;
   issuerSelected=true;
   officialGeneration++;
   if(officialResult)officialResult.textContent='';
   updateOfficial();
   if(createButton)createButton.closest('details').hidden=true;
  }catch(e){if(alive())showError(e)}
  finally{busy=false;if(alive()){select.disabled=false;if(createButton)createButton.disabled=false;findButton.disabled=false;previewButton.disabled=false;update()}}
  if(alive()&&supplierId)await loadPreview();
 }
 findButton?.addEventListener('click',()=>resolveIssuer(false));
 createButton?.addEventListener('click',()=>resolveIssuer(true));
 async function loadPreview(){
  if(!alive()||busy||!select.value)return;
  invalidate();const request=++generation,supplierId=select.value;previewButton.disabled=true;
  try{
   const p=await api(`/api/purchase-orders/${encodeURIComponent(order.id)}/supplier-correction-preview?storeId=${encodeURIComponent(order.storeId)}&supplierId=${encodeURIComponent(supplierId)}`);
   if(!alive()||request!==generation||supplierId!==select.value)return;
   preview=p;host.innerHTML=`<p><b>${esc(p.beforeSupplier?.name||'Χωρίς προμηθευτή')}</b> → <b>${esc(p.targetSupplier.name)} · ΑΦΜ ${esc(p.targetSupplier.taxId)}</b></p><p>Αξία τιμολογίου ${money(p.totalGross)}. Η κατάσταση της αγοράς και το απόθεμα διατηρούνται.</p>${p.payment?`<p>Υπάρχουσα πληρωμή ${money(p.payment.amount)}. Θα αλλάξει μόνο η σύνδεσή της στον σωστό προμηθευτή· ποσό, βάρδια και ημερομηνία διατηρούνται.</p><label><input name="payment" type="checkbox"> Επιβεβαιώνω ότι η ίδια αρχική πληρωμή αφορά τον σωστό προμηθευτή. Δεν γίνεται νέα χρέωση.</label>`:'<p>Δεν υπάρχει συνδεδεμένη πληρωμή. Δεν δημιουργείται πληρωμή.</p>'}<label><input name="original" type="checkbox"> Έλεγξα το πρωτότυπο, τον αριθμό τιμολογίου και το ΑΦΜ του σωστού προμηθευτή.</label><label>Αιτιολογία<textarea name="reason" minlength="5" maxlength="500" required style="display:block;width:100%;min-height:80px;font-size:18px"></textarea></label>`;update();
  }catch(e){if(alive()&&request===generation)showError(e)}finally{if(alive())previewButton.disabled=false}
 }
 previewButton.addEventListener('click',loadPreview);
 form.addEventListener('submit',async event=>{
  event.preventDefault();update();if(!alive()||submit.disabled||busy||!preview)return;
  busy=true;update();select.disabled=true;previewButton.disabled=true;error.textContent='';
  try{
   const result=await api(`/api/purchase-orders/${encodeURIComponent(order.id)}/supplier-correction`,{method:'POST',body:JSON.stringify({storeId:order.storeId,supplierId:select.value,version:preview.version,reason:form.elements.reason.value.trim(),confirmOriginal:form.elements.original.checked,confirmPaymentSupplier:Boolean(form.elements.payment?.checked)})});
   if(result?.ok!==true)throw new Error('Η αποθήκευση δεν επιβεβαιώθηκε. Έλεγξε ξανά τη διόρθωση.');
   if(!alive())return;m.remove();delete parent.dataset.supplierCorrectionBusy;await refresh();
  }catch(e){if(alive()){showError(e);preview=null;submit.disabled=true}}finally{busy=false;if(alive()){select.disabled=false;previewButton.disabled=false;update()}}
 });
 return m;
}
