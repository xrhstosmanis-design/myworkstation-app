const allowed=()=>{try{return ["SUPER_ADMIN","OWNER","ADMIN","MANAGER"].includes(JSON.parse(localStorage.getItem("user")||"{}").role)}catch{return false}};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const money=v=>Number(v||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
let lastSupplierId="",bound=false;
async function api(path,options={}){const token=localStorage.getItem("token");const r=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||`Σφάλμα ${r.status}`);return data}
function modal(html){const w=document.createElement("div");w.className="sc-modal-overlay wide spt-overlay";w.innerHTML=`<section class="sc-modal spt-modal">${html}</section>`;document.body.appendChild(w);w.addEventListener("click",e=>{if(e.target===w||e.target.closest("[data-spt-close]"))w.remove()});return w}
function rememberFromEvent(event){const row=event.target?.closest?.("[data-supplier-row]");if(row?.dataset?.supplierRow)lastSupplierId=row.dataset.supplierRow}
function selectedIds(w){return [...w.querySelectorAll("[data-spt-item]:checked")].map(x=>x.value)}
function filterRows(w,value){const needle=String(value||"").trim().toLocaleLowerCase("el-GR");w.querySelectorAll("[data-spt-row]").forEach(row=>{row.hidden=!!needle&&!row.dataset.search.includes(needle)})}
async function openTransfer(sourceId){
  try{
    const data=await api(`/api/supplier-control/${encodeURIComponent(sourceId)}/transfer-candidates`);
    const w=modal(`<div class="sc-modal-title blue"><div><h2>Μεταφορά ειδών ή/και κωδικών</h2><b>Από: ${esc(data.source.name)}</b></div><button data-spt-close>×</button></div>
      <div class="spt-controls"><label>Προς προμηθευτή<select data-spt-target><option value="">Επιλογή προμηθευτή</option>${data.targets.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}${s.taxId?` · ${esc(s.taxId)}`:""}</option>`).join("")}</select></label><label>Τι θα μεταφερθεί<select data-spt-mode><option value="ITEMS_CODES">Είδη + κωδικοί</option><option value="ITEMS">Μόνο είδη</option><option value="CODES">Μόνο κωδικοί</option></select></label><label class="spt-search">Αναζήτηση είδους<input data-spt-search placeholder="Περιγραφή / SKU / Barcode / κωδικός"></label></div>
      <div class="spt-note"><b>Ασφαλής μεταφορά:</b> δεν αλλάζει κανένα παλιό τιμολόγιο ή ιστορική αγορά. Αλλάζει μόνο η τρέχουσα αντιστοίχιση προμηθευτή ↔ είδους/κωδικού. Το barcode παραμένει πάνω στο ίδιο προϊόν.</div>
      <div class="spt-toolbar"><label><input type="checkbox" data-spt-all> Επιλογή όλων</label><span data-spt-count>${data.items.length} διαθέσιμα είδη</span></div>
      <div class="spt-table"><div class="row head"><span></span><span>Περιγραφή</span><span>SKU</span><span>Κωδ. προμηθευτή</span><span>Barcode</span><span>Κατηγορία</span><span>Λιανική</span><span>Τρέχουσα σύνδεση</span></div>${data.items.map(item=>`<div class="row" data-spt-row data-search="${esc([item.name,item.sku,item.supplierCode,item.primaryBarcode,item.categoryName].filter(Boolean).join(" ").toLocaleLowerCase("el-GR"))}"><span><input type="checkbox" data-spt-item value="${esc(item.productId)}"></span><span><b>${esc(item.name)}</b></span><span>${esc(item.sku||"—")}</span><strong>${esc(item.supplierCode||"—")}</strong><span>${esc(item.primaryBarcode||"—")}</span><span>${esc(item.categoryName||"—")}</span><span>${money(item.salePrice)}</span><span>${item.linkActive===false?"Μεταφερμένο/ανενεργό":item.linkActive===true?"Ενεργή":"Από ιστορικό"}</span></div>`).join("")||'<div class="spt-empty">Δεν βρέθηκαν είδη συνδεδεμένα με τον προμηθευτή.</div>'}</div>
      <div class="spt-actions"><button data-spt-close>← Επιστροφή</button><span></span><button class="primary" data-spt-transfer>✓ Εκτέλεση μεταφοράς</button></div>`);
    const count=()=>{const n=selectedIds(w).length;w.querySelector("[data-spt-count]").textContent=`${n} επιλεγμένα από ${data.items.length}`};
    w.querySelector("[data-spt-all]")?.addEventListener("change",e=>{w.querySelectorAll("[data-spt-item]").forEach(x=>{if(!x.closest("[data-spt-row]").hidden)x.checked=e.target.checked});count()});
    w.querySelectorAll("[data-spt-item]").forEach(x=>x.addEventListener("change",count));
    w.querySelector("[data-spt-search]")?.addEventListener("input",e=>filterRows(w,e.target.value));
    w.querySelector("[data-spt-transfer]")?.addEventListener("click",async()=>{
      const target=w.querySelector("[data-spt-target]").value,mode=w.querySelector("[data-spt-mode]").value,productIds=selectedIds(w);
      if(!target)return alert("Επίλεξε προμηθευτή προορισμού.");if(!productIds.length)return alert("Επίλεξε τουλάχιστον ένα είδος.");
      const label={ITEMS_CODES:"είδη και κωδικούς",ITEMS:"είδη",CODES:"κωδικούς"}[mode];
      if(!confirm(`Να μεταφερθούν ${productIds.length} ${label} στον επιλεγμένο προμηθευτή;\n\nΤα ιστορικά παραστατικά δεν θα αλλάξουν.`))return;
      const button=w.querySelector("[data-spt-transfer]");button.disabled=true;button.textContent="Μεταφορά…";
      try{const result=await api(`/api/supplier-control/${encodeURIComponent(sourceId)}/transfer`,{method:"POST",body:JSON.stringify({toSupplierId:target,mode,productIds})});alert(result.message||"Η μεταφορά ολοκληρώθηκε.");w.remove();document.querySelector(".supplier-control-suite [data-sc-search]")?.click()}catch(error){alert(error.message);button.disabled=false;button.textContent="✓ Εκτέλεση μεταφοράς"}
    });
  }catch(error){alert(error.message)}
}
export function installSupplierProductTransfer(){
  if(bound||!allowed())return;bound=true;
  document.addEventListener("contextmenu",rememberFromEvent,true);
  document.addEventListener("pointerdown",event=>{if(event.pointerType==="touch")rememberFromEvent(event)},true);
  document.addEventListener("click",event=>{
    const button=event.target.closest?.(".sc-context [data-action='items']");if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();event.stopPropagation();
    const id=lastSupplierId;if(!id)return alert("Δεν προσδιορίστηκε ο προμηθευτής.");document.querySelector(".sc-context")?.remove();openTransfer(id);
  },true);
}
