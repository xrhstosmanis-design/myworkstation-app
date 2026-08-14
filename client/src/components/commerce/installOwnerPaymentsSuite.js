const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const number=value=>Number(value||0);
const pad=value=>String(value).padStart(2,"0");
const localDateValue=date=>`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
const todayValue=()=>localDateValue(new Date());
const monthStartValue=()=>{const d=new Date();return localDateValue(new Date(d.getFullYear(),d.getMonth(),1))};
const yearStartValue=()=>{const d=new Date();return `${d.getFullYear()}-01-01`};
const fmt=value=>value?new Date(value).toLocaleString("el-GR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));
const pct=value=>value===null||value===undefined?"—":`${Number(value).toLocaleString("el-GR",{minimumFractionDigits:2,maximumFractionDigits:2})}%`;
const state={from:monthStartValue(),to:todayValue(),storeId:"",supplierId:"",q:"",supplier:true,other:true,report:null,loading:false,error:"",tab:"overview"};
const canOpenOwnerPayments=()=>{try{return ["SUPER_ADMIN","OWNER","ADMIN","MANAGER"].includes(JSON.parse(localStorage.getItem("user")||"{}").role)}catch{return false}};

async function api(path){
  const token=localStorage.getItem("token");
  const response=await fetch(path,{headers:{...(token?{Authorization:`Bearer ${token}`}:{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);
  return data;
}
function queryType(){if(state.supplier&&state.other)return"ALL";if(state.supplier)return"SUPPLIER_PAYMENT";return"OTHER_EXPENSE"}
function qs(){
  const q=new URLSearchParams({from:new Date(`${state.from}T00:00:00`).toISOString(),to:new Date(`${state.to}T23:59:59.999`).toISOString(),type:queryType()});
  if(state.storeId)q.set("storeId",state.storeId);
  if(state.supplierId)q.set("supplierId",state.supplierId);
  if(state.q.trim())q.set("q",state.q.trim());
  return q;
}
function cards(report){
  const s=report?.summary||{};
  const delta=s.changePercent;
  return `<div class="owner-payments-cards">
    <article><small>Σύνολο εξόδων</small><strong>${money(s.totalExpenses)}</strong><span>${s.count||0} κινήσεις</span></article>
    <article><small>Πληρωμές προμηθευτών</small><strong>${money(s.supplierPayments)}</strong><span>${s.totalExpenses?pct(number(s.supplierPayments)/number(s.totalExpenses)*100):"—"} του συνόλου</span></article>
    <article><small>Λοιπά έξοδα</small><strong>${money(s.otherExpenses)}</strong><span>${s.totalExpenses?pct(number(s.otherExpenses)/number(s.totalExpenses)*100):"—"} του συνόλου</span></article>
    <article><small>Αγορές με ΦΠΑ</small><strong>${money(s.purchasesTotal)}</strong><span>εγκεκριμένα παραστατικά</span></article>
    <article><small>% εξόδων / πωλήσεων</small><strong>${pct(s.percentOfSales)}</strong><span>Πωλήσεις ${money(s.salesTotal)}</span></article>
    <article class="${delta>0?"warn":"good"}"><small>Μεταβολή περιόδου</small><strong>${delta===null?"—":`${delta>=0?"+":""}${pct(delta)}`}</strong><span>Προηγ. ${money(s.previousTotal)}</span></article>
  </div>`;
}
function filterHtml(report){
  const stores=report?.stores||[];
  const suppliers=report?.suppliers||[];
  return `<section class="owner-payments-filter">
    <div class="owner-payments-filter-title"><b>Κριτήρια αναζήτησης</b><small>Πλήρης εικόνα εξόδων και πληρωμών ιδιοκτήτη από πραγματικές καταγραφές MyWorkStation.</small></div>
    <div class="owner-payments-filter-grid">
      <label>Από<input type="date" data-op-from value="${esc(state.from)}"></label>
      <label>Έως<input type="date" data-op-to value="${esc(state.to)}"></label>
      <label>Κατάστημα<select data-op-store><option value="">Όλα τα καταστήματα</option>${stores.map(row=>`<option value="${esc(row.id)}" ${state.storeId===row.id?"selected":""}>${esc(row.name)}</option>`).join("")}</select></label>
      <label>Προμηθευτής<select data-op-supplier><option value="">Όλοι οι προμηθευτές</option>${suppliers.map(row=>`<option value="${esc(row.id)}" ${state.supplierId===row.id?"selected":""}>${esc(row.name)}${row.taxId?` · ${esc(row.taxId)}`:""}</option>`).join("")}</select></label>
      <label class="owner-payments-q">Περιγραφή / χειριστής<input data-op-q value="${esc(state.q)}" placeholder="Αναζήτηση σε περιγραφή, προμηθευτή, χειριστή"></label>
      <button class="owner-payments-search" data-op-search title="Αναζήτηση">⌕</button>
    </div>
    <div class="owner-payments-filter-actions">
      <button class="toggle ${state.other?"on":""}" data-op-toggle="other">Έξοδα προς τρίτους <b>${state.other?"ΝΑΙ":"ΟΧΙ"}</b></button>
      <button class="toggle ${state.supplier?"on":""}" data-op-toggle="supplier">Πληρωμές προμηθευτών <b>${state.supplier?"ΝΑΙ":"ΟΧΙ"}</b></button>
      <span class="spacer"></span>
      <button data-op-range="year">Τρέχον έτος</button>
      <button data-op-range="month">Τρέχων μήνας</button>
      <button data-op-range="today">Σήμερα</button>
      <button data-op-export>Excel / CSV</button>
      <button data-op-print>Εκτύπωση</button>
    </div>
  </section>`;
}
function navHtml(){
  const items=[["overview","Σύνοψη"],["categories","Κατηγορίες"],["suppliers","Προμηθευτές"],["movements","Αναλυτικές κινήσεις"],["alerts","Έλεγχοι / Alerts"]];
  return `<div class="owner-payments-nav">${items.map(([id,label])=>`<button data-op-tab="${id}" class="${state.tab===id?"active":""}">${label}</button>`).join("")}</div>`;
}
function overviewHtml(report){
  const rows=report?.byStore||[],daily=report?.daily||[];
  const max=Math.max(1,...daily.map(row=>number(row.expenses)));
  return `${cards(report)}
    <div class="owner-payments-grid">
      <section class="owner-payments-panel">
        <div class="owner-payments-panel-head"><h3>Ανά κατάστημα</h3><small>Έξοδα, αγορές και πωλήσεις της περιόδου</small></div>
        <div class="owner-payments-table stores">
          <div class="row head"><span>Κατάστημα</span><span>Κινήσεις</span><span>Έξοδα</span><span>Αγορές</span><span>Πωλήσεις</span><span>% εξ./πωλ.</span></div>
          ${rows.map(row=>`<div class="row"><span><b>${esc(row.name||"Κατάστημα")}</b></span><span>${row.count||0}</span><strong>${money(row.expenses)}</strong><span>${money(row.purchases)}</span><span>${money(row.sales)}</span><b>${row.sales?pct(number(row.expenses)/number(row.sales)*100):"—"}</b></div>`).join("")||'<div class="owner-payments-empty">Δεν υπάρχουν δεδομένα καταστημάτων για το διάστημα.</div>'}
        </div>
      </section>
      <section class="owner-payments-panel">
        <div class="owner-payments-panel-head"><h3>Πορεία εξόδων</h3><small>Ημερήσια εικόνα περιόδου</small></div>
        <div class="owner-payments-bars">${daily.map(row=>`<div class="bar-row"><span>${esc(new Date(row.day).toLocaleDateString("el-GR",{day:"2-digit",month:"2-digit"}))}</span><div><i style="width:${Math.max(2,number(row.expenses)/max*100)}%"></i></div><b>${money(row.expenses)}</b><small>πωλ. ${money(row.sales)}</small></div>`).join("")||'<div class="owner-payments-empty">Δεν υπάρχουν ημερήσιες κινήσεις.</div>'}</div>
      </section>
    </div>`;
}
function categoriesHtml(report){
  const rows=report?.categories||[],total=number(report?.summary?.totalExpenses);
  return `<section class="owner-payments-panel"><div class="owner-payments-panel-head"><h3>Κατηγορίες / περιγραφές εξόδων</h3><small>Οι «Λοιπές δαπάνες» ομαδοποιούνται από την πραγματική περιγραφή της καταχώρισης.</small></div>
    <div class="owner-payments-table categories"><div class="row head"><span>Κατηγορία / περιγραφή</span><span>Τύπος</span><span>Κινήσεις</span><span>Ποσό</span><span>% συνόλου</span></div>
    ${rows.map(row=>`<div class="row"><span><b>${esc(row.name)}</b></span><span>${row.type==="SUPPLIER_PAYMENT"?"Προμηθευτές":"Λοιπά έξοδα"}</span><span>${row.count||0}</span><strong>${money(row.amount)}</strong><b>${total?pct(number(row.amount)/total*100):"—"}</b></div>`).join("")||'<div class="owner-payments-empty">Δεν υπάρχουν κατηγορίες εξόδων.</div>'}</div></section>`;
}
function suppliersHtml(report){
  const rows=report?.bySupplier||[];
  return `<section class="owner-payments-panel"><div class="owner-payments-panel-head"><h3>Ανά προμηθευτή</h3><small>Σύγκριση πραγματικών πληρωμών με εγκεκριμένες αγορές της ίδιας περιόδου. Η διαφορά δεν αποτελεί λογιστική οφειλή.</small></div>
    <div class="owner-payments-table suppliers"><div class="row head"><span>Προμηθευτής</span><span>Πληρωμές</span><span>Πλήθος πληρ.</span><span>Αγορές περιόδου</span><span>Παραστατικά</span><span>Αγορές - πληρωμές</span></div>
    ${rows.map(row=>`<div class="row"><span><b>${esc(row.name||"Χωρίς προμηθευτή")}</b></span><strong>${money(row.payments)}</strong><span>${row.count||0}</span><span>${money(row.purchases)}</span><span>${row.documents||0}</span><b>${money(number(row.purchases)-number(row.payments))}</b></div>`).join("")||'<div class="owner-payments-empty">Δεν υπάρχουν κινήσεις προμηθευτών.</div>'}</div></section>`;
}
function evidenceLabel(row){
  if(row.evidenceMode==="DOCUMENT")return `AI Reader · ${esc(String(row.purchaseDocumentId||"").slice(0,8))}`;
  if(row.evidenceMode==="LEGACY_PHOTO")return `<button data-op-photo="${esc(row.id)}">Προβολή φωτογραφίας</button>`;
  return "Χωρίς παραστατικό";
}
function shiftAudit(row){
  const shift=row.sessionId?`#${esc(String(row.sessionId).slice(0,8))}`:"—";
  const source=row.paymentSource==="CASH_SHIFT"?"Από βάρδια":"Εξωτερική";
  return `<b>${shift}</b><small>${source}</small>`;
}
function movementsHtml(report){
  const rows=report?.movements||[];
  return `<section class="owner-payments-panel"><div class="owner-payments-panel-head"><h3>Όλες οι κινήσεις</h3><small>${rows.length} εγγραφές · εμφανίζονται ενεργές και ακυρωμένες για πλήρες audit.</small></div>
    <div class="owner-payments-table movements"><div class="row head"><span>Ημερομηνία</span><span>Κατάστημα</span><span>Τύπος</span><span>Προμηθευτής / περιγραφή</span><span>Ποσό</span><span>Χειριστής</span><span>Βάρδια / Πηγή</span><span>Παραστατικό</span><span>Κατάσταση</span></div>
    ${rows.map(row=>`<div class="row ${row.reversedAt?"reversed":""}"><span>${esc(fmt(row.occurredAt))}<small>#${esc(String(row.id).slice(0,8))}</small></span><span>${esc(row.storeName)}</span><span>${row.type==="SUPPLIER_PAYMENT"?"Προμηθευτής":"Λοιπό έξοδο"}</span><span><b>${esc(row.supplierName||row.description||"Χωρίς περιγραφή")}</b>${row.supplierName&&row.description?`<small>${esc(row.description)}</small>`:""}</span><strong>${money(row.amount)}</strong><span>${esc(row.actorName)}</span><span>${shiftAudit(row)}</span><span>${evidenceLabel(row)}</span><span class="${row.reversedAt?"bad":"ok"}">${row.reversedAt?`ΑΚΥΡΩΜΕΝΗ${row.reversalReason?`<small>${esc(row.reversalReason)}</small>`:""}`:"ΕΝΕΡΓΗ"}</span></div>`).join("")||'<div class="owner-payments-empty">Δεν υπάρχουν κινήσεις για τα κριτήρια.</div>'}</div></section>`;
}
function alertsHtml(report){
  const rows=report?.movements||[],s=report?.summary||{},avg=number(s.averageExpense);
  const active=rows.filter(row=>!row.reversedAt);
  const missing=active.filter(row=>row.evidenceMode==="NO_DOCUMENT");
  const high=active.filter(row=>active.length>=4&&avg>0&&number(row.amount)>=avg*2);
  const reversed=rows.filter(row=>row.reversedAt);
  const alerts=[];
  if(missing.length)alerts.push({level:"danger",title:`${missing.length} κινήσεις χωρίς διαθέσιμο παραστατικό`,body:"Οι κινήσεις έχουν καταχωρηθεί ρητά χωρίς παραστατικό και διαθέτουν υποχρεωτική αιτιολογία για έλεγχο."});
  if(high.length)alerts.push({level:"warn",title:`${high.length} κινήσεις πάνω από 2× τον μέσο όρο`,body:`Μέσο ποσό περιόδου ${money(avg)}. Οι κινήσεις εμφανίζονται για έλεγχο, όχι ως αυτόματη κατηγορία απάτης.`});
  if(reversed.length)alerts.push({level:"info",title:`${reversed.length} ακυρωμένες κινήσεις`,body:"Οι ακυρώσεις παραμένουν ορατές για πλήρες audit."});
  if(number(s.changePercent)>20)alerts.push({level:"warn",title:`Αύξηση εξόδων ${pct(s.changePercent)}`,body:`Σε σχέση με την αμέσως προηγούμενη περίοδο ίσης διάρκειας.`});
  if(!alerts.length)alerts.push({level:"good",title:"Δεν εντοπίστηκε βασική απόκλιση",body:"Δεν υπάρχουν κινήσεις χωρίς παραστατικό, μεγάλες αποκλίσεις ή ακυρώσεις με τα τρέχοντα κριτήρια."});
  return `<div class="owner-payments-alerts">${alerts.map(a=>`<article class="${a.level}"><b>${esc(a.title)}</b><span>${esc(a.body)}</span></article>`).join("")}</div>
    ${high.length?`<section class="owner-payments-panel"><div class="owner-payments-panel-head"><h3>Κινήσεις για έλεγχο ποσού</h3></div><div class="owner-payments-table alerts"><div class="row head"><span>Ημερομηνία</span><span>Κατάστημα</span><span>Περιγραφή</span><span>Χειριστής</span><span>Ποσό</span></div>${high.map(row=>`<div class="row"><span>${esc(fmt(row.occurredAt))}</span><span>${esc(row.storeName)}</span><span>${esc(row.supplierName||row.description||"—")}</span><span>${esc(row.actorName)}</span><strong>${money(row.amount)}</strong></div>`).join("")}</div></section>`:""}`;
}
function bodyHtml(report){
  if(state.tab==="categories")return categoriesHtml(report);
  if(state.tab==="suppliers")return suppliersHtml(report);
  if(state.tab==="movements")return movementsHtml(report);
  if(state.tab==="alerts")return alertsHtml(report);
  return overviewHtml(report);
}
function render(root){
  const report=state.report;
  root.innerHTML=`<div class="owner-payments-title"><div><h2>Έξοδα & Πληρωμές Ιδιοκτήτη</h2><p>Κεντρικός έλεγχος πληρωμών, εξόδων, αγορών, πωλήσεων και παραστατικών.</p></div><span class="owner-payments-source">ΠΡΑΓΜΑΤΙΚΑ ΔΕΔΟΜΕΝΑ</span></div>${filterHtml(report)}${state.error?`<div class="owner-payments-error">${esc(state.error)}</div>`:""}${state.loading?'<div class="owner-payments-loading">Φόρτωση πλήρους εικόνας…</div>':`${navHtml()}<div class="owner-payments-content">${bodyHtml(report)}</div>`}`;
  bind(root);
}
async function load(root){
  state.loading=true;state.error="";render(root);
  try{state.report=await api(`/api/owner-payments/report?${qs()}`)}
  catch(error){state.error=error.message||"Αποτυχία φόρτωσης αναφοράς."}
  finally{state.loading=false;render(root)}
}
function setRange(id){
  if(id==="today"){state.from=todayValue();state.to=todayValue()}
  if(id==="month"){state.from=monthStartValue();state.to=todayValue()}
  if(id==="year"){state.from=yearStartValue();state.to=todayValue()}
}
function exportCsv(){
  const rows=state.report?.movements||[];
  const lines=[["Ημερομηνία","Κατάστημα","Τύπος","Προμηθευτής","Περιγραφή","Ποσό","Χειριστής","Βάρδια","Πηγή πληρωμής","Παραστατικό","Κατάσταση"]];
  for(const row of rows){
    const evidence=row.evidenceMode==="DOCUMENT"?`AI Reader ${row.purchaseDocumentId||""}`:row.evidenceMode==="LEGACY_PHOTO"?"Φωτογραφία":"Χωρίς παραστατικό";
    lines.push([fmt(row.occurredAt),row.storeName,row.type,row.supplierName||"",row.description||"",number(row.amount).toFixed(2),row.actorName,row.sessionId||"",row.paymentSource==="CASH_SHIFT"?"ΑΠΟ ΒΑΡΔΙΑ":"ΕΞΩΤΕΡΙΚΗ",evidence,row.reversedAt?"ΑΚΥΡΩΜΕΝΗ":"ΕΝΕΡΓΗ"]);
  }
  const csv="\ufeff"+lines.map(row=>row.map(value=>`"${String(value??"").replace(/"/g,'""')}"`).join(";")).join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=`myworkstation-owner-payments-${state.from}-${state.to}.csv`;a.click();URL.revokeObjectURL(url);
}
async function openPhoto(id){
  const popup=window.open("","_blank");
  try{
    const result=await api(`/api/transactions/${encodeURIComponent(id)}/attachment`);
    if(!popup)return;
    popup.document.write(`<title>Παραστατικό MyWorkStation</title><body style="margin:0;background:#111"><img src="${result.dataUrl}" style="display:block;max-width:100%;height:auto;margin:auto"></body>`);
  }catch(error){if(popup)popup.document.write(`<p>${esc(error.message)}</p>`)}
}
function bind(root){
  root.querySelector("[data-op-search]")?.addEventListener("click",()=>{state.from=root.querySelector("[data-op-from]")?.value||state.from;state.to=root.querySelector("[data-op-to]")?.value||state.to;state.storeId=root.querySelector("[data-op-store]")?.value||"";state.supplierId=root.querySelector("[data-op-supplier]")?.value||"";state.q=root.querySelector("[data-op-q]")?.value||"";load(root)});
  root.querySelector("[data-op-q]")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();root.querySelector("[data-op-search]")?.click()}});
  root.querySelectorAll("[data-op-range]").forEach(button=>button.addEventListener("click",()=>{setRange(button.dataset.opRange);load(root)}));
  root.querySelectorAll("[data-op-toggle]").forEach(button=>button.addEventListener("click",()=>{const key=button.dataset.opToggle;if(key==="supplier"){if(!state.other&&state.supplier)return;state.supplier=!state.supplier}else{if(!state.supplier&&state.other)return;state.other=!state.other}load(root)}));
  root.querySelectorAll("[data-op-tab]").forEach(button=>button.addEventListener("click",()=>{state.tab=button.dataset.opTab;render(root)}));
  root.querySelector("[data-op-export]")?.addEventListener("click",exportCsv);
  root.querySelector("[data-op-print]")?.addEventListener("click",()=>window.print());
  root.querySelectorAll("[data-op-photo]").forEach(button=>button.addEventListener("click",()=>openPhoto(button.dataset.opPhoto)));
}
function activate(hub,tab,root){
  hub.classList.add("owner-payments-active");
  hub.querySelectorAll(".commerce-module-strip button").forEach(button=>button.classList.toggle("active",button===tab));
  root.style.display="block";
  if(!state.storeId){
    const contextStore=hub.querySelector(":scope > .panel > label select")?.value||"";
    if(contextStore)state.storeId=contextStore;
  }
  if(!state.report)load(root);else render(root);
}
function deactivate(hub,tab,root){
  hub.classList.remove("owner-payments-active");tab.classList.remove("active");root.style.display="none";
}
function installHub(hub){
  if(!canOpenOwnerPayments())return;
  const strip=hub.querySelector(".commerce-module-strip");
  if(!strip)return;
  let root=hub.querySelector(":scope > .owner-payments-suite");
  if(!root){root=document.createElement("section");root.className="owner-payments-suite";root.style.display="none";hub.appendChild(root)}
  let tab=strip.querySelector(".owner-payments-tab");
  if(!tab){
    tab=document.createElement("button");tab.type="button";tab.className="owner-payments-tab";tab.innerHTML="💶 Έξοδα & Πληρωμές";
    tab.addEventListener("click",()=>activate(hub,tab,root));strip.appendChild(tab);
  }
  strip.querySelectorAll("button:not(.owner-payments-tab)").forEach(button=>{
    if(button.dataset.ownerPaymentsBound)return;
    button.dataset.ownerPaymentsBound="1";button.addEventListener("click",()=>deactivate(hub,tab,root));
  });
}
export function installOwnerPaymentsSuite(){
  const run=()=>document.querySelectorAll(".commerce-hub").forEach(installHub);
  run();
  const observer=new MutationObserver(run);observer.observe(document.documentElement,{childList:true,subtree:true});
}
