export function installInvoiceLineTaxonomy({form,order,line,api,esc,enabled=true}) {
 const panel=document.createElement('fieldset');
 panel.className='po-line-taxonomy';
 panel.style.cssText='grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;border:1px solid #b8cfdf;border-radius:8px;padding:8px';
 panel.innerHTML='<legend>Στοιχεία είδους στο κατάστημα</legend>'+[['vatDepartmentId','Τμήμα ΦΠΑ'],['categoryId','Κατηγορία'],['subcategoryId','Υποκατηγορία']].map(([name,label])=>`<label>${label}<select name="${name}" disabled><option value="">Δεν έχει οριστεί</option></select></label>`).join('')+'<small data-taxonomy-status style="grid-column:1/-1" role="status"></small>';
 form.prepend(panel);
 const fields=Object.fromEntries(['vatDepartmentId','categoryId','subcategoryId'].map(k=>[k,panel.querySelector(`[name="${k}"]`)]));
 let revision=0,options={},dirty=false,ready=Promise.resolve();
 const status=panel.querySelector('[data-taxonomy-status]');
 const render=(name,rows,value)=>{fields[name].innerHTML='<option value="">Δεν έχει οριστεί</option>'+rows.map(row=>`<option value="${esc(row.id)}">${esc(row.description||row.name)}</option>`).join('');fields[name].value=value||'';fields[name].disabled=!enabled;};
 const subs=value=>render('subcategoryId',(options.subcategories||[]).filter(row=>row.categoryId===fields.categoryId.value),value);
 fields.categoryId.addEventListener('change',()=>{dirty=true;subs('')});
 fields.subcategoryId.addEventListener('change',()=>dirty=true);
 fields.vatDepartmentId.addEventListener('change',()=>dirty=true);
 function selectProduct(productId){
  const current=++revision;dirty=false;Object.values(fields).forEach(field=>field.disabled=true);status.textContent='Φόρτωση στοιχείων είδους…';
  ready=(async()=>{try{
   const data=await api(`/api/commerce/purchase-orders/${encodeURIComponent(order.id)}/ocr-lines/${encodeURIComponent(line.id)}/options?${new URLSearchParams({storeId:order.storeId,productId:productId||''})}`);
   if(current!==revision||!form.isConnected)return;
   options=data;const selected=data.product||{};
   render('vatDepartmentId',data.vatDepartments||[],selected.vatDepartmentId);
   render('categoryId',data.categories||[],selected.categoryId);subs(selected.subcategoryId);
   status.textContent=enabled?'Αποθηκεύονται μόνο με την Καταχώρηση.':'Η αλλαγή αυτών των στοιχείων απαιτεί διαχειριστή.';
  }catch(error){if(current===revision&&form.isConnected)status.textContent=`Δεν φορτώθηκαν τα στοιχεία: ${error.message}`;}})();
  return ready;
 }
 selectProduct(line.productId);
 return {selectProduct,async values(){await ready;if(!enabled||!dirty)return undefined;return Object.fromEntries(Object.entries(fields).map(([key,field])=>[key,field.value||null]));}};
}
