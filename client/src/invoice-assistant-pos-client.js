const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));
const number=value=>Number(String(value??"").replace(",","."));
const euro=value=>Number(value||0).toLocaleString("el-GR",{minimumFractionDigits:2,maximumFractionDigits:2});
const labels={description:"Περιγραφή",quantity:"Ποσότητα τιμολογίου",unitCost:"Τιμή μονάδας",invoiceUnit:"Μονάδα τιμολογίου",stockUnitsPerInvoiceUnit:"Τεμάχια ανά συσκευασία",discount1:"Έκπτωση 1",discount2:"Έκπτωση 2",discount3:"Έκπτωση 3",exciseTotal:"ΕΦΚ",vatRate:"ΦΠΑ %"};
const api=async(path,options={})=>{
  const token=localStorage.getItem("token");
  const response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{}),...(options.headers||{})}});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||`Σφάλμα ${response.status}`);
  return result;
};

export async function openPosInvoiceAssistant(orderId,order,onComplete){
  const overlay=document.createElement("div");
  overlay.style.cssText="position:fixed;inset:0;z-index:100100;background:#102c3cbb;padding:12px;display:grid;place-items:center";
  overlay.innerHTML=`<section role="dialog" aria-modal="true" aria-label="Βοηθός τιμολογίου POS" style="width:min(1480px,100%);height:min(92vh,950px);background:#f7fafc;border-radius:15px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px #0005">
    <header style="display:flex;justify-content:space-between;align-items:center;gap:12px;background:#143f61;color:white;padding:13px 18px"><div><b>Βοηθός τιμολογίου POS</b><small style="display:block">Πρόχειρο ${esc(order.invoiceNumber||"")} · ${esc(order.supplierName||"προμηθευτής")}</small></div><button data-close type="button" aria-label="Κλείσιμο" style="font-size:22px">×</button></header>
    <div style="display:grid;grid-template-columns:minmax(280px,42%) minmax(350px,1fr);min-height:0;flex:1">
      <div style="min-height:0;overflow:auto;padding:12px;background:#e9f0f5"><div data-pages></div></div>
      <div style="min-height:0;overflow:auto;padding:16px"><p style="margin:0 0 9px">Δες τις φωτογραφίες, πες τι θέλεις να διορθωθεί και έλεγξε τις προτάσεις πριν τις περάσεις στο πρόχειρο.</p>
        <div data-current style="border:1px solid #d4e1e8;background:white;border-radius:10px;padding:9px;max-height:26vh;overflow:auto"></div>
        <label style="display:block;margin-top:12px;font-weight:700">Εντολή προς τον βοηθό<textarea data-message rows="3" style="box-sizing:border-box;width:100%;margin-top:5px;padding:10px;border:1px solid #a7bdc9;border-radius:8px" placeholder="π.χ. Οι γραμμές 1–3 είναι σε γραμμάρια και η 4 είναι 48 πακέτα × 100 τεμάχια"></textarea></label>
        <button data-ask type="button" style="margin-top:8px;padding:10px 15px;background:#075c8d;color:white;border:0;border-radius:7px;font-weight:800">Έλεγχος φωτογραφιών</button>
        <p data-status role="status" style="min-height:24px;color:#284d64"></p><div data-answer></div><div data-proposals></div>
        <button data-apply type="button" hidden style="margin-top:12px;padding:11px 15px;background:#087762;color:white;border:0;border-radius:8px;font-weight:800">Εφαρμογή επιλεγμένων στο πρόχειρο</button>
      </div>
    </div>
  </section>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.remove(),status=overlay.querySelector("[data-status]"),pages=overlay.querySelector("[data-pages]"),current=overlay.querySelector("[data-current]"),proposals=overlay.querySelector("[data-proposals]"),apply=overlay.querySelector("[data-apply]");
  overlay.querySelector("[data-close]").onclick=close;
  const lineById=new Map();
  let source;
  try{
    const [result,detail]=await Promise.all([
      api(`/api/commerce/purchase-orders/${encodeURIComponent(orderId)}/invoice-assistant/source`),
      api(`/api/purchase-orders/${encodeURIComponent(orderId)}/detail`)
    ]);
    source=result;
    detail.lines.forEach(line=>lineById.set(line.id,line));
    pages.innerHTML=result.pages.map(page=>`<article style="margin-bottom:13px;background:white;padding:9px;border-radius:10px"><b>Σελίδα ${page.index}: ${esc(page.filename||"φωτογραφία")}</b><div style="overflow:auto;max-height:75vh;margin-top:8px">${page.mimeType==="application/pdf"?`<iframe title="Σελίδα ${page.index}" src="${esc(page.dataUrl)}" style="width:100%;height:70vh;border:0"></iframe>`:`<img src="${esc(page.dataUrl)}" alt="Σελίδα ${page.index}" style="display:block;width:100%;transform-origin:top left" data-zoom-image>`}</div></article>`).join("");
    pages.querySelectorAll("[data-zoom-image]").forEach(img=>{let zoom=1;img.addEventListener("wheel",event=>{event.preventDefault();zoom=Math.min(4,Math.max(0.75,zoom+(event.deltaY<0?0.15:-0.15)));img.style.width=`${zoom*100}%`},{passive:false})});
    current.innerHTML=`<b>Γραμμές που έχει τώρα το POS · ${detail.lines.length} · ${euro(detail.totals.gross)} €</b><div style="margin-top:7px">${detail.lines.map((line,index)=>`<div style="border-top:1px solid #e2ebef;padding:5px 0"><b>${index+1}. ${esc(line.description)}</b> · ${esc(line.quantity)} × ${esc(line.unitCost)} · ΕΦΚ ${euro(line.exciseTotal)} · ${euro(line.grossAmount)} €</div>`).join("")}</div>`;
    status.textContent=`Τυπωμένο πληρωτέο: ${euro(result.document.totalGross)} €. Επίλεξε τι θα ελέγξει ο βοηθός.`;
  }catch(error){status.textContent=error.message;overlay.querySelector("[data-ask]").disabled=true;return}
  overlay.querySelector("[data-ask]").onclick=async()=>{
    const message=overlay.querySelector("[data-message]").value.trim();if(!message){status.textContent="Γράψε πρώτα τι θέλεις να ελέγξει.";return}
    const ask=overlay.querySelector("[data-ask]");ask.disabled=true;apply.hidden=true;proposals.replaceChildren();status.textContent="Ο βοηθός συγκρίνει τις φωτογραφίες με το πρόχειρο…";
    try{
      const result=await api(`/api/commerce/purchase-orders/${encodeURIComponent(orderId)}/invoice-assistant/preview`,{method:"POST",body:JSON.stringify({message})});
      overlay.querySelector("[data-answer]").textContent=result.assistantMessage||"Ο έλεγχος ολοκληρώθηκε.";
      const valid=result.corrections.filter(change=>lineById.has(change.lineId)&&labels[change.field]);
      proposals.innerHTML=valid.length?`<h3>Προτεινόμενες αλλαγές</h3><p>Επίλεξε μόνο όσα επιβεβαιώνεις στη φωτογραφία.</p>${valid.map((change,index)=>{const line=lineById.get(change.lineId);return `<label style="display:block;background:#fff9dc;border-left:4px solid #c48009;margin:6px 0;padding:9px"><input type="checkbox" data-change="${index}"> <b>${esc(line.description)} · ${esc(labels[change.field])}</b><br><small>Τώρα: ${esc(line[change.field]??"—")} → Πρόταση: ${esc(change.value)}</small><br><small>${esc(change.reason)}</small></label>`}).join("")}`:"Δεν βρέθηκαν ασφαλείς διορθώσεις. Έλεγξε τη φωτογραφία και τις γραμμές χειροκίνητα.";
      if(valid.length){apply.hidden=false;apply.onclick=async()=>{
        const chosen=[...proposals.querySelectorAll("[data-change]:checked")].map(node=>valid[Number(node.dataset.change)]);if(!chosen.length){status.textContent="Επίλεξε πρώτα τις αλλαγές που επιβεβαίωσες.";return}
        const grouped=new Map();for(const change of chosen){const patch=grouped.get(change.lineId)||{};patch[change.field]=change.field==="description"||change.field==="invoiceUnit"?change.value:number(change.value);grouped.set(change.lineId,patch)}
        apply.disabled=true;let done=0;try{for(const [lineId,patch] of grouped){await api(`/api/purchase-orders/${encodeURIComponent(orderId)}/lines/${encodeURIComponent(lineId)}`,{method:"PATCH",body:JSON.stringify(patch)});done++}status.textContent=`Αποθηκεύτηκαν ${done} γραμμές στο πρόχειρο. Έλεγξε ξανά τα σύνολα πριν από οποιαδήποτε οριστικοποίηση.`;apply.hidden=true;await onComplete?.()}catch(error){status.textContent=`Αποθηκεύτηκαν ${done} γραμμές. Η επόμενη αλλαγή απέτυχε: ${error.message}. Άνοιξε ξανά το τιμολόγιο για έλεγχο.`}finally{apply.disabled=false}
      }}
      status.textContent=`Έλεγχος ολοκληρώθηκε · ${valid.length} προτάσεις. Τυπωμένο πληρωτέο ${euro(source.document.totalGross)} €.`;
    }catch(error){status.textContent=error.message}finally{ask.disabled=false}
  };
}
