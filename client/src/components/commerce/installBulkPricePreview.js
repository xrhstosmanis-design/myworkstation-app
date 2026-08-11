const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
const euro=value=>value===null||value===undefined?"—":Number(value).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const installedKey="__mwsBulkPricePreviewInstalled";

async function api(path,options={}){
  const token=localStorage.getItem("token");
  const response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(data.error||`Σφάλμα ${response.status}`);error.code=data.code;error.data=data;throw error}
  return data;
}
function isBulkForm(form){return Boolean(form?.matches?.("form.op-box.op-form")&&[...form.querySelectorAll("h3")].some(h=>h.textContent.includes("Μαζική αλλαγή τιμών")))}
function textNodeValue(element){return [...(element?.childNodes||[])].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join(" ").trim()}
function selectionFromForm(form){
  const fields=form.querySelectorAll("fieldset");
  if(fields.length<2)throw new Error("Δεν βρέθηκαν οι επιλογές προϊόντων και καταστημάτων.");
  const productRefs=[...fields[0].querySelectorAll("label.check")].filter(label=>label.querySelector('input[type="checkbox"]')?.checked).map(label=>{const span=label.querySelector("span"),name=textNodeValue(span)||textNodeValue(label),small=span?.querySelector("small")?.textContent||"",sku=String(small.split("·")[0]||"").trim();return {name,sku:sku&&sku!=="—"?sku:null}}).filter(row=>row.name);
  const storeNames=[...fields[1].querySelectorAll("label.check")].filter(label=>label.querySelector('input[type="checkbox"]')?.checked).map(label=>textNodeValue(label)||label.textContent.trim()).filter(Boolean);
  const mode=form.querySelector(".op-two select")?.value||"SET",value=Number(form.elements.value?.value||0);
  if(!productRefs.length||!storeNames.length)throw new Error("Επίλεξε τουλάχιστον ένα προϊόν και ένα κατάστημα.");
  if(!Number.isFinite(value)||value<0)throw new Error("Η τιμή ή το ποσοστό δεν είναι έγκυρο.");
  return {productRefs,storeNames,mode,value};
}
function statusLabel(status){return ({CHANGE:"Αλλαγή",CHANGE_INACTIVE:"Αλλαγή · ανενεργό",UNCHANGED:"Χωρίς αλλαγή",NOT_IN_STORE:"Δεν υπάρχει στο κατάστημα"})[status]||status}
function modeLabel(mode){return ({SET:"Ορισμός τιμής",INCREASE_PERCENT:"Αύξηση %",DECREASE_PERCENT:"Μείωση %"})[mode]||mode}
function overlayShell(){const overlay=document.createElement("div");overlay.className="bulk-price-preview-overlay";overlay.innerHTML=`<section class="bulk-price-preview-modal"><header><div><small>PRE-KAT · ΜΑΖΙΚΕΣ ΤΙΜΕΣ</small><h2>Προεπισκόπηση αλλαγών</h2></div><button type="button" data-bpp-close>✕</button></header><div data-bpp-body><div class="bpp-loading">Υπολογισμός πραγματικών τιμών…</div></div></section>`;document.body.appendChild(overlay);overlay.addEventListener("click",event=>{if(event.target===overlay||event.target.closest("[data-bpp-close]"))overlay.remove()});return overlay}
function rowHtml(row){return `<div class="bpp-row ${String(row.status||"").toLowerCase()}"><span><b>${esc(row.productName)}</b><small>${esc(row.sku||"—")}</small></span><span>${esc(row.storeName)}</span><span>${euro(row.oldPrice)}</span><strong>${euro(row.newPrice)}</strong><span>${esc(statusLabel(row.status))}</span></div>`}
async function showPreview(form,payload){
  const overlay=overlayShell(),body=overlay.querySelector("[data-bpp-body]");
  try{
    const preview=await api("/api/owner-products/prices/bulk/preview",{method:"POST",body:JSON.stringify(payload)}),c=preview.counts||{},skipped=Number(c.skipped||0);
    body.innerHTML=`<div class="bpp-meta"><span><small>Ενέργεια</small><b>${esc(modeLabel(payload.mode))}</b></span><span><small>Τιμή / ποσοστό</small><b>${esc(payload.value)}</b></span><span><small>Συνδυασμοί</small><b>${c.total||0}</b></span><span class="change"><small>Θα αλλάξουν</small><b>${c.changed||0}</b></span><span><small>Χωρίς αλλαγή</small><b>${c.unchanged||0}</b></span><span class="skip"><small>Δεν υπάρχουν στο κατάστημα</small><b>${skipped}</b></span></div>${c.inactive?`<div class="bpp-note">${c.inactive} αλλαγές αφορούν ήδη ανενεργές αντιστοιχίσεις. Η τιμή θα ενημερωθεί αλλά το προϊόν θα παραμείνει ανενεργό.</div>`:""}${skipped?`<label class="bpp-accept"><input type="checkbox" data-bpp-accept> Αποδέχομαι ότι <b>${skipped}</b> συνδυασμοί όπου το προϊόν δεν υπάρχει στο κατάστημα θα παραλειφθούν. Δεν θα ενεργοποιηθεί προϊόν σιωπηλά.</label>`:""}<div class="bpp-table"><div class="bpp-head"><span>Προϊόν</span><span>Κατάστημα</span><span>Παλιά</span><span>Νέα</span><span>Κατάσταση</span></div>${(preview.rows||[]).map(rowHtml).join("")||'<div class="bpp-empty">Δεν υπάρχει αλλαγή για εφαρμογή.</div>'}</div>${preview.sampleTruncated?'<div class="bpp-note">Η λίστα δείχνει τις πρώτες 500 γραμμές. Η τελική εφαρμογή χρησιμοποιεί ολόκληρη την ελεγμένη προεπισκόπηση.</div>':""}<footer><button type="button" class="secondary" data-bpp-close>Κλείσιμο</button><button type="button" class="primary" data-bpp-commit ${preview.canCommit?"":"disabled"}>Τελική εφαρμογή ${c.changed||0} αλλαγών</button></footer>`;
    body.querySelector("[data-bpp-commit]")?.addEventListener("click",async()=>{
      const acceptSkipped=Boolean(body.querySelector("[data-bpp-accept]")?.checked);if(skipped&&!acceptSkipped)return alert("Επιβεβαίωσε ότι αποδέχεσαι τους συνδυασμούς που θα παραλειφθούν.");
      if(!confirm(`Να εφαρμοστούν οριστικά ${c.changed||0} αλλαγές τιμής;`))return;
      const button=body.querySelector("[data-bpp-commit]");button.disabled=true;button.textContent="Εφαρμογή…";
      try{const result=await api("/api/owner-products/prices/bulk/commit",{method:"POST",body:JSON.stringify({...payload,previewHash:preview.previewHash,confirm:true,acceptSkipped})});overlay.remove();alert(`Ολοκληρώθηκε η μαζική αλλαγή. Αλλάχθηκαν ${result.changed} τιμές · χωρίς αλλαγή ${result.unchanged} · παραλείφθηκαν ${result.skipped}.`);form.reset();form.querySelectorAll('input[type="checkbox"]').forEach(input=>{if(!input.defaultChecked)input.checked=false})}catch(error){alert(error.message);button.disabled=false;button.textContent=`Τελική εφαρμογή ${c.changed||0} αλλαγών`}
    });
  }catch(error){body.innerHTML=`<div class="bpp-error"><b>Η προεπισκόπηση δεν ολοκληρώθηκε.</b><span>${esc(error.message)}</span>${error.data?.resolutionErrors?.length?`<ul>${error.data.resolutionErrors.slice(0,20).map(row=>`<li>${esc(row.name||row.sku||"Επιλογή")}: ${esc(row.error)}</li>`).join("")}</ul>`:""}</div><footer><button type="button" class="secondary" data-bpp-close>Κλείσιμο</button></footer>`}
}
async function onSubmit(event){const form=event.target;if(!isBulkForm(form))return;event.preventDefault();event.stopImmediatePropagation();try{await showPreview(form,selectionFromForm(form))}catch(error){alert(error.message)}}
function enhance(){const form=[...document.querySelectorAll("form.op-box.op-form")].find(isBulkForm);if(!form)return;const button=form.querySelector('button[type="submit"],button.primary');if(button&&!button.dataset.bppLabel){button.dataset.bppLabel="1";button.textContent=button.textContent.replace(/^Εφαρμογή/,"Προεπισκόπηση")}}
export function installBulkPricePreview(){
  if(!window[installedKey]){window[installedKey]=true;document.addEventListener("submit",onSubmit,true);document.addEventListener("click",event=>{if(event.target.closest?.("button"))setTimeout(enhance,0)},true)}
  enhance();
}
