const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const n=v=>Number(v||0),money=v=>n(v).toLocaleString("el-GR",{style:"currency",currency:"EUR"}),num=v=>n(v).toLocaleString("el-GR",{maximumFractionDigits:3}),fmt=v=>v?new Date(v).toLocaleString("el-GR"):"—";
let currentItems=[];
async function api(path){const t=localStorage.getItem("token"),r=await fetch(path,{headers:{...(t?{Authorization:`Bearer ${t}`}:{})}}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Σφάλμα ${r.status}`);return d}
function params(root){return new URLSearchParams({from:root.querySelector("[data-kr-from]")?.value||"",to:root.querySelector("[data-kr-to]")?.value||"",...(root.querySelector("[data-kr-store]")?.value?{storeId:root.querySelector("[data-kr-store]").value}:{}),...(root.querySelector("[data-kr-q]")?.value?.trim()?{q:root.querySelector("[data-kr-q]").value.trim()}:{})})}
const head=c=>`<div class="kr-row kr-head">${c.map(x=>`<span>${x}</span>`).join("")}</div>`,row=c=>`<div class="kr-row">${c.map(x=>`<span>${x}</span>`).join("")}</div>`;
function removeOld(root){root.querySelector(".kr-panel")?.remove();root.querySelector(".kr-unavailable")?.remove();root.querySelector(".kr-error")?.remove()}
function deletionView(data){const items=data.items||[];currentItems=items;return `<section class="kr-panel"><h3>Διαγραφές λίστας πώλησης</h3><div class="kr-info">Το audit ξεκινά από την ενεργοποίηση αυτής της λειτουργίας. Δεν δημιουργούνται αναδρομικές εγγραφές.</div><div class="kr-table audit-deletions">${head(["Ημερομηνία","Περιγραφή","Ποσότητα","Τιμή μονάδος","Σύνολο","Χειριστής","Αιτιολογία","Βάρδια","Κατάστημα"])}${items.map(r=>row([fmt(r.createdAt),`<b>${esc(r.productName||"—")}</b>`,num(r.quantity),money(r.unitPrice),`<strong>${money(r.lineTotal)}</strong>`,esc(r.actorName||"—"),esc(r.reason||r.eventType||"—"),esc(r.shiftId||"—"),esc(r.storeName||"—")])).join("")||'<div class="kr-empty">Δεν βρέθηκαν εγγραφές.</div>'}</div><div class="kr-summary"><span>${items.length} εγγραφές</span><strong>Σύνολο: ${money(data.totalValue)}</strong></div></section>`}
function deactivationView(data){const items=data.items||[];currentItems=items;return `<section class="kr-panel"><h3>Απενεργοποιήσεις ειδών</h3><div class="kr-info">Εμφανίζονται πραγματικές αλλαγές Ενεργό → Ανενεργό που καταγράφηκαν μετά την ενεργοποίηση audit.</div><div class="kr-table audit-deactivations">${head(["Ημερομηνία","Περιγραφή","Εσωτ. κωδικός","Λιανική","Απόθεμα","Χειριστής","Πηγή","Κατάστημα"])}${items.map(r=>row([fmt(r.createdAt),`<b>${esc(r.productName||"—")}</b>`,esc(r.sku||"—"),money(r.salePrice),num(r.currentStock),esc(r.actorName||"—"),esc(r.sourceType||"—"),esc(r.storeName||"Όλα")])).join("")||'<div class="kr-empty">Δεν βρέθηκαν εγγραφές.</div>'}</div><div class="kr-summary"><span>${items.length} απενεργοποιήσεις</span></div></section>`}
const eventLabel=t=>({SUPPLIER_PAYMENT:"Πληρωμή προμηθευτή",OTHER_EXPENSE:"Λοιπά έξοδα",SALE_CASH:"Πώληση μετρητών",SALE_CARD:"Πώληση με κάρτα",PERCENTAGES:"Ποσοστά",TRANSFER_AMOUNT:"Μεταφορά ποσού",POS_RETURN:"Ολική επιστροφή",POS_RETURN_ITEMS:"Μερική επιστροφή",POS_SELF_CONSUMPTION:"Προσωπική κατανάλωση",POS_PRODUCT_DESTRUCTION:"Καταστροφή προϊόντων",POS_CANCEL:"Ακύρωση πώλησης",ONLINE_ORDER:"Online Παραγγελίες"})[t]||t||"—";
const paymentLabel=r=>r.sourceType==="ONLINE_ORDERS"?"Online Παραγγελίες":r.paymentSource==="CASH_SHIFT"?"Μετρητά βάρδιας":r.paymentSource==="AUDIT_EVENT"?"Συμβάν":"Εξωτερικά";
const onlineAction=event=>{
  if(event.note==="ORDER_RECEIVED")return"Λήψη παραγγελίας";
  if(event.note==="AUTO_PRINT_REQUESTED")return"Αυτόματη εκτύπωση";
  if(event.note==="PRINT_REQUESTED")return"Εκτύπωση / επανεκτύπωση";
  const to=String(event.toStatus||"");
  if(to==="ACCEPTED")return"Αποδοχή παραγγελίας";
  if(to==="PREPARING")return"Έναρξη προετοιμασίας";
  if(to==="READY")return"Η παραγγελία είναι έτοιμη";
  if(to==="OUT_FOR_DELIVERY")return"Παράδοση σε delivery";
  if(to==="DELIVERED")return"Η παραγγελία παραδόθηκε";
  if(to==="CANCELLED")return"Ακύρωση παραγγελίας";
  return event.note||`${event.fromStatus||""}${event.fromStatus?" → ":""}${to||"Ενημέρωση παραγγελίας"}`;
};
function onlineStoreOptions(root){
  const select=root.querySelector("[data-kr-store]");if(!select)return[];
  const selected=select.value;
  return [...select.options].map(option=>({id:option.value,name:String(option.textContent||"").trim()})).filter(store=>store.id&&(store.id==="kat-test-store"||/ΚΥΛΙΚΕΙΟ\s*ΚΑΤ/i.test(store.name))).filter(store=>!selected||store.id===selected);
}
function auditRange(root){
  const from=root.querySelector("[data-kr-from]")?.value,to=root.querySelector("[data-kr-to]")?.value;
  const start=from?new Date(`${from}T00:00:00`).getTime():-Infinity,end=to?new Date(`${to}T23:59:59.999`).getTime():Infinity;
  return{start,end,q:String(root.querySelector("[data-kr-q]")?.value||"").trim().toLocaleLowerCase("el-GR")};
}
async function mergeOnlineOrderEvents(root,data){
  const stores=onlineStoreOptions(root);if(!stores.length)return data;
  const {start,end,q}=auditRange(root),online=[];
  await Promise.all(stores.map(async store=>{
    try{
      const result=await api(`/api/public/kat/backoffice/stores/${encodeURIComponent(store.id)}/orders?limit=300`);
      for(const order of result.rows||[])for(const event of order.events||[]){
        const ts=new Date(event.createdAt||0).getTime();if(ts<start||ts>end)continue;
        const action=onlineAction(event),description=`#${order.orderNumber} · ${action}${order.customerName?` · ${order.customerName}`:""}`;
        if(q&&!`${description} ${order.customerPhone||""} ${store.name}`.toLocaleLowerCase("el-GR").includes(q))continue;
        online.push({id:`online-${event.id}`,createdAt:event.createdAt,eventType:"ONLINE_ORDER",amount:0,description,supplierId:null,supplierName:null,shiftId:null,actorId:event.userId||event.employeeId||null,actorName:event.employeeId?`Εργαζόμενος ${event.employeeId}`:"Online",subtractFromShift:false,reversedAt:null,reversedByName:null,reversalReason:null,storeName:store.name,sourceType:"ONLINE_ORDERS",paymentSource:"ONLINE_ORDERS",orderNumber:order.orderNumber,onlineStatus:event.toStatus});
      }
    }catch{}
  }));
  const items=[...(data.items||[]),...online].sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)).slice(0,10000);
  return{...data,items,count:items.length,sourceOfTruth:`${data.sourceOfTruth||"StoreTransaction + PosSaleActionAudit"} + OnlineOrderStatusEvent`};
}
function auditView(data){const items=data.items||[];currentItems=items;return `<section class="kr-panel"><h3>Συμβάντα / Audit</h3><div class="kr-info">Πηγή αλήθειας: <b>${esc(data.sourceOfTruth||"StoreTransaction")}</b>. Οι ενέργειες των online παραγγελιών εμφανίζονται εδώ ως <b>Online Παραγγελίες</b>, μαζί με τα υπόλοιπα πραγματικά συμβάντα του BackOffice.</div><div class="kr-table audit-events">${head(["Ημερομηνία","Τύπος","Transaction ID","Περιγραφή / Τιμολόγιο","Ποσό","Προμηθευτής","Χειριστής","Βάρδια","Τρόπος","Κατάστημα"])}${items.map(r=>row([fmt(r.createdAt),`<b>${esc(eventLabel(r.eventType))}</b>`,`<small>${esc(r.id||"—")}</small>`,esc(r.description||"—"),r.sourceType==="ONLINE_ORDERS"?"—":`<strong>${money(r.amount)}</strong>`,esc(r.supplierName||"—"),esc(r.actorName||"—"),esc(r.shiftId||"—"),paymentLabel(r),esc(r.storeName||"—")])).join("")||'<div class="kr-empty">Δεν βρέθηκαν εγγραφές.</div>'}</div><div class="kr-summary"><span>${items.length} συμβάντα</span><strong>Source of truth: ${esc(data.sourceOfTruth||"StoreTransaction")}</strong></div></section>`}
function endpoint(mode){if(mode==="sale-deletions")return"sale-deletions";if(mode==="deactivations")return"deactivations";return"audit-events"}
async function load(root,mode){root.dataset.auditTab=mode;root.querySelectorAll("[data-kr-tab]").forEach(b=>b.classList.toggle("active",b.dataset.krTab===mode));removeOld(root);const toolbar=root.querySelector(".kr-toolbar");const holder=document.createElement("div");holder.className="kr-error";holder.textContent="Φόρτωση…";toolbar?.before(holder);try{let data=await api(`/api/reports/${endpoint(mode)}?${params(root)}`);if(mode==="audit-events")data=await mergeOnlineOrderEvents(root,data);holder.outerHTML=mode==='sale-deletions'?deletionView(data):mode==='deactivations'?deactivationView(data):auditView(data)}catch(e){holder.textContent=e.message}}
function exportCsv(mode){if(!currentItems.length)return alert("Δεν υπάρχουν δεδομένα για εξαγωγή.");const keys=Object.keys(currentItems[0]).filter(k=>typeof currentItems[0][k]!=="object"),csv="\ufeff"+[keys.join(";"),...currentItems.map(r=>keys.map(k=>`"${String(r[k]??"").replace(/"/g,'""')}"`).join(";"))].join("\r\n"),a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download=`anafores-${mode}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function ensureAuditTab(root){if(!root||root.querySelector('[data-kr-tab="audit-events"]'))return;const groups=root.querySelectorAll(".kr-tabs");const target=groups[groups.length-1]||groups[0];if(!target)return;const button=document.createElement("button");button.type="button";button.dataset.krTab="audit-events";button.textContent="🛡 Συμβάντα / Audit";target.appendChild(button)}
function scan(){document.querySelectorAll(".kiosk-reports-suite").forEach(ensureAuditTab)}
export function installKioskReportsAuditV2(){
  if(window.__mwsKioskReportsAuditV2)return;window.__mwsKioskReportsAuditV2=true;
  scan();
  if(!document.body)window.addEventListener("DOMContentLoaded",scan,{once:true});
  document.addEventListener("click",event=>{
    const root=event.target.closest(".kiosk-reports-suite");if(!root)return;ensureAuditTab(root);
    const tab=event.target.closest("[data-kr-tab]");
    if(tab){const mode=tab.dataset.krTab;if(mode==="sale-deletions"||mode==="deactivations"||mode==="audit-events"){event.preventDefault();event.stopImmediatePropagation();load(root,mode);return}delete root.dataset.auditTab;currentItems=[];return}
    const mode=root.dataset.auditTab;if(!mode)return;
    if(event.target.closest("[data-kr-search]")||event.target.closest("[data-kr-refresh]")){event.preventDefault();event.stopImmediatePropagation();load(root,mode);return}
    if(event.target.closest("[data-kr-export]")){event.preventDefault();event.stopImmediatePropagation();exportCsv(mode)}
  },true);
}
