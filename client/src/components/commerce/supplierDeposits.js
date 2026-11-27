import {greeceDateInput} from "../../../../shared/greece-time.mjs";

const kinds={CRATE:"Κιβώτια",BOTTLE:"Φιάλες",PALLET:"Παλέτες"};

export function showSupplierDeposits({modal,api,esc,money,stores,storeId,canWrite}){
 const box=modal(`<div class="po-modal-title blue"><h2>Επιστροφές εγγυοδοσίας</h2><button type="button" data-po-close aria-label="Κλείσιμο">×</button></div>
  <div class="po-filter"><label>Κατάστημα <select data-deposit-store><option value="">Επίλεξε κατάστημα</option>${stores.map(s=>`<option value="${esc(s.id)}"${s.id===storeId?" selected":""}>${esc(s.name)}</option>`).join("")}</select></label>
  <label>Προμηθευτής <select data-deposit-supplier><option value="">Όλοι</option></select></label>
  <p data-deposit-status role="status"></p><div data-deposit-body></div></div>`);
 const store=box.querySelector("[data-deposit-store]");
 const supplier=box.querySelector("[data-deposit-supplier]");
 const body=box.querySelector("[data-deposit-body]");
 const status=box.querySelector("[data-deposit-status]");
 const endpoint="/api/supplier-deposits";
 let generation=0,loading=false,writing=false,data=null;
 const options=docs=>docs.map(d=>`<option value="${esc(d.id)}">${esc(d.documentNumber||"Χωρίς αριθμό")} · ${esc(d.supplier)} · ${esc(d.documentDate?greeceDateInput(d.documentDate):"Χωρίς ημερομηνία")}</option>`).join("");
 function draw(){
  if(!data)return;
  const selected=supplier.value;
  const purchases=data.documents.filter(d=>d.documentType==="INVOICE"&&(!selected||d.supplierId===selected));
  const rows=data.rows.filter(d=>!selected||d.supplierId===selected);
  const form=canWrite?`<details><summary>Νέα εγγυοδοσία</summary><form class="po-form" data-deposit-action="">
    <label>Παραστατικό αγοράς<select name="documentId" required><option value="">Επίλεξε εγκεκριμένο παραστατικό</option>${options(purchases)}</select></label>
    <label>Συσκευασία<select name="kind">${Object.entries(kinds).map(([key,label])=>`<option value="${key}">${label}</option>`).join("")}</select></label>
    <label>Περιγραφή<input name="label" required maxlength="120"></label>
    <label>Ποσότητα<input type="number" name="quantity" required min="1" max="100000"></label>
    <label>Εγγύηση ανά μονάδα (€)<input type="number" name="unit" step="0.01" required min="0.01" max="1000"></label>
    <label>Προθεσμία επιστροφής<input type="date" name="dueDate"></label>
    <button type="submit" class="primary">Καταχώριση εγγυοδοσίας</button>
  </form></details>`:"";
  const listing=rows.map(d=>{
   const outstanding=d.quantity-d.returned,pending=d.returned-d.credited;
   const late=d.dueDate&&d.dueDate<greeceDateInput()&&outstanding>0;
   const active=d.sourceStatus==="APPROVED";
   const credits=data.documents.filter(c=>c.documentType==="CREDIT_NOTE"&&c.supplierId===d.supplierId);
   return `<details><summary><strong>${esc(d.supplier)} · ${esc(d.label)}</strong> · ${esc(kinds[d.kind])} · ${esc(d.documentNumber||"Χωρίς αριθμό")}
    <br>Προς επιστροφή: <b>${outstanding}</b> (${money(outstanding*d.unitCents/100)}) · Αναμονή πιστωτικού: <b>${pending}</b> (${money(pending*d.unitCents/100)}) · Πιστώθηκαν: ${d.credited}
    ${d.dueDate?` · Προθεσμία: ${esc(d.dueDate)}`:""}${late?" · Εκπρόθεσμη επιστροφή":""}${active?"":" · Το αρχικό παραστατικό χρειάζεται έλεγχο"}</summary>
    ${d.history.length?`<ul>${d.history.map(a=>`<li>${a.kind==="RETURN"?"Επιστροφή":"Πιστωτικό"} · ${esc(a.reference||"—")} · ${a.quantity} · ${esc(greeceDateInput(a.date))}${a.kind==="CREDIT"&&a.status!=="APPROVED"?" · Χρειάζεται έλεγχο":""}</li>`).join("")}</ul>`:""}
    ${canWrite&&active&&outstanding>0?`<form class="po-form" data-deposit-action="/${esc(d.id)}/RETURN"><label>Ποσότητα επιστροφής<input type="number" name="quantity" required min="1" max="${outstanding}"></label><label>Αναφορά επιστροφής<input name="reference" required maxlength="160"></label><button type="submit">Καταγραφή επιστροφής</button></form>`:""}
    ${canWrite&&active&&pending>0?`<form class="po-form" data-deposit-action="/${esc(d.id)}/CREDIT"><label>Εγκεκριμένο πιστωτικό<select name="reference" required><option value="">Επίλεξε πιστωτικό</option>${options(credits)}</select></label><label>Ποσότητα που πιστώθηκε<input type="number" name="quantity" required min="1" max="${pending}"></label><button type="submit">Σύνδεση πιστωτικού</button></form>`:""}</details>`;
  }).join("");
  body.innerHTML=`${form}<div class="po-filter">${listing||"<p>Δεν έχουν καταχωριστεί εγγυοδοσίες για αυτή την επιλογή.</p>"}</div>`;
 }
 async function refresh(){
  const request=++generation,picked=store.value,identity=supplier.value;
  data=null;
  body.replaceChildren();
  supplier.innerHTML='<option value="">Όλοι</option>';
  if(!picked){loading=false;status.textContent="Επίλεξε κατάστημα.";return}
  loading=true;status.textContent="Φόρτωση εγγυοδοσιών…";
  try{
   const next=await api(`${endpoint}?storeId=${encodeURIComponent(picked)}`);
   if(!box.isConnected||request!==generation)return;
   data=next;
   const suppliers=new Map([...next.documents,...next.rows].map(d=>[d.supplierId,d.supplier]));
   for(const [value,label] of [...suppliers].sort((a,b)=>a[1].localeCompare(b[1],"el")))supplier.add(new Option(label,value));
   if(suppliers.has(identity))supplier.value=identity;
   status.textContent="";
   draw();
  }catch(e){if(request===generation)status.textContent=e.message}
  finally{if(request===generation)loading=false}
 }
 store.addEventListener("change",refresh);
 supplier.addEventListener("change",draw);
 box.addEventListener("submit",async event=>{
  const form=event.target;
  if(!form.matches("[data-deposit-action]"))return;
  event.preventDefault();
  if(!canWrite||loading||writing||!store.value)return;
  const fields=Object.fromEntries(new FormData(form));
  const path=form.dataset.depositAction;
  const input=path?{reference:fields.reference}:{documentId:fields.documentId,kind:fields.kind,label:fields.label,unitCents:Math.round(Number(fields.unit)*100),dueDate:fields.dueDate||null};
  writing=true;
  store.disabled=supplier.disabled=true;
  const submit=form.querySelector("button[type=submit]");
  submit.disabled=true;
  try{
   await api(endpoint+path,{method:"POST",body:JSON.stringify({...input,storeId:store.value,quantity:Number(fields.quantity)})});
   if(box.isConnected)await refresh();
  }catch(e){if(box.isConnected)status.textContent=e.message}
  finally{writing=false;store.disabled=supplier.disabled=submit.disabled=false}
 });
 refresh();
}
