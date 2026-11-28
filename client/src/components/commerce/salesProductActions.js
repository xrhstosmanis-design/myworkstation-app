const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>value==null?'Μη διαθέσιμο':Number(value).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
const cell=value=>value==null||value===''?'Δεν έχει οριστεί':escape(value);
const mounted=new WeakSet();

// Only existing authorized GET APIs are used. Product IDs come from actual rows.
export function installSalesProductActions(root,getContext,read){
 if(mounted.has(root))return;mounted.add(root);
 const doc=root.ownerDocument,win=doc.defaultView;
 if(!doc.getElementById('sas-product-actions-style')){
  const style=doc.createElement('style');style.id='sas-product-actions-style';
  style.textContent='.sas-product-menu{position:fixed;z-index:2147483646;background:white;border:1px solid #aac0d5;border-radius:9px;padding:6px;box-shadow:0 8px 35px #1235;max-width:95vw}.sas-product-menu button{display:block;width:100%;padding:10px;text-align:left;background:white;border:0;color:#143c5d;cursor:pointer}.sas-product-menu button:focus,.sas-product-menu button:hover{background:#eef6ff}.sas-product-backdrop{position:fixed;inset:0;z-index:2147483647;background:#1238;display:grid;place-items:center;padding:16px}.sas-product-dialog{background:white;color:#17324b;border-radius:12px;max-height:90vh;width:min(1050px,96vw);overflow:auto;padding:20px}.sas-product-dialog header{display:flex;justify-content:space-between;gap:12px}.sas-product-dialog table{border-collapse:collapse;width:100%}.sas-product-dialog th,.sas-product-dialog td{padding:8px;border:1px solid #cad8e5;text-align:left}.sas-product-dialog .sas-history{overflow:auto}.sas-product-dialog dl{display:grid;grid-template-columns:auto 1fr;gap:10px}.sas-product-dialog button{padding:8px 12px;cursor:pointer}.sas-product-dialog [role=alert]{color:#b42318}@media print{.sas-product-menu,.sas-product-backdrop{display:none!important}}';doc.head.append(style);
 }
 let menu=null,dialog=null,watch=null,operation=0,target=null;
 const snapshot=()=>JSON.stringify(getContext());
 const current=scope=>root.isConnected&&root.style.display!=='none'&&getContext().valid&&snapshot()===scope;
 const closeMenu=()=>{menu?.remove();menu=null;if(watch&&!dialog){win.clearInterval(watch);watch=null}};
 const close=()=>{++operation;closeMenu();dialog?.remove();dialog=null;if(watch)win.clearInterval(watch);watch=null};
 const observe=scope=>{if(watch)win.clearInterval(watch);watch=win.setInterval(()=>{if(!current(scope))close()},250)};
 const present=(title,body,scope)=>{
  dialog?.remove();dialog=doc.createElement('div');dialog.className='sas-product-backdrop';
  dialog.innerHTML=`<section class="sas-product-dialog" role="dialog" aria-modal="true" aria-label="${escape(title)}"><header><h2>${escape(title)}</h2><button type="button" data-sas-close aria-label="Κλείσιμο">×</button></header>${body}</section>`;
  doc.body.append(dialog);dialog.querySelector('[data-sas-close]').onclick=()=>{close();target?.isConnected&&target.focus()};
  dialog.querySelector('[data-sas-close]').focus();observe(scope);
 };
 async function open(kind,element,scope){
  const context=getContext(),id=element.dataset.productId;
  if(!id||!current(scope))return;closeMenu();const request=++operation;
  present(kind==='card'?'Καρτέλα είδους':'Αγορές είδους','<p>Φόρτωση…</p>',scope);
  const active=()=>request===operation&&current(scope)&&dialog?.isConnected;
  try{
   const params=new URLSearchParams({storeId:context.storeId,from:context.from,to:context.to});
   if(kind==='card'){
    params.set('productId',id);
    const rows=await read(`/api/owner-products/catalog?${params}`,context.token);
    if(!active())return;
    const product=Array.isArray(rows)?rows.find(p=>p.id===id):null,store=product?.stores?.find(s=>s.storeId===context.storeId);
    if(!product||!store)throw Error('Δεν βρέθηκε η καρτέλα στο επιλεγμένο κατάστημα.');
    const fields=[['Περιγραφή',cell(product.name)],['Κωδικός',cell(product.sku)],['Κατηγορία',cell(product.categoryName)],['Υποκατηγορία',cell(product.subcategoryName)],['Εταιρεία',cell(product.productCompanyName)],['Μονάδα μέτρησης',cell(product.unit)],['Τρέχουσα λιανική καταστήματος',money(store.salePrice??product.salePrice)],['Απόθεμα καταστήματος',cell(store.currentStock)],['ΦΠΑ',product.vatRate==null?'Μη διαθέσιμο':escape(product.vatRate)+'%'],['Κόστος καρτέλας',money(product.costPrice)]];
    present('Καρτέλα είδους',`<p>Στοιχεία καρτέλας · επιλεγμένο κατάστημα: ${cell(store.storeName||context.storeId)}</p><dl>${fields.map(([label,value])=>`<dt>${label}</dt><dd>${value}</dd>`).join('')}</dl><h3>Barcodes</h3><ul>${(product.barcodes||[]).map(b=>`<li>${cell(b.barcode)} · ${cell(b.unitMultiplier)} ${cell(product.unit)}</li>`).join('')||'<li>Δεν έχουν οριστεί.</li>'}</ul>`,scope);
   }else{
    const data=await read(`/api/owner-products/${encodeURIComponent(id)}/purchases?${params}`,context.token);
    if(!active())return;
    if(data.product?.id!==id)throw Error('Η αντιστοίχιση του είδους άλλαξε. Άνοιξε ξανά τη γραμμή.');
    const rows=data.purchases||[];
    present('Αγορές είδους',`<p><strong>${cell(data.product.name)}</strong> · ${escape(context.from)} έως ${escape(context.to)} · επιλεγμένο κατάστημα</p><p>Έως 1.000 εγγραφές του υπάρχοντος ιστορικού αγορών. Οι ποσότητες αφορούν τη μονάδα της καταγεγραμμένης αγοράς.</p><div class="sas-history"><table><thead><tr>${['Ημερομηνία','Προμηθευτής','Τιμολόγιο','Κατάσταση','Ποσότητα','Καθαρή τιμή μονάδας','Καθαρή αξία','Σύνολο με ΦΠΑ'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr><td>${cell(new Date(r.invoicedAt||r.createdAt).toLocaleString('el-GR',{timeZone:'Europe/Athens',hour12:false}))}</td><td>${cell(r.supplierName)}</td><td>${cell(r.invoiceNumber)}</td><td>${cell(r.status)}</td><td>${cell(r.quantity)}</td><td>${money(r.unitCost)}</td><td>${money(r.netAmount)}</td><td>${money(r.grossAmount)}</td></tr>`).join('')||'<tr><td colspan="8">Δεν υπάρχουν καταγεγραμμένες αγορές στο διάστημα.</td></tr>'}</tbody></table></div>`,scope);
   }
  }catch(error){if(active())present(kind==='card'?'Καρτέλα είδους':'Αγορές είδους',`<p role="alert">${escape(error.message||'Αποτυχία φόρτωσης.')}</p>`,scope)}
 }
 function show(event,element){
  if(!element?.dataset.productId||!getContext().storeId||!getContext().valid)return;
  event.preventDefault();close();target=element;const scope=snapshot();
  menu=doc.createElement('div');menu.className='sas-product-menu';menu.setAttribute('role','menu');
  menu.innerHTML='<button type="button" role="menuitem" data-kind="card">Καρτέλα είδους</button><button type="button" role="menuitem" data-kind="purchases">Αγορές είδους</button>';
  const rect=element.getBoundingClientRect();menu.style.left=Math.max(4,Math.min(event.clientX||rect.left,win.innerWidth-240))+'px';menu.style.top=Math.max(4,Math.min(event.clientY||rect.bottom,win.innerHeight-110))+'px';
  menu.onclick=e=>{const button=e.target.closest('[data-kind]');if(button&&current(scope))open(button.dataset.kind,element,scope)};
  doc.body.append(menu);menu.querySelector('button').focus();observe(scope);
 }
 root.addEventListener('contextmenu',event=>show(event,event.target.closest('[data-product-id]')));
 root.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey)show(event,event.target.closest('[data-product-id]'))});
 root.addEventListener('sas:scope-change',close);
 const outside=event=>{if(menu&&!menu.contains(event.target))closeMenu()};
 const key=event=>{
  if(event.key==='Escape'&&(menu||dialog)){close();target?.isConnected&&target.focus()}
  if(event.key==='Tab'&&dialog){const button=dialog.querySelector('button');event.preventDefault();button?.focus()}
  if(menu&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();const buttons=[...menu.querySelectorAll('button')],index=buttons.indexOf(doc.activeElement);buttons[(index+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length].focus()}
 };
 doc.addEventListener('pointerdown',outside,true);doc.addEventListener('keydown',key);
 const cleanup=new win.MutationObserver(()=>{if(!root.isConnected){close();cleanup.disconnect();doc.removeEventListener('pointerdown',outside,true);doc.removeEventListener('keydown',key)}});cleanup.observe(doc.documentElement,{childList:true,subtree:true});
}
