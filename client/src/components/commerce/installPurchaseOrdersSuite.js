import {installMyDataPrintedEconomicsNotice} from "../../lib/mydata-printed-economics-notice.mjs";
import {installInvoiceLineTaxonomy} from "./invoiceLineTaxonomy.js";
import {showPurchaseSupplierCorrection} from "./purchaseSupplierCorrection.js";
import {greeceDateTimeToIso,greeceDateInput} from "../../../../shared/greece-time.mjs";
import {installInvoiceProductMatcher} from "../../invoice-product-matcher.js";
const allowed=()=>{try{return ["SUPER_ADMIN","OWNER","ADMIN","MANAGER"].includes(JSON.parse(localStorage.getItem("user")||"{}").role)}catch{return false}};
const pad=n=>String(n).padStart(2,"0");
const dateValue=d=>greeceDateInput(d);
const today=()=>dateValue(new Date());
const monthStart=()=>`${greeceDateInput().slice(0,7)}-01`;
const roundMoney=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
const money=value=>roundMoney(value).toLocaleString("el-GR",{style:"currency",currency:"EUR",minimumFractionDigits:2,maximumFractionDigits:2});
const compactNumber=(value,max=8)=>Number(value||0).toLocaleString("el-GR",{useGrouping:false,maximumFractionDigits:max});
const pendingPack=line=>line?.invoiceUnit==="PACKAGE"&&line.stockUnitsPerInvoiceUnit===0;
const stockQuantity=line=>Number(line?.quantity||0)*Math.max(1,Number(line?.stockUnitsPerInvoiceUnit||1));
const stockUnitCost=line=>Number(line?.unitCost||0)/Math.max(1,Number(line?.stockUnitsPerInvoiceUnit||1));
const stockUnit=line=>/(?:^|\D)\d+(?:[,.]\d+)?\s*(?:KGR|KG|KILO|ΚΙΛ)/i.test(String(line?.description||""))?"g":"τμχ";
const stockQuantityLabel=line=>`${compactNumber(stockQuantity(line),3)} ${stockUnit(line)}`;
const num=value=>Number(String(value??0).trim().replace(",","."))||0;
const generateInternalBarcode=()=>{const data=`29${Math.floor(Math.random()*1e10).toString().padStart(10,"0")}`,sum=[...data].reduce((total,digit,index)=>total+Number(digit)*(index%2===0?1:3),0);return `${data}${(10-sum%10)%10}`};
const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));
const fmt=value=>value?new Date(value).toLocaleString("el-GR",{timeZone:"Europe/Athens",hour12:false,day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
const statusLabel=value=>({NEW:"Νέα παραγγελία",FINAL:"Οριστική",INVOICED:"Τιμολογημένη",CANCELLED:"Ακυρωμένη"}[value]||value||"—");
const assistantDraftDescription=(value,status)=>{const text=String(value||"").replace(/αναμονή πλήρους ανάγνωσης/g,"Ανάγνωση από βοηθό");return status==="INVOICED"?text.replace(/(?:Ανάγνωση από βοηθό\s*[·—-]?\s*)?(?:ΠΡΟΣ ΕΛΕΓΧΟ|πρόχειρο για έλεγχο)/gi,"Ολοκληρωμένη τιμολόγηση"):text};
const ocrJobDiagnostic=(job,status)=>{if(!job||status==="INVOICED")return "";const draftForAssistant=job.status==="AWAITING_APPROVAL"&&job.stage==="POS_BACKGROUND_COMPLETE";return draftForAssistant?`<small data-ocr-job-status style="display:block;margin-top:4px;color:#6a5200;font-weight:800">Ανάγνωση από βοηθό · πρόχειρο για έλεγχο · ${fmt(job.updatedAt)}</small>`:`<small data-ocr-job-status style="display:block;margin-top:4px;color:${job.error?"#a12622":"#6a5200"};font-weight:800">OCR job: ${esc(job.status||"—")} / ${esc(job.stage||"—")} · ${fmt(job.updatedAt)}${job.error?` · ${esc(job.error)}`:""}</small>`};
const orderViews=[
  ["NEW","Νέες παραγγελίες"],
  ["FINAL","Οριστικοποιημένες προς έλεγχο"],
  ["INVOICED","Τιμολογημένες"],
];
const state={active:false,tab:"orders",from:monthStart(),to:today(),storeId:"",supplierId:"",status:"NEW",q:"",report:null,proposal:[],loading:false,lastRefresh:null,recovery:null};
let reportRequestId=0;
let posContext=null;
let posClosed=false;
const staffCan=cap=>Boolean(posContext?.staffCapabilities?.includes(cap));
const canCancelInvoice=()=>posContext?staffCan("invoices.cancel"):allowed();
let suiteListenersInstalled=false;
async function api(path,options={}){
 if(posClosed)throw new Error("Η οθόνη τιμολογίων έκλεισε.");
 if(posContext){const context=posContext,writing=String(options.method||'GET').toUpperCase()!=='GET';if(context.staffCapabilities&&writing&&context.staffBusy)throw new Error('Περίμενε να ολοκληρωθεί η καταχώριση.');if(context.staffCapabilities&&writing)context.staffBusy=true;try{const result=await context.request(path,{...options,signal:context.controller.signal});if(posContext!==context||context.controller.signal.aborted)throw new Error("Η οθόνη τιμολογίων έκλεισε.");return result;}finally{if(writing)context.staffBusy=false;}}
 const token=localStorage.getItem("token");const response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);return data}
function modal(html,wide=true){const wrap=document.createElement("div");wrap.className=`po-modal-overlay ${wide?"wide":""}`;if(posContext)wrap.dataset.posInvoiceModal="1";wrap.innerHTML=`<section class="${posContext?"pos-po-modal":"po-modal"}">${html}</section>`;document.body.appendChild(wrap);wrap.addEventListener("click",event=>{if(!posContext?.staffBusy&&(event.target===wrap||event.target.closest("[data-po-close]")))wrap.remove()});return wrap}
function notify(root,text,error=false){let box=root.querySelector(".po-message");if(!box){box=document.createElement("div");box.className="po-message";root.prepend(box)}box.classList.toggle("error",error);box.textContent=text;setTimeout(()=>box?.remove(),6500)}
function installLineEnterNavigation(){document.addEventListener("keydown",event=>{if(event.key!=="Enter"||event.isComposing||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;const current=event.target;if(current.matches?.("[data-product-q]")){event.preventDefault();current.closest(".po-modal,.pos-po-modal")?.querySelector("[data-product-search]")?.click();return}const form=current.closest?.("form.po-line-form,form.po-entry-row");if(!form||!current.matches("input[name],select[name]"))return;event.preventDefault();const fields=[...form.querySelectorAll("input[name],select[name]")].filter(field=>!field.disabled&&field.type!=="hidden");const next=fields[fields.indexOf(current)+1]||form.querySelector('button.primary[type="submit"]');next?.focus();if(next?.matches('input:not([type="checkbox"])'))next.select?.()})}
installLineEnterNavigation();
function qReport(){const q=new URLSearchParams({from:greeceDateTimeToIso(`${state.from}T00:00:00`),to:greeceDateTimeToIso(`${state.to}T23:59:59.999`),status:state.status});if(state.storeId)q.set("storeId",state.storeId);if(state.supplierId)q.set("supplierId",state.supplierId);if(state.q.trim())q.set("q",state.q.trim());return q}
function nativeVisibility(hub,hide){hub.classList.toggle("commerce-external-tab-active",hide);[...hub.children].forEach((child,index)=>{if(index===0||child.classList.contains("purchase-orders-suite"))return;child.classList.toggle("po-native-hidden",hide)})}
function activate(hub,button,readOnly=false){state.active=true;nativeVisibility(hub,true);button.classList.add("active");let suite=hub.querySelector(".purchase-orders-suite");if(!suite){suite=document.createElement("section");suite.className="purchase-orders-suite";hub.firstElementChild?.after(suite)}suite.hidden=false;render(suite);loadReport(suite,readOnly)}
function deactivate(hub,button){state.active=false;button.classList.remove("active");hub.querySelector(".purchase-orders-suite")?.setAttribute("hidden","");nativeVisibility(hub,false)}
function bindNative(strip,hub,custom){[...strip.querySelectorAll("button")].filter(b=>b!==custom).forEach(btn=>{if(btn.dataset.poNativeBound)return;btn.dataset.poNativeBound="1";btn.addEventListener("click",()=>deactivate(hub,custom))})}
function header(){if(posContext)return `<div class="po-title"><h2>Τιμολόγια / Παραλαβές</h2>${staffCan("invoices.value-only")?'<button type="button" data-po-value-invoice>Τιμολόγιο μόνο με αξίες</button>':""}<button data-po-refresh ${state.loading?"disabled":""}>↻ Ανανέωση</button><small data-po-refresh-status role="status">${refreshStatus()}</small></div>`;return `<div class="po-title"><div><h2>Παραγγελίες και Αγορές</h2><p>Πλήρης ροή παραγγελίας, γραμμών, markup, λιανικής και barcodes πάνω στα πραγματικά δεδομένα MyWorkStation.</p></div><div><button data-po-refresh ${state.loading?"disabled":""} aria-busy="${state.loading}">${state.loading?"Ανανέωση…":"↻ Ανανέωση"}</button><small data-po-refresh-status role="status" style="display:block;margin-top:4px">${refreshStatus()}</small></div></div><div class="po-tabs"><button data-po-tab="orders" class="${state.tab==="orders"?"active":""}">▤ Παραγγελίες</button><button data-po-tab="proposal" class="${state.tab==="proposal"?"active":""}">✣ Πρόταση παραγγελίας</button><button data-po-tab="alarm" class="${state.tab==="alarm"?"active":""}">ⓘ alarm Stock</button></div>`}
function filters(){const r=state.report||{},stores=r.stores||[],suppliers=r.suppliers||[];return `<section class="po-filter"><b>Κριτήρια αναζήτησης</b><div class="po-filter-grid${posContext?"":" po-filter-grid-central"}"><label>Προμηθευτής<select data-po-supplier><option value="">Όλοι</option>${suppliers.map(s=>`<option value="${esc(s.id)}" ${state.supplierId===s.id?"selected":""}>${esc(s.name)}${s.taxId?` · ΑΦΜ ${esc(s.taxId)}`:" · χωρίς ΑΦΜ"}</option>`).join("")}</select></label><label>Κατάστημα<select data-po-store ${posContext?"disabled":""}>${posContext?"":'<option value="">Όλα</option>'}${stores.map(s=>`<option value="${esc(s.id)}" ${state.storeId===s.id?"selected":""}>${esc(s.name)}</option>`).join("")}</select></label><label>Περιγραφή / τιμολόγιο<input data-po-q value="${esc(state.q)}" placeholder="Περιγραφή, προμηθευτής, αριθμός"></label><label>Από<input type="date" data-po-from value="${state.from}"></label><label>Έως<input type="date" data-po-to value="${state.to}"></label>${posContext?`<label>Κατάσταση<select data-po-status><option value="ALL">Όλες</option><option value="NEW" ${state.status==="NEW"?"selected":""}>Νέες</option><option value="FINAL" ${state.status==="FINAL"?"selected":""}>Οριστικές</option><option value="INVOICED" ${state.status==="INVOICED"?"selected":""}>Τιμολογημένες</option></select></label>`:""}<button class="po-search" data-po-search>⌕</button></div><div class="po-filter-actions"><button data-po-new>＋ Νέα παραγγελία</button><span></span><button data-po-export>Excel / CSV</button></div></section>`}
function orderViewButtons(){
  return `<nav class="po-tabs po-order-views" aria-label="Κατάσταση παραγγελιών">${orderViews.map(([value,label])=>{
    const selected=state.status===value;
    return `<button type="button" data-po-order-view="${value}" aria-pressed="${selected}" class="${selected?"active":""}">${label}</button>`;
  }).join("")}</nav>`;
}
function selectOrderView(root,status){
  if(state.status===status)return;
  readReportFilters(root);
  state.status=status;
  if(state.report)state.report={...state.report,orders:[],summary:null};
  state.loading=true;
  render(root);
  root.querySelector(`[data-po-order-view="${status}"]`)?.focus();
  return loadReport(root,true);
}
function ordersHtml(){const r=state.report||{},s=r.summary||{},rows=r.orders||[];return `${posContext?"":orderViewButtons()}${filters()}<div class="po-cards"><article><small>Παραγγελίες</small><b>${s.count||0}</b></article><article><small>Νέες</small><b>${s.NEW||0}</b></article><article><small>Οριστικές</small><b>${s.FINAL||0}</b></article><article><small>Τιμολογημένες</small><b>${s.INVOICED||0}</b></article><article><small>Αξία χωρίς ΦΠΑ</small><b>${money(s.net)}</b></article><article><small>Αξία με ΦΠΑ</small><b>${money(s.gross)}</b></article></div><section class="po-panel"><div class="po-panel-head"><b>Παραγγελίες</b><small>Το μολύβι ανοίγει πλήρη διόρθωση παραγγελίας.</small></div><div class="po-orders-table"><div class="row head"><span></span><span>Κατάσταση</span><span>Αρ. τιμολογίου</span><span>Προμηθευτής</span><span>Κατάστημα</span><span>Αξία (χ.ΦΠΑ)</span><span>Αξία (με ΦΠΑ)</span><span>Περιγραφή</span><span>Ενημέρωση</span><span>Χειριστής ενημέρωσης</span></div>${rows.map(o=>`<div class="row"><span><button class="icon" data-po-open="${esc(o.id)}">✎</button></span><span><b class="status ${String(o.status).toLowerCase()}">${o.awaitingInvoice?"Προς έλεγχο / Τιμολόγηση":statusLabel(o.status)}</b></span><span>${esc(o.invoiceNumber||String(o.id).slice(0,8))}</span><span><b>${esc(o.supplierName||"—")}</b><small>${o.lineCount||0} είδη</small></span><span>${esc(o.storeName||"—")}</span><strong>${money(o.totalNet)}</strong><strong>${money(o.totalGross)}</strong><span>${esc(assistantDraftDescription(o.description,o.status))}${ocrJobDiagnostic(o.ocrJob,o.status)}</span><span>${fmt(o.updatedAt)}</span><span>${esc(o.updatedByName||o.createdByName||"—")}</span></div>`).join("")||'<div class="po-empty">Δεν υπάρχουν παραγγελίες για τα κριτήρια.</div>'}</div></section>`}
async function openEditableProposal(root){
 const store=(state.report?.stores||[]).find(candidate=>candidate.id===state.storeId);
 if(!store){notify(root,"Επίλεξε κατάστημα.",true);return}
 let React,createRoot,PosOrderSuggestions;
 try{
  const [react,dom,proposal]=await Promise.all([import("react"),import("react-dom/client"),import("../store/PosOrderSuggestions.jsx")]);
  React=react.default;createRoot=dom.createRoot;PosOrderSuggestions=proposal.default;
 }catch(error){if(root.isConnected)notify(root,error.message,true);return}
 if(!root.isConnected||root.hidden||state.tab!=="proposal"||state.storeId!==store.id||
    document.querySelector("[data-po-edit-proposal-host]"))return;
 const host=document.createElement("div");
 host.dataset.poEditProposalHost="1";
 document.body.appendChild(host);
 const view=createRoot(host);
 const close=()=>{view.unmount();host.remove()};
 view.render(React.createElement(PosOrderSuggestions,{api,store,open:true,backoffice:true,onClose:close}));
}
function stockHtml(alarm=false){const rows=state.proposal||[];return `<section class="po-filter"><b>${alarm?"alarm Stock":"Πρόταση παραγγελίας"}</b><div class="po-stock-filter"><label>Κατάστημα<select data-po-proposal-store><option value="">Επίλεξε κατάστημα</option>${(state.report?.stores||[]).map(s=>`<option value="${esc(s.id)}" ${state.storeId===s.id?"selected":""}>${esc(s.name)}</option>`).join("")}</select></label><button data-po-load-stock>Ανανέωση</button>${alarm?"":'<button type="button" data-po-edit-proposal>Επεξεργασία και αποστολή πρότασης</button>'}</div></section><section class="po-panel"><div class="po-stock-table"><div class="row head"><span>Είδος</span><span>SKU</span><span>Απόθεμα</span><span>Ελάχιστο</span><span>${alarm?"Έλλειψη":"Πρόταση ποσότητας"}</span><span>Τελευταίος προμηθευτής</span><span>Τελευταίο κόστος</span></div>${rows.map(r=>`<div class="row"><span><b>${esc(r.name)}</b></span><span>${esc(r.sku||"—")}</span><strong>${r.currentStock}</strong><span>${r.minStock}</span><strong>${r.suggestedQuantity}</strong><span>${esc(r.supplierName||"—")}</span><span>${r.lastCost==null?"—":money(r.lastCost)}</span></div>`).join("")||'<div class="po-empty">Επίλεξε κατάστημα ή δεν υπάρχουν είδη κάτω από το ελάχιστο απόθεμα.</div>'}</div></section>`}
function render(root){if(!root.isConnected)return;root.innerHTML=`${header()}${state.tab==="orders"?ordersHtml():stockHtml(state.tab==="alarm")}`;if(posContext?.staffCapabilities&&!staffCan("invoices.create"))root.querySelectorAll("[data-po-new]").forEach(button=>button.remove());bindRoot(root)}
function refreshStatus(){if(state.loading)return "Φόρτωση παραγγελιών…";const base=state.lastRefresh?`Ενημερώθηκε ${esc(state.lastRefresh.toLocaleTimeString("el-GR",{timeZone:"Europe/Athens",hour12:false}))} · ${state.report?.orders?.length||0} εγγραφές`:"";if(!state.recovery)return base;if(state.recovery.error)return `${base} · Recovery error: ${esc(state.recovery.error)}`;const skipped=state.recovery.skipped||{};return `${base} · Recovery: scanned ${Number(state.recovery.scanned||0)}, started ${Number(state.recovery.recovered||0)}, no-handoff ${Number(skipped.noHandoff||0)}, non-retryable ${Number(skipped.nonRetryable||0)}`}
function updateRefreshControls(root){const button=root.querySelector("[data-po-refresh]");if(button){button.disabled=state.loading;button.setAttribute("aria-busy",String(state.loading));button.textContent=state.loading?"Ανανέωση…":"↻ Ανανέωση"}const status=root.querySelector("[data-po-refresh-status]");if(status)status.textContent=refreshStatus()}
function readReportFilters(root){for(const [key,selector] of Object.entries({from:"from",to:"to",storeId:"store",supplierId:"supplier",status:"status",q:"q"})){const input=root.querySelector(`[data-po-${selector}]`);if(input)state[key]=key==="storeId"&&posContext?posContext.store.id:input.value}}
function refreshReport(root){readReportFilters(root);return loadReport(root)}
function refreshActiveSuite(event){const hub=event.target.closest?.(".commerce-hub"),root=hub?.querySelector(".purchase-orders-suite");if(!state.active||!root||root.hidden)return;event.preventDefault();return refreshReport(root)}
async function loadReport(root,readOnly=false){
  const requestId=++reportRequestId;
  state.loading=true;updateRefreshControls(root);
  try{
    const query=qReport();query.set("_refresh",`${Date.now()}-${requestId}`);
    const report=await api(`/api/purchase-orders/report?${query}`,{cache:"no-store"});
    // Refresh also starts durable recovery for a POS handoff, without delaying
    // the list response or coupling the existing refresh contract to the worker.
    if(!posContext&&!readOnly)void api("/api/commerce/ai-reader/fast-recover",{method:"POST",body:JSON.stringify({storeId:state.storeId||""})}).then(recovery=>{if(requestId===reportRequestId&&root.isConnected){state.recovery=recovery;updateRefreshControls(root)}}).catch(error=>{if(requestId===reportRequestId&&root.isConnected){state.recovery={error:error.message};updateRefreshControls(root)}});
    if(requestId!==reportRequestId||!root.isConnected)return;
    state.report=report;state.lastRefresh=new Date();render(root);
    if(state.tab!=="orders"&&state.storeId)await loadStock(root);
  }catch(error){if(requestId===reportRequestId&&root.isConnected)notify(root,error.message,true)}
  finally{if(requestId===reportRequestId){state.loading=false;if(root.isConnected)updateRefreshControls(root)}}
}
async function loadStock(root){if(!state.storeId){state.proposal=[];render(root);return}try{state.proposal=await api(`/api/purchase-orders/stock-proposal?storeId=${encodeURIComponent(state.storeId)}`);render(root)}catch(error){notify(root,error.message,true)}}
function bindRoot(root){root.querySelector("[data-po-edit-proposal]")?.addEventListener("click",()=>openEditableProposal(root));root.querySelectorAll("[data-po-order-view]").forEach(button=>button.addEventListener("click",()=>selectOrderView(root,button.dataset.poOrderView)));root.querySelector("[data-po-refresh]")?.addEventListener("click",()=>refreshReport(root));root.querySelectorAll("[data-po-tab]").forEach(btn=>btn.addEventListener("click",async()=>{state.tab=btn.dataset.poTab;render(root);if(state.tab!=="orders")await loadStock(root)}));root.querySelector("[data-po-search]")?.addEventListener("click",()=>refreshReport(root));root.querySelectorAll("[data-po-open]").forEach(btn=>btn.addEventListener("click",()=>openOrder(root,btn.dataset.poOpen)));root.querySelector("[data-po-new]")?.addEventListener("click",()=>newOrder(root));root.querySelector("[data-po-value-invoice]")?.addEventListener("click",()=>newValueInvoice(root));root.querySelector("[data-po-export]")?.addEventListener("click",exportOrders);root.querySelector("[data-po-proposal-store]")?.addEventListener("change",e=>{state.storeId=e.target.value;loadStock(root)});root.querySelector("[data-po-load-stock]")?.addEventListener("click",()=>loadStock(root))}
function exportOrders(){const rows=state.report?.orders||[];const lines=[["Κατάσταση","Αρ. τιμολογίου","Προμηθευτής","Κατάστημα","Χωρίς ΦΠΑ","Με ΦΠΑ","Ενημέρωση"],...rows.map(o=>[o.awaitingInvoice?"Προς έλεγχο / Τιμολόγηση":statusLabel(o.status),o.invoiceNumber||"",o.supplierName||"",o.storeName||"",o.totalNet,o.totalGross,fmt(o.updatedAt)])];const csv="\ufeff"+lines.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(";")).join("\r\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download=`paraggelies_${state.from}_${state.to}.csv`;a.click();URL.revokeObjectURL(a.href)}
function newValueInvoice(root){
  if(!staffCan("invoices.value-only")||!state.report)return;
  const storeId=posContext.store.id,idempotencyKey=crypto.randomUUID(),suppliers=state.report.suppliers||[];
  const m=modal(`<div class="po-modal-title"><h2>Πρόχειρο τιμολόγιο μόνο με αξίες</h2><button type="button" data-po-close>×</button></div>
  <form class="po-form" data-value-invoice>
    <label>Προμηθευτής<select name="supplierId" required><option value="">Επίλεξε</option>${suppliers.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}${s.taxId?` · ΑΦΜ ${esc(s.taxId)}`:""}</option>`).join("")}</select></label>
    <label>Αριθμός τιμολογίου<input name="documentNumber" maxlength="80" required></label>
    <label>Ημερομηνία<input name="documentDate" type="date" value="${today()}" required></label>
    <label>Καθαρή αξία<input name="totalNet" type="number" min="0" step="0.01" required></label>
    <label>ΦΠΑ<input name="totalVat" type="number" min="0" step="0.01" required></label>
    <label>Σημείωση<input name="notes" maxlength="300"></label>
    <p role="alert"></p><button class="primary" type="submit">Καταχώριση πρόχειρου</button>
  </form>`,false);
  const form=m.querySelector("[data-value-invoice]"),button=form.querySelector("[type=submit]"),error=form.querySelector("[role=alert]");
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    if(button.disabled||!m.isConnected)return;
    const data=new FormData(form),supplierId=data.get("supplierId");
    const body={storeId,idempotencyKey,documentNumber:data.get("documentNumber"),documentDate:data.get("documentDate"),
      totalNet:Number(data.get("totalNet")),totalVat:Number(data.get("totalVat")),notes:data.get("notes").trim()||undefined};
    error.textContent="";
    button.disabled=true;
    try{
      await api(`/api/supplier-control/${encodeURIComponent(supplierId)}/value-only-invoice`,{method:"POST",body:JSON.stringify(body)});
      if(!m.isConnected)return;
      m.remove();
      notify(root,"Το πρόχειρο καταχωρίστηκε στην καρτέλα προμηθευτή.");
    }catch(e){if(m.isConnected)error.textContent=e.message}
    finally{if(m.isConnected)button.disabled=false}
  });
}
function newOrder(root){const r=state.report||{};const m=modal(`<div class="po-modal-title"><h2>Νέα παραγγελία</h2><button data-po-close>×</button></div><form class="po-form" data-new-order><label>Κατάστημα<select name="storeId" required><option value="">Επιλογή</option>${(r.stores||[]).map(s=>`<option value="${esc(s.id)}" ${state.storeId===s.id?"selected":""}>${esc(s.name)}</option>`).join("")}</select></label><label>Προμηθευτής<select name="supplierId"><option value="">Χωρίς προμηθευτή</option>${(r.suppliers||[]).map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}</select></label><label>Αρ. τιμολογίου / παραγγελίας<input name="invoiceNumber"></label><label class="wide">Περιγραφή<input name="description"></label><button class="primary">Δημιουργία παραγγελίας</button></form>`,false);m.querySelector("[data-new-order]").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const created=await api("/api/purchase-orders",{method:"POST",body:JSON.stringify({storeId:f.get("storeId"),supplierId:f.get("supplierId")||null,invoiceNumber:f.get("invoiceNumber")||null,description:f.get("description")||null})});m.remove();await loadReport(root);openOrder(root,created.id)}catch(error){alert(error.message)}})}
function entryLinesGrid(data){const columns="42px minmax(260px,1.5fr) 62px 85px 105px 82px 82px 82px 90px 72px 105px 105px 90px 105px 92px";return `<section class="po-line-grid" style="margin:0 10px 10px;border:1px solid #8eabc3;border-radius:8px;overflow:auto;max-height:44vh;background:#fff"><div style="padding:9px 11px;background:#17456a;color:#fff;font-weight:900;position:sticky;left:0">Γραμμές τιμολογίου · ${data.lines.length} είδη · Καθαρή ${money(data.totals.net)} · Σύνολο ${money(data.totals.gross)}</div><div class="row head" style="grid-template-columns:${columns};min-width:1540px"><span>#</span><span>Περιγραφή</span><span>Δώρο</span><span>Ποσότητα</span><span>Τιμή μον.</span><span>Έκπτ1%</span><span>Έκπτ2%</span><span>Έκπτ3%</span><span>ΕΦΚ</span><span>ΦΠΑ%</span><span>Καθαρή</span><span>Σύνολο</span><span>Markup%</span><span>Νέα λιανική</span><span>Ενέργειες</span></div>${data.lines.map((line,index)=>`<form class="row po-entry-row" data-entry-line="${line.id}" style="grid-template-columns:${columns};min-width:1540px"><span>${index+1}</span><input name="description" value="${esc(line.description)}" title="${esc(line.description)}"><input name="gift" type="checkbox" ${line.gift?"checked":""}><input name="quantity" type="number" step="0.001" value="${line.quantity}"><input name="unitCost" type="number" step="0.000001" value="${line.unitCost}"><input name="discount1" type="number" step="any" value="${line.discount1}"><input name="discount2" type="number" step="any" value="${line.discount2}"><input name="discount3" type="number" step="any" value="${line.discount3}"><input name="exciseTotal" type="number" step="0.000001" value="${line.exciseTotal}"><input name="vatRate" type="number" step="0.01" value="${line.vatRate}"><strong>${money(line.netAmount)}</strong><b>${money(line.grossAmount)}</b><input name="markupPercent" type="number" step="any" value="${line.markupPercent}"><input name="proposedSalePrice" type="number" step="0.01" value="${line.proposedSalePrice}"><span style="display:flex;gap:4px"><button class="primary" type="submit" title="Αποθήκευση γραμμής">✓</button><button type="button" data-entry-delete title="Διαγραφή γραμμής">🗑</button></span></form>`).join("")||'<div class="po-empty">Δεν έχουν καταχωρηθεί ακόμη είδη.</div>'}</section>`}
async function openOrder(root,id,learningNotice="",assistantSource=null,openAssistant=false,readOnly=false,expectedStoreId=null){const selectedStore=state.storeId;try{let data=await api(`/api/purchase-orders/${encodeURIComponent(id)}/detail`);if(!root.isConnected||state.storeId!==selectedStore)return;if(expectedStoreId&&data.order.storeId!==expectedStoreId)throw new Error("Το πρόχειρο δεν ανήκει στο επιλεγμένο κατάστημα.");if(!posContext?.staffCapabilities&&!readOnly&&data.order.status==="NEW"&&!Number(data.order.reopenVersion)){await api(`/api/purchase-orders/${encodeURIComponent(id)}/reconcile-ocr-total`,{method:"POST",body:"{}"});data=await api(`/api/purchase-orders/${encodeURIComponent(id)}/detail`);}if(!root.isConnected||state.storeId!==selectedStore)return;showOrder(root,{...data,learningNotice},assistantSource,openAssistant)}catch(error){notify(root,error.message,true)}}

function reopenLineAuditHtml(preview){
 const audit=preview?.lineAudit;
 if(!Array.isArray(audit?.lines))return `<p data-reopen-line-audit-unavailable role="note">Η αναλυτική προεπισκόπηση γραμμών δεν είναι διαθέσιμη.</p>`;
 const lines=audit.lines.slice(0,100);
 const count=Number.isSafeInteger(audit.lineCount)&&audit.lineCount>=0?audit.lineCount:audit.lines.length;
 const rows=lines.map((line,index)=>`<tr><td>${index+1}</td><td>${esc(line?.description??line?.name??line?.sku??line?.productId??"—")}</td><td>${esc(line?.quantity??"—")}</td><td>${esc(line?.grossAmount??line?.netAmount??"—")}</td></tr>`).join("");
 const notice=audit.truncated||count>lines.length?`<p data-reopen-line-audit-truncated role="note">Εμφανίζονται ${lines.length} από ${count} γραμμές. Η πλήρης καταγραφή διατηρείται στο ιστορικό.</p>`:"";
 return `<details data-reopen-line-audit open><summary>Γραμμές πριν από τη διόρθωση (${count})</summary><div style="max-height:26vh;overflow:auto"><table style="width:100%"><thead><tr><th>#</th><th>Περιγραφή</th><th>Ποσότητα</th><th>Αξία</th></tr></thead><tbody>${rows}</tbody></table></div>${notice}</details>`;
}
async function showReopen(root,parent,order,refresh,contextValid){
 if(parent.dataset.reopenBusy)return;parent.dataset.reopenBusy="1";
 const valid=()=>root.isConnected&&parent.isConnected&&contextValid();
 try{
  const preview=await api(`/api/purchase-orders/${encodeURIComponent(order.id)}/reopen-preview?storeId=${encodeURIComponent(order.storeId)}`);
  if(!valid())return;
  const box=modal(`<div class="po-modal-title blue"><h2>Επαναφορά για διόρθωση</h2><button data-po-close>×</button></div><form data-reopen-form style="padding:20px;display:grid;gap:16px"><p>Το ίδιο τιμολόγιο θα ανοίξει ως Νέα παραγγελία. Οι αρχικές φωτογραφίες και οι πληρωμές διατηρούνται. Δεν γίνεται επιστροφή μετρητών.</p><p>Προσωρινή αφαίρεση αξίας αγοράς: <b>${money(preview.expenseDelta)}</b>. Οι τιμές καταλόγου παραμένουν ως έχουν. Προμηθευτής και αριθμός τιμολογίου παραμένουν σταθερά· διορθώνονται οι γραμμές.</p>${reopenLineAuditHtml(preview)}<div style="max-height:40vh;overflow:auto"><table style="width:100%"><thead><tr><th>Προϊόν</th><th>Πριν</th><th>Αντιστροφή</th><th>Μετά</th></tr></thead><tbody>${preview.stockChanges.map(c=>`<tr><td>${esc(c.name)}</td><td>${compactNumber(c.before)}</td><td>${compactNumber(c.delta)}</td><td>${compactNumber(c.after)}</td></tr>`).join("")}</tbody></table></div><label>Αιτιολογία επαναφοράς<textarea name="reason" required minlength="5" maxlength="500" style="width:100%;min-height:80px;font-size:18px"></textarea></label><label><input name="confirm" type="checkbox" required> Επιβεβαιώνω την επαναφορά και τις παραπάνω αντιστροφές αποθήκης.</label>${preview.negativeStockCount?`<label style="color:#a12622"><input name="negative" type="checkbox" required> Επιβεβαιώνω ότι ${preview.negativeStockCount} είδη θα μείνουν με αρνητικό απόθεμα.</label>`:""}<p data-reopen-error role="alert"></p><div><button type="button" data-po-close>Άκυρο</button> <button type="submit" class="primary">Επαναφορά της ίδιας παραγγελίας</button></div></form>`);
  let busy=false;
  box.querySelector('form').addEventListener('submit',async event=>{
   event.preventDefault();if(busy||!valid()||!box.isConnected)return;
   const form=event.currentTarget;if(!form.reportValidity())return;
   busy=true;const submit=form.querySelector('[type=submit]');submit.disabled=true;
   try{await api(`/api/purchase-orders/${encodeURIComponent(order.id)}/reopen`,{method:"POST",body:JSON.stringify({storeId:order.storeId,version:preview.version,reason:form.elements.reason.value.trim(),confirm:form.elements.confirm.checked,confirmNegativeStock:Boolean(form.elements.negative?.checked)})});if(!valid()||!box.isConnected)return;box.remove();await refresh()}catch(error){if(valid()&&box.isConnected)form.querySelector('[data-reopen-error]').textContent=error.message}finally{busy=false;submit.disabled=false}
  });
 }catch(error){if(valid())notify(root,error.message,true)}finally{delete parent.dataset.reopenBusy}
}

async function showCancel(root,parent,order,refresh,contextValid){
 if(!canCancelInvoice()||order?.awaitingInvoice||!["FINAL","INVOICED"].includes(order?.status))return;
 if(parent.dataset.cancelBusy)return;parent.dataset.cancelBusy="1";
 const valid=()=>root.isConnected&&parent.isConnected&&contextValid();
 try{
  const preview=await api(`/api/purchase-orders/${encodeURIComponent(order.id)}/cancel-preview?storeId=${encodeURIComponent(order.storeId)}`);
  if(!valid())return;
  const box=modal(`<div class="po-modal-title blue"><h2>Ακύρωση καταχωρισμένου τιμολογίου</h2><button data-po-close>×</button></div><form data-cancel-form style="padding:20px;display:grid;gap:16px"><p>Το τιμολόγιο θα παραμείνει στο ιστορικό ως Ακυρωμένο και δεν θα είναι διαθέσιμο για επεξεργασία. Οι αρχικές φωτογραφίες και οι πληρωμές διατηρούνται. Δεν γίνεται επιστροφή μετρητών.</p><p>Αντίστροφη επίδραση αξίας αγοράς: <b>${money(preview.expenseDelta)}</b>. Οι τιμές καταλόγου παραμένουν ως έχουν. Οι αρχικές γραμμές και τα τεκμήρια παραμένουν στο ιστορικό. Δεν γίνεται αυτόματη επιστροφή πληρωμής.</p>${reopenLineAuditHtml(preview)}<div style="max-height:40vh;overflow:auto"><table style="width:100%"><thead><tr><th>Προϊόν</th><th>Πριν</th><th>Αντιστροφή</th><th>Μετά</th></tr></thead><tbody>${preview.stockChanges.map(c=>`<tr><td>${esc(c.name)}</td><td>${compactNumber(c.before)}</td><td>${compactNumber(c.delta)}</td><td>${compactNumber(c.after)}</td></tr>`).join("")}</tbody></table></div><label>Υποχρεωτική αιτιολογία ακύρωσης<textarea name="reason" required minlength="5" maxlength="500" style="width:100%;min-height:80px;font-size:18px"></textarea></label><label><input name="confirm" type="checkbox" required> Επιβεβαιώνω την οριστική ακύρωση του τιμολογίου και τις παραπάνω αντιστροφές αποθήκης.</label>${preview.negativeStockCount?`<label style="color:#a12622"><input name="negative" type="checkbox" required> Επιβεβαιώνω ότι ${preview.negativeStockCount} είδη θα μείνουν με αρνητικό απόθεμα.</label>`:""}<p data-cancel-error role="alert"></p><div><button type="button" data-po-close>Άκυρο</button> <button type="submit" class="primary">Οριστική ακύρωση τιμολογίου</button></div></form>`);
  let busy=false;
  box.querySelector('form').addEventListener('submit',async event=>{
   event.preventDefault();if(busy||!valid()||!box.isConnected)return;
   const form=event.currentTarget;if(!form.reportValidity())return;
   busy=true;const submit=form.querySelector('[type=submit]');submit.disabled=true;
   try{await api(`/api/purchase-orders/${encodeURIComponent(order.id)}/cancel`,{method:"POST",body:JSON.stringify({storeId:order.storeId,version:preview.version,reason:form.elements.reason.value.trim(),confirm:form.elements.confirm.checked,confirmNegativeStock:Boolean(form.elements.negative?.checked)})});if(!valid()||!box.isConnected)return;box.remove();await refresh()}catch(error){if(valid()&&box.isConnected)form.querySelector('[data-cancel-error]').textContent=error.message}finally{busy=false;submit.disabled=false}
  });
 }catch(error){if(valid())notify(root,error.message,true)}finally{delete parent.dataset.cancelBusy}
}

function orderGrid(data){return `<div class="po-line-grid po-order-lines"><div class="row head"><span>α/α</span><span></span><span>ΚΩΔ</span><span>Περιγραφή</span><span>Αποθήκη</span><span>Λιανική</span><span>Ποσ. αποθήκης</span><span>Καθ. αξία</span><span>ΕΦΚ</span><span>Σύνολο</span><span>% ΦΠΑ</span><span>Σύνολο με ΦΠΑ</span><span>Αρχική αξία</span><span>Έκπτ1</span><span>Έκπτ2</span><span>Έκπτ3</span><span>markup</span><span>προτ. λιανική</span><span>Κατηγορία</span><span>εσωτ. ΚΩΔ</span><span>BarCode</span></div>${data.lines.map((l,i)=>`<div class="row ${l.productId?"po-line-linked":""}"><span title="${l.productId?"Αντιστοιχίστηκε με προϊόν καταλόγου":"Εκκρεμεί αντιστοίχιση"}">${l.productId?"<b class='po-line-check' aria-label='Αντιστοιχίστηκε'>✓</b> ":""}${i+1}</span><span><button class="icon" data-line-edit="${l.id}">✎</button><button class="icon danger" data-line-delete="${l.id}">🗑</button></span><button class="link" data-product-card="${l.id}">${esc(l.supplierCode||"—")}</button><button class="link desc" data-product-card="${l.id}">${esc(l.description)}${pendingPack(l)?'<small style="display:block;color:#92400e;font-weight:700">ΔΙΟΡΘΩΣΕΙΣ · Τεμάχια ανά κιβώτιο</small>':""}${data.order.status==="NEW"&&/^myDATA\s*•\s*MARK\b/i.test(data.order.description||"")&&!l.productId?'<small style="display:block;color:#92400e;font-weight:700">Χρειάζεται αντιστοίχιση προϊόντος</small>':""}</button><span>${l.currentStock??0}</span><b title="Λιανική καταλόγου ή τιμολογίου">${money(Number(l.currentSalePrice)>0?l.currentSalePrice:l.proposedSalePrice)}</b><strong title="Ποσότητα τιμολογίου: ${compactNumber(l.quantity,3)}">${pendingPack(l)?"—":stockQuantityLabel(l)}</strong><span title="Τιμή συσκευασίας: ${Number(l.unitCost).toFixed(6)}">${pendingPack(l)?"—":stockUnitCost(l).toFixed(6)}</span><span>${money(l.exciseTotal)}</span><strong>${money(l.netAmount)}</strong><span>${compactNumber(l.vatRate,4)}</span><b>${money(l.grossAmount)}</b><span>${(Number(l.initialUnitCost||0)/Math.max(1,Number(l.stockUnitsPerInvoiceUnit||1))).toFixed(6)}</span><span>${compactNumber(l.discount1)}</span><span>${compactNumber(l.discount2)}</span><span>${compactNumber(l.discount3)}</span><b title="Markup επί του μικτού κόστους ανά τεμάχιο αποθήκης">${compactNumber(l.productId&&!l.gift&&!pendingPack(l)&&stockQuantity(l)>0&&Number(l.grossAmount)>0&&(Number(l.proposedSalePrice)>0||Number(l.currentSalePrice)>0)?((Number(l.proposedSalePrice)>0?Number(l.proposedSalePrice):Number(l.currentSalePrice))*stockQuantity(l)/Number(l.grossAmount)-1)*100:l.markupPercent,2)}%</b><strong>${money(l.proposedSalePrice)}</strong><span>${esc(l.categoryName||"—")}</span><span>${esc(l.sku||"—")}</span><button class="link" data-barcodes="${l.productId||""}" data-reference-line="${l.id}">${esc(l.primaryBarcode||"—")}</button></div>`).join("")||'<div class="po-empty">Δεν υπάρχουν γραμμές. Πάτησε «Νέο είδος».</div>'}<div class="row totals"><span></span><span></span><span></span><b>${data.lines.length} είδη</b><span></span><span></span><strong>ανά τεμάχιο</strong><span></span><span></span><strong>${money(data.totals.net)}</strong><span></span><strong>${money(data.totals.gross)}</strong></div></div>`}
function chooseInvoiceStockLines(lines){
  const dialog=document.createElement("dialog");
  dialog.innerHTML=`<form method="dialog">
    <h2>Κίνηση αποθήκης</h2>
    <p>Επίλεξε τις γραμμές που πρέπει να προστεθούν στην αποθήκη. Άφησε κενές όσες μετρήθηκαν ήδη στην απογραφή.</p>
    <fieldset><legend>Είδη τιμολογίου</legend>
      <button type="button" data-stock-all>Επιλογή όλων</button>
      <button type="button" data-stock-none>Αποεπιλογή όλων</button>
      <ol>${lines.map(line=>`<li><label><input type="checkbox" name="stockLine" value="${esc(line.id)}"> ${esc(line.description)} × ${esc(line.quantity)}</label></li>`).join("")}</ol>
    </fieldset>
    <button value="cancel" autofocus>Επιστροφή</button>
    <button value="post" disabled>Καταχώριση τιμολογίου</button>
  </form>`;
  document.body.appendChild(dialog);
  return new Promise(resolve=>{
    const inputs=[...dialog.querySelectorAll('[name="stockLine"]')];
    const submit=dialog.querySelector('[value="post"]');
    dialog.querySelector("[data-stock-all]").onclick=()=>{
      inputs.forEach(input=>input.checked=true);
      submit.disabled=false;
    };
    dialog.querySelector("[data-stock-none]").onclick=()=>{
      inputs.forEach(input=>input.checked=false);
      submit.disabled=false;
    };
    dialog.addEventListener("change",()=>{submit.disabled=false});
    dialog.querySelector("form").addEventListener("submit",event=>{
      if(event.submitter===submit&&submit.disabled)event.preventDefault();
    });
    dialog.addEventListener("close",()=>{
      const excluded=inputs.filter(input=>!input.checked).map(input=>input.value);
      resolve(dialog.returnValue==="post"?excluded:null);
      dialog.remove();
    },{once:true});
    dialog.showModal();
  });
}
function showOrder(root,data,assistantSource=null,openAssistant=false){if(!root.isConnected)return;const orderContext=posContext,selectedStore=state.storeId;const o=data.order,manualPhotos=(!posContext&&allowed()||staffCan("invoice-ai.photo-preview")&&staffCan("invoices.edit"))&&o.status==="NEW"&&!o.awaitingInvoice&&!o.sourceType&&!o.sourceDocumentId,locked=o.status==="INVOICED"||o.status==="CANCELLED"||o.awaitingInvoice===true,identityLocked=locked||Number(o.reopenVersion)>0;const m=modal(`<div class="po-modal-title blue"><div><h2>Διόρθωση παραγγελίας ${esc(o.invoiceNumber||String(o.id).slice(0,8))}</h2><b>[${esc(o.supplierName||(o.mydataIssuerName?`${o.mydataIssuerName} · Προς αντιστοίχιση`:"Χωρίς προμηθευτή"))}]</b></div><button data-po-close>×</button></div><div class="po-order-meta"><label>Προμηθευτής<select data-order-supplier ${identityLocked||o.sourceType==="POS_OCR_DRAFT"&&!posContext?"disabled":""}><option value="">Χωρίς</option>${(state.report?.suppliers||[]).map(s=>`<option value="${esc(s.id)}" ${o.supplierId===s.id?"selected":""}>${esc(s.name)}${s.taxId?` · ΑΦΜ ${esc(s.taxId)}`:" · ΑΦΜ μη καταχωρισμένο"}</option>`).join("")}</select></label><label>Αρ. τιμολογίου<input data-order-invoice value="${esc(o.invoiceNumber||"")}" ${identityLocked?"disabled":""}></label><label>Περιγραφή<input data-order-description value="${esc(assistantDraftDescription(o.description,o.status))}" ${locked?"disabled":""}></label><span class="po-status-large">${o.awaitingInvoice?"Προς έλεγχο / Τιμολόγηση":statusLabel(o.status)}</span><button data-save-meta ${locked?"disabled":""}>Αποθήκευση στοιχείων</button></div>${data.learningNotice?`<div role="status" style="padding:10px;color:#176b32">${esc(data.learningNotice)}</div>`:""}<div class="po-order-toolbar">${manualPhotos?'<button type="button" data-order-photos>Φωτογραφίες → Βοηθός</button><input type="file" data-order-photo-files accept="image/jpeg,image/png,image/webp" multiple hidden>':""}${o.sourceType==="POS_OCR_DRAFT"&&o.status==="NEW"&&(!Number(o.reopenVersion)||(!posContext&&allowed()))?`<button data-invoice-assistant type="button">✦ Βοηθός τιμολογίου</button>`:""}${(!posContext&&allowed()||staffCan("invoices.mydata-prefill"))&&!locked&&o.status==="NEW"&&!data.lines.length&&/^myDATA\s*•\s*MARK\b/i.test(o.description||"")?'<button type="button" data-mydata-prefill>Συμπλήρωση από myDATA</button>':""}${o.sourceType==="POS_OCR_DRAFT"&&!Number(o.reopenVersion)&&(!posContext&&allowed()||staffCan("invoices.correct-supplier"))?'<button data-correct-supplier type="button">Διόρθωση προμηθευτή</button>':""}<button data-add-line ${locked?"disabled":""}>＋ Νέο είδος</button><button data-delete-all ${locked?"disabled":""}>🗑 Διαγραφή Όλων</button><span></span>${!o.awaitingInvoice&&(o.status==="FINAL"||o.status==="INVOICED")&&(!posContext&&allowed()||staffCan("invoices.reopen"))?'<button data-reopen>↶ Επαναφορά για διόρθωση</button>':""}${!o.awaitingInvoice&&(o.status==="FINAL"||o.status==="INVOICED")&&canCancelInvoice()?'<button type="button" class="danger" data-cancel-invoice>Ακύρωση παραστατικού</button>':""}${o.awaitingInvoice&&(!posContext&&allowed()||staffCan("invoices.approve"))?'<button data-return-to-draft>↶ Επιστροφή για διόρθωση</button>':""}<button data-finalize ${o.status!=="NEW"?"disabled":""}>✓ Οριστικοποίηση</button><button data-email>✉ Αποστολή email</button>${!posContext||posContext.staffCapabilities?`<button data-invoice ${o.status!=="FINAL"?"disabled":""}>● Τιμολόγηση</button>`:""}</div>${orderGrid(data)}<div class="po-order-footer"><button data-po-close>← Επιστροφή</button><button data-order-export>Excel / CSV</button></div>`);if(o.status==="CANCELLED")m.querySelectorAll("[data-email],[data-line-edit],[data-line-delete]").forEach(node=>node.remove());if(posContext){m.querySelector("[data-email]")?.remove();m.querySelectorAll("[data-product-card],[data-barcodes]").forEach(button=>{button.disabled=true;button.title="Διαχείριση καταλόγου από το BackOffice"})}if(posContext?.staffCapabilities){
  const edit=staffCan('invoices.edit')&&o.status==='NEW',approve=staffCan('invoices.approve');
  const canDeleteAll=edit&&!locked&&data.lines.length<=1000&&data.lines.every(line=>Boolean(line.updatedAt))&&
    (o.sourceType==="POS_OCR_DRAFT"||!o.sourceType&&!o.sourceDocumentId);
  if(!canDeleteAll)m.querySelector("[data-delete-all]")?.remove();
  if(!staffCan('invoice-ai.original-preview'))m.querySelector('[data-invoice-assistant]')?.remove();
  if(!staffCan('invoices.email'))m.querySelector('[data-email]')?.remove();
  const linkedLines=new Set(data.lines.filter(line=>line.productId).map(line=>line.id));
  m.querySelectorAll('[data-product-card],[data-barcodes]').forEach(node=>{
    const lineId=node.dataset.referenceLine||node.dataset.productCard;
    if(!staffCan("products.read")||!linkedLines.has(lineId)){
      const text=document.createElement("span");text.textContent=node.textContent;node.replaceWith(text);return;
    }
    node.disabled=false;
    node.title="Προβολή είδους και barcodes στο κατάστημα";
  });
  if(!edit||locked)m.querySelector("[data-add-line]")?.remove();
  if(edit&&!locked&&o.sourceType==="POS_OCR_DRAFT"&&o.sourceDocumentId&&!Number(o.reopenVersion)){
    const button=document.createElement("button");
    button.type="button";
    button.textContent="Έλεγχος συνόλου OCR";
    m.querySelector("[data-add-line]")?.before(button);
    button.addEventListener("click",async()=>{
      if(!m.isConnected||posContext!==orderContext||state.storeId!==selectedStore)return;
      if(!confirm("Επιβεβαιώνεις τον έλεγχο του συνόλου OCR; Αν συμφωνεί με το πρωτότυπο, θα διορθωθούν τα ποσά ΦΠΑ των γραμμών."))return;
      button.disabled=true;
      try{
        const result=await api(`/api/purchase-orders/${encodeURIComponent(o.id)}/reconcile-ocr-total`,{method:"POST",body:JSON.stringify({confirmed:true})});
        if(!m.isConnected||posContext!==orderContext||state.storeId!==selectedStore)return;
        if(result.repaired)await refresh();
        else alert("Δεν προέκυψε ασφαλής αυτόματη διόρθωση. Έλεγξε το πρωτότυπο και τις γραμμές.");
      }catch(error){if(m.isConnected&&posContext===orderContext&&state.storeId===selectedStore)alert(error.message)}
      finally{button.disabled=false}
    });
  }

  if(!edit){m.querySelectorAll('[data-line-edit],[data-line-delete],[data-save-meta]').forEach(node=>node.remove());m.querySelectorAll('.po-order-meta input,.po-order-meta select').forEach(node=>node.disabled=true);}
  if(!approve)m.querySelectorAll('[data-finalize],[data-invoice]').forEach(node=>node.remove());
}const refresh=async()=>{m.remove();await loadReport(root);openOrder(root,o.id,"",assistantSource)};const launchAssistant=(uploaded=null)=>import("../../invoice-assistant-pos-client.js").then(({openPosInvoiceAssistant})=>{if(!root.isConnected||!m.isConnected||posContext!==orderContext||state.storeId!==selectedStore)return;return openPosInvoiceAssistant(o.id,o,refresh,orderContext?api:null,assistantSource,()=>root.isConnected&&m.isConnected&&posContext===orderContext&&state.storeId===selectedStore,uploaded,{requireCatalogMatch:Boolean(orderContext?.staffCapabilities)})}).catch(error=>alert(error.message));m.querySelector("[data-invoice-assistant]")?.addEventListener("click",()=>launchAssistant());if(openAssistant&&m.querySelector("[data-invoice-assistant]"))launchAssistant();
  installMyDataPrintedEconomicsNotice(m,data.mydataPrintedEconomics,{orderId:o.id,storeId:o.storeId});
  const photoInput=m.querySelector("[data-order-photo-files]");
  m.querySelector("[data-order-photos]")?.addEventListener("click",()=>photoInput.click());
  photoInput?.addEventListener("change",async()=>{
    const files=[...photoInput.files].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
    photoInput.value="";
    if(!files.length)return;
    if(files.length>5||files.reduce((size,file)=>size+file.size,0)>7_000_000||
      files.some(file=>!["image/jpeg","image/png","image/webp"].includes(file.type))){
      alert("Επίλεξε έως 5 φωτογραφίες JPEG, PNG ή WebP, έως 7 MB συνολικά.");
      return;
    }
    try{
      const pages=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve({filename:file.name,mimeType:file.type,contentData:reader.result});
        reader.onerror=()=>reject(new Error("Δεν ήταν δυνατή η ανάγνωση της φωτογραφίας."));
        reader.readAsDataURL(file);
      })));
      await launchAssistant({storeId:o.storeId,manualPhotos:pages});
    }catch(error){alert(error.message)}
  });
  m.querySelector("[data-mydata-prefill]")?.addEventListener("click",async event=>{
    const button=event.currentTarget;
    button.disabled=true;
    try{
      const result=await api(`/api/commerce/documents/mydata/orders/${encodeURIComponent(o.id)}/prefill`,{method:"POST",body:JSON.stringify({storeId:o.storeId||selectedStore})});
      if(!m.isConnected||!root.isConnected||state.storeId!==selectedStore)return;
      if(result.reconciliationRequired)throw new Error("Χρειάζεται έλεγχος της σύνδεσης με το υπάρχον πρόχειρο.");
      if(!result.lineCount)throw new Error("Το myDATA δεν έδωσε επαρκή στοιχεία για τη συμπλήρωση. Έλεγξε τις γραμμές, τη συσκευασία ή τα σύνολα.");
      await refresh();
    }catch(error){if(m.isConnected&&state.storeId===selectedStore)alert(error.message)}
    finally{button.disabled=false}
  });
  m.querySelector("[data-correct-supplier]")?.addEventListener("click",()=>showPurchaseSupplierCorrection({root,parent:m,order:o,suppliers:state.report?.suppliers||[],api,modal,esc,money,refresh,staff:Boolean(posContext?.staffCapabilities),lookup:!posContext?.staffCapabilities||staffCan("invoices.supplier-lookup"),officialLookup:!posContext?.staffCapabilities||staffCan("invoices.supplier-lookup-official"),create:!posContext?.staffCapabilities||staffCan("invoices.supplier-create"),current:()=>posContext===orderContext&&state.storeId===selectedStore}));
  m.querySelector("[data-return-to-draft]")?.addEventListener("click",async()=>{try{await api(`/api/purchase-orders/${o.id}`,{method:"PATCH",body:JSON.stringify({status:"NEW",returnForCorrection:true,expectedReopenVersion:Number(o.reopenVersion||0)})});await refresh()}catch(error){alert(error.message)}});
  m.querySelector("[data-reopen]")?.addEventListener("click",()=>showReopen(root,m,o,refresh,()=>posContext===orderContext&&state.storeId===selectedStore));
   m.querySelector("[data-cancel-invoice]")?.addEventListener("click",()=>showCancel(root,m,o,refresh,()=>posContext===orderContext&&state.storeId===selectedStore));
  m.querySelector("[data-save-meta]")?.addEventListener("click",async()=>{try{await api(`/api/purchase-orders/${o.id}`,{method:"PATCH",body:JSON.stringify({supplierId:m.querySelector("[data-order-supplier]").value||null,invoiceNumber:m.querySelector("[data-order-invoice]").value||null,description:m.querySelector("[data-order-description]").value||null})});await refresh()}catch(e){alert(e.message)}});
  m.querySelector("[data-add-line]")?.addEventListener("click",()=>addLine(root,o.id,m));m.querySelectorAll("[data-line-edit]").forEach(btn=>btn.addEventListener("click",()=>editLine(root,data,btn.dataset.lineEdit,m)));const showReference=lineId=>staffProductReference(root,m,o,lineId,()=>posContext===orderContext&&state.storeId===selectedStore,refresh);
  m.querySelectorAll("[data-product-card]").forEach(btn=>btn.addEventListener("click",()=>orderContext?.staffCapabilities?showReference(btn.dataset.productCard):productCard(root,data,btn.dataset.productCard,m)));
  m.querySelectorAll("[data-barcodes]").forEach(btn=>btn.addEventListener("click",()=>{
    if(orderContext?.staffCapabilities)return showReference(btn.dataset.referenceLine);
    if(btn.dataset.barcodes)barcodes(root,btn.dataset.barcodes);
  }));m.querySelectorAll("[data-line-delete]").forEach(btn=>btn.addEventListener("click",async()=>{if(!confirm("Διαγραφή γραμμής;"))return;try{await api(`/api/purchase-orders/${o.id}/lines/${btn.dataset.lineDelete}`,{method:"DELETE"});await refresh()}catch(e){alert(e.message)}}));
  m.querySelector("[data-delete-all]")?.addEventListener("click",async()=>{if(!data.lines.length||!confirm("Διαγραφή ΟΛΩΝ των γραμμών της παραγγελίας;"))return;try{
    if(orderContext?.staffCapabilities){
      if(!m.isConnected||!root.isConnected||posContext!==orderContext||state.storeId!==selectedStore)return;
      const snapshot=data.lines.map(line=>({id:line.id,updatedAt:new Date(line.updatedAt).toISOString()}));
      await api(`/api/purchase-orders/${encodeURIComponent(o.id)}/assistant-line-transfer`,{method:"POST",body:JSON.stringify({
        storeId:o.storeId,sourceDocumentId:o.sourceDocumentId??null,reopenVersion:Number(o.reopenVersion||0),
        snapshot,updates:[],additions:[],deletions:snapshot.map(line=>line.id)
      })});
    }else for(const l of data.lines)await api(`/api/purchase-orders/${o.id}/lines/${l.id}`,{method:"DELETE"});
    await refresh()
  }catch(e){alert(e.message)}});m.querySelector("[data-finalize]")?.addEventListener("click",async()=>{if(!data.lines.length)return alert("Η παραγγελία δεν έχει είδη.");if(posContext?.staffCapabilities&&!confirm("Επιβεβαιώνεις την οριστικοποίηση των ελεγμένων γραμμών;"))return;try{await api(`/api/purchase-orders/${o.id}`,{method:"PATCH",body:JSON.stringify({status:"FINAL",expectedReopenVersion:Number(o.reopenVersion||0)})});await refresh()}catch(e){alert(e.message)}});m.querySelector("[data-invoice]")?.addEventListener("click",async event=>{
  const button=event.currentTarget;
  button.disabled=true;
  try{
    const payload={status:"INVOICED",expectedReopenVersion:Number(o.reopenVersion||0)};
    if(o.awaitingInvoice===true){
      const excludedStockLineIds=await chooseInvoiceStockLines(data.lines.filter(line=>line.productId));
      if(excludedStockLineIds===null)return;
      if(excludedStockLineIds.length)payload.excludeStockLineIds=excludedStockLineIds;
    }else if(posContext?.staffCapabilities&&!confirm("Επιβεβαιώνεις την ολοκλήρωση της τιμολόγησης;"))return;
    await api(`/api/purchase-orders/${o.id}`,{method:"PATCH",body:JSON.stringify(payload)});
    await refresh();
  }catch(error){alert(error.message)}finally{button.disabled=false}
});m.querySelector("[data-email]")?.addEventListener("click",async()=>{try{if(orderContext?.staffCapabilities&&(!m.isConnected||!root.isConnected||posContext!==orderContext||state.storeId!==selectedStore||!confirm("Αποστολή στο καταχωρημένο email του προμηθευτή;")))return;const sent=await api(`/api/purchase-orders/${encodeURIComponent(o.id)}/email`,{method:"POST",body:orderContext?.staffCapabilities?JSON.stringify({confirmed:true}):"{}"});alert(`Στάλθηκε στο ${sent.recipient}.`)}catch(e){alert(e.message)}});m.querySelector("[data-order-export]")?.addEventListener("click",()=>exportLines(data));}
function exportLines(data){const rows=[["ΚΩΔ","Περιγραφή","Ποσότητα","Τιμή μονάδος","Έκπτ1","Έκπτ2","Έκπτ3","ΕΦΚ","ΦΠΑ","Σύνολο","Markup","Προτεινόμενη λιανική","Barcode"],...data.lines.map(l=>[l.supplierCode||"",l.description,l.quantity,l.unitCost,l.discount1,l.discount2,l.discount3,l.exciseTotal,l.vatRate,l.grossAmount,l.markupPercent,l.proposedSalePrice,l.primaryBarcode||""])];const csv="\ufeff"+rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(";")).join("\r\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download=`paraggelia_${data.order.invoiceNumber||data.order.id}.csv`;a.click();URL.revokeObjectURL(a.href)}
async function addLine(root,orderId,parent){const m=modal(`<div class="po-modal-title blue"><div><h2>Νέο είδος παραγγελίας</h2><b>Πλήρης εμπορική καταχώριση</b></div><button data-po-close>×</button></div><div class="po-product-search"><input data-product-q placeholder="Περιγραφή / SKU / Barcode"><button data-product-search>Αναζήτηση</button></div><form class="po-line-form" data-add-form><label class="wide">Είδος<select name="productId" data-product-results required><option value="">Κάνε αναζήτηση</option></select></label><label>Ποσότητα<div class="step"><button type="button" data-minus>−</button><input name="quantity" type="number" step="0.001" value="1" required><button type="button" data-plus>＋</button></div></label><label>Τιμή μονάδος χ.ΦΠΑ<input name="unitCost" type="number" step="0.000001" value="0" required></label><label>ΔΩΡΟ<input name="gift" type="checkbox"></label><label>Έκπτωση1 (%)<input name="discount1" type="number" step="any" value="0"></label><label>Έκπτωση2 (%)<input name="discount2" type="number" step="any" value="0"></label><label>Έκπτωση3 (%)<input name="discount3" type="number" step="any" value="0"></label><label>Σύνολο ΕΦΚ<input name="exciseTotal" type="number" step="0.000001" value="0"></label><label>ΦΠΑ %<input name="vatRate" type="number" step="0.01" value="24"></label><div class="po-live"><span>Τελική αγορά / μονάδα <b data-final-buy>0.000000</b></span><span>Σύνολο χ.ΦΠΑ <b data-net-total>0,00 €</b></span><span>Σύνολο με ΦΠΑ <b data-gross-total>0,00 €</b></span></div><label>MarkUp (%)<div class="calc"><input name="markupPercent" type="number" step="any" value="0"><button type="button" data-calc-markup>⇢ Νέα λιανική</button></div></label><label>(Νέα) Λιανική<div class="calc"><input name="proposedSalePrice" type="number" step="0.01" value="0"><button type="button" data-calc-retail>⇢ MarkUp</button></div></label><div class="po-line-actions"><button type="button" data-po-close>← Επιστροφή</button><button class="primary" type="submit">✓ Καταχώρηση</button></div></form><div data-entry-lines></div>`);m.dataset.invoiceSearchOrderId=orderId;let products=[],mode="NONE";const form=m.querySelector("[data-add-form]"),workspace=m.querySelector(".po-modal,.pos-po-modal");workspace.style.width="min(1850px,99vw)";workspace.style.maxHeight="98vh";const refreshEntryLines=async()=>{const data=await api(`/api/purchase-orders/${encodeURIComponent(orderId)}/detail`),host=m.querySelector("[data-entry-lines]");host.innerHTML=entryLinesGrid(data);host.querySelectorAll("[data-entry-line]").forEach(row=>{row.addEventListener("submit",async event=>{event.preventDefault();const values=new FormData(row),button=row.querySelector('button[type="submit"]');button.disabled=true;try{await api(`/api/purchase-orders/${orderId}/lines/${row.dataset.entryLine}`,{method:"PATCH",body:JSON.stringify({description:String(values.get("description")||"").trim(),gift:values.get("gift")==="on",quantity:Number(values.get("quantity")),unitCost:Number(values.get("unitCost")),discount1:Number(values.get("discount1")),discount2:Number(values.get("discount2")),discount3:Number(values.get("discount3")),exciseTotal:Number(values.get("exciseTotal")),vatRate:Number(values.get("vatRate")),markupPercent:Number(values.get("markupPercent")),proposedSalePrice:Number(values.get("proposedSalePrice")),calculateFrom:"NONE"})});await refreshEntryLines();notify(workspace,"Η γραμμή ενημερώθηκε.")}catch(error){alert(error.message);button.disabled=false}});row.querySelector("[data-entry-delete]").addEventListener("click",async()=>{if(!confirm("Διαγραφή γραμμής;"))return;try{await api(`/api/purchase-orders/${orderId}/lines/${row.dataset.entryLine}`,{method:"DELETE"});await refreshEntryLines();notify(workspace,"Η γραμμή διαγράφηκε.")}catch(error){alert(error.message)}})})};refreshEntryLines();let closing=false;m.addEventListener("click",async event=>{if((event.target===m||event.target.closest("[data-po-close]"))&&!closing){closing=true;parent.remove();await openOrder(root,orderId)}},{capture:true});m.querySelector("[data-product-search]").addEventListener("click",async()=>{try{const query=encodeURIComponent(m.querySelector("[data-product-q]").value);
products=posContext?.staffCapabilities?(await api(`/api/commerce/purchase-orders/${encodeURIComponent(orderId)}/catalog-matches?q=${query}`)).rows:await api(`/api/commerce/products?q=${query}`);m.querySelector("[data-product-results]").innerHTML='<option value="">Επιλογή</option>'+products.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.sku||"")} · ${money(p.salePrice)}</option>`).join("")}catch(e){alert(e.message)}});form.querySelector("[data-product-results]").addEventListener("change",e=>{const p=products.find(x=>x.id===e.target.value);if(p){if(posContext?.staffCapabilities&&p.vatRate!=null)form.elements.vatRate.value=p.vatRate;form.elements.proposedSalePrice.value=Number(p.salePrice||0).toFixed(2);mode="RETAIL";calcDraft(form,mode)}});form.querySelector("[data-minus]").onclick=()=>{form.elements.quantity.value=Math.max(.001,num(form.elements.quantity.value)-1);calcDraft(form,mode)};form.querySelector("[data-plus]").onclick=()=>{form.elements.quantity.value=num(form.elements.quantity.value)+1;calcDraft(form,mode)};form.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.matches("input"))e.preventDefault()});form.querySelectorAll("input").forEach(input=>{if(input.name==="markupPercent")input.addEventListener("input",()=>{mode="MARKUP";calcDraft(form,mode)});else if(input.name==="proposedSalePrice")input.addEventListener("input",()=>{mode="RETAIL";calcDraft(form,mode)});else if(!input.matches('[name^="discountAmount"],[name="finalUnitCost"]'))input.addEventListener("input",()=>calcDraft(form,mode==="MARKUP"||mode==="RETAIL"?mode:"NONE"))});form.querySelector("[data-calc-markup]").onclick=()=>{mode="MARKUP";calcDraft(form,mode)};form.querySelector("[data-calc-retail]").onclick=()=>{mode="RETAIL";calcDraft(form,mode)};calcDraft(form,mode);form.addEventListener("submit",async e=>{e.preventDefault();if(!e.submitter?.matches("button.primary[type=submit]"))return;const f=new FormData(form),p=products.find(x=>x.id===f.get("productId"));if(!p)return alert("Επίλεξε είδος.");const submit=e.submitter;submit.disabled=true;try{await api(`/api/purchase-orders/${orderId}/lines`,{method:"POST",body:JSON.stringify({productId:p.id,description:p.name,quantity:Number(f.get("quantity")),unitCost:Number(f.get("unitCost")),discount1:Number(f.get("discount1")),discount2:Number(f.get("discount2")),discount3:Number(f.get("discount3")),exciseTotal:Number(f.get("exciseTotal")),vatRate:Number(f.get("vatRate")),gift:form.elements.gift.checked,markupPercent:Number(f.get("markupPercent")),proposedSalePrice:Number(f.get("proposedSalePrice")),calculateFrom:mode})});form.reset();products=[];mode="NONE";form.querySelector("[data-product-results]").innerHTML='<option value="">Κάνε αναζήτηση</option>';calcDraft(form,mode);const search=m.querySelector("[data-product-q]");search.value="";search.focus();notify(m.querySelector(".po-modal,.pos-po-modal"),"Η γραμμή καταχωρήθηκε. Συνέχισε με το επόμενο είδος.");await refreshEntryLines()}catch(err){alert(err.message)}finally{submit.disabled=false}})}
function enhanceDiscountEditor(form){if(form.dataset.discountAmountsReady)return;form.dataset.discountAmountsReady="1";for(let i=1;i<=3;i++){const percent=form.querySelector(`[name=discount${i}]`),label=percent?.closest("label");if(!label)continue;label.insertAdjacentHTML("afterend",`<label>Έκπτωση${i} (€)<input name="discountAmount${i}" type="text" inputmode="decimal" value="0"></label>`)}const finalDisplay=form.querySelector("[data-final-buy]");if(finalDisplay){const input=document.createElement("input");input.name="finalUnitCost";input.type="text";input.inputMode="decimal";input.value="0";input.dataset.finalBuyInput="1";input.style.cssText="width:130px;padding:6px;font-weight:900;text-align:right";finalDisplay.replaceWith(input)}form.querySelectorAll('[name^="discountAmount"]').forEach(input=>input.addEventListener("input",()=>calcDraft(form,form.dataset.priceMode||"NONE","AMOUNT")));form.querySelector("[name=finalUnitCost]")?.addEventListener("input",()=>calcDraft(form,form.dataset.priceMode||"NONE","FINAL"))}
function discountDraft(form,quantity,cost,source){const percentInputs=[1,2,3].map(i=>form.querySelector(`[name=discount${i}]`)),amountInputs=[1,2,3].map(i=>form.querySelector(`[name=discountAmount${i}]`)),initial=Math.max(0,quantity*cost);if(source==="FINAL"){const pack=form.elements.invoiceUnit?.value==="PACKAGE"?Math.max(1,num(form.elements.stockUnitsPerInvoiceUnit?.value)):1,target=Math.min(initial,Math.max(0,num(form.querySelector("[name=finalUnitCost]").value)*quantity*pack)),totalDiscount=Math.max(0,initial-target);percentInputs[0].value=(initial?totalDiscount/initial*100:0).toFixed(8);percentInputs[1].value="0";percentInputs[2].value="0";source="PERCENT"}let running=initial;for(let i=0;i<3;i++){let percent,amount;if(source==="AMOUNT"){amount=Math.min(running,Math.max(0,num(amountInputs[i].value)));percent=running>0?amount/running*100:0;percentInputs[i].value=percent.toFixed(8)}else{percent=Math.min(100,Math.max(0,num(percentInputs[i].value)));amount=running*percent/100;amountInputs[i].value=amount.toFixed(6)}running=Math.max(0,running-amount)}return {net:running,netUnit:running/quantity}}
function calcDraft(form,mode,discountSource="PERCENT"){enhanceDiscountEditor(form);form.dataset.priceMode=mode;const quantity=Math.max(.0001,num(form.querySelector("[name=quantity]").value)),cost=Math.max(0,num(form.querySelector("[name=unitCost]").value)),discount=discountDraft(form,quantity,cost,discountSource),net=discount.net,excise=Math.max(0,num(form.querySelector("[name=exciseTotal]").value)),vat=Math.max(0,num(form.querySelector("[name=vatRate]").value)),vatBase=net+excise,vatAmount=vatBase*vat/100,gross=vatBase+vatAmount,pack=form.elements.invoiceUnit?.value==="PACKAGE"?Math.max(1,num(form.elements.stockUnitsPerInvoiceUnit?.value)):1,netPiece=net/(quantity*pack),grossPiece=gross/(quantity*pack);let markup=num(form.querySelector("[name=markupPercent]").value),retail=num(form.querySelector("[name=proposedSalePrice]").value);if(mode==="MARKUP"){retail=grossPiece*(1+markup/100);form.querySelector("[name=proposedSalePrice]").value=retail.toFixed(2)}if(mode==="RETAIL"){markup=grossPiece?((retail/grossPiece)-1)*100:0;form.querySelector("[name=markupPercent]").value=markup.toFixed(3)}form.querySelector("[name=finalUnitCost]").value=netPiece.toFixed(6);form.querySelector("[data-net-total]").textContent=money(net);form.querySelector("[data-gross-total]").textContent=money(gross);return mode}
function editLine(root,data,lineId,parent){const l=data.lines.find(x=>x.id===lineId);if(!l)return;
const lineContext=posContext;
const delegated=Boolean(lineContext?.staffCapabilities);
const canCreateOnLine=delegated&&data.order.status==="NEW"&&staffCan("invoices.edit")&&staffCan("products.create");
const isPackage=l.invoiceUnit==="PACKAGE"||Number(l.stockUnitsPerInvoiceUnit||1)>1;parent.style.display="none";const m=modal(`<div class="po-modal-title blue"><div><h2>Διόρθωση γραμμής τιμολογίου</h2><b>${esc(l.description)}</b></div><button data-po-close>×</button></div><div class="po-line-match" style="border:1px solid #b8cfdf;background:#f4f9fc;border-radius:8px;padding:10px;margin-bottom:10px"><b>Αντιστοίχιση προϊόντος</b><div style="display:flex;gap:7px;margin-top:7px"><input data-product-q value="${esc(l.description)}" placeholder="Περιγραφή / SKU / Barcode" style="flex:1"><button type="button" data-product-search>Αναζήτηση</button></div><div data-product-results style="margin-top:7px"></div></div><form class="po-line-form"><label style="grid-column:1/-1">Περιγραφή<input name="description" maxlength="250" value="${esc(l.description)}"></label><fieldset data-new-product-barcode style="grid-column:1/-1;border:1px solid #b8cfdf;border-radius:8px;padding:10px"><legend><b>Barcode νέου είδους</b></legend><div style="display:flex;flex-wrap:wrap;gap:14px"><label><input type="radio" name="barcodeMode" value="PROVIDED"> Έχω barcode είδους</label><label><input type="radio" name="barcodeMode" value="GENERATED"> Δημιουργία εσωτερικού MyWorkStation</label><label><input type="radio" name="barcodeMode" value="NONE" checked> Χωρίς barcode προς το παρόν</label></div><div style="display:flex;gap:8px;margin-top:8px"><input name="barcode" inputmode="numeric" maxlength="18" placeholder="Σκάναρε ή γράψε barcode (6–18 ψηφία)" disabled style="flex:1"><button type="button" data-generate-barcode hidden>Generate Barcode</button></div></fieldset><label>Ποσότητα τιμολογίου<div class="step"><button type="button" data-minus>−</button><input name="quantity" type="number" step="0.001" value="${l.quantity}"><button type="button" data-plus>＋</button></div></label><label>Τιμή μονάδος τιμολογίου<input name="unitCost" type="number" step="0.000001" value="${l.unitCost}"></label><label>Μονάδα τιμολογίου<select name="invoiceUnit"><option value="PIECE" ${isPackage?"":"selected"}>ΤΜΧ</option><option value="PACKAGE" ${isPackage?"selected":""}>ΚΒ / Συσκευασία</option></select></label><label>Τεμάχια ανά ΚΒ<input name="stockUnitsPerInvoiceUnit" type="number" min="1" step="1" value="${pendingPack(l)?"":Math.max(1,Number(l.stockUnitsPerInvoiceUnit||1))}" ${isPackage?"required":"disabled"}></label><label>ΔΩΡΟ<input name="gift" type="checkbox" ${l.gift?"checked":""}></label><label>Έκπτωση1 (%)<input name="discount1" type="number" step="any" value="${l.discount1}"></label><label>Έκπτωση2 (%)<input name="discount2" type="number" step="any" value="${l.discount2}"></label><label>Έκπτωση3 (%)<input name="discount3" type="number" step="any" value="${l.discount3}"></label><label>Σύνολο ΕΦΚ<input name="exciseTotal" type="number" step="0.000001" value="${l.exciseTotal}"></label><label>ΦΠΑ %<input name="vatRate" type="number" step="0.01" value="${l.vatRate}"></label><div class="po-live"><span>Τελική αγορά / τεμάχιο <b data-final-buy>—</b></span><span>Σύνολο χ.ΦΠΑ <b data-net-total>—</b></span><span>Σύνολο με ΦΠΑ <b data-gross-total>—</b></span></div><label>MarkUp (%)<div class="calc"><input name="markupPercent" type="number" step="any" value="${l.markupPercent}"><button type="button" data-calc-markup>⇢ Νέα λιανική</button></div></label><label>(Νέα) Λιανική<div class="calc"><input name="proposedSalePrice" type="number" step="0.01" value="${l.proposedSalePrice}"><button type="button" data-calc-retail>⇢ MarkUp</button></div></label><div class="po-line-actions"><button type="button" data-po-close>← Επιστροφή</button><button class="primary" type="submit">✓ Καταχώρηση</button></div></form>`);const form=m.querySelector(".po-line-form"),invoiceUnit=form.elements.invoiceUnit,packSize=form.elements.stockUnitsPerInvoiceUnit,results=m.querySelector("[data-product-results]"),query=m.querySelector("[data-product-q]"),search=m.querySelector("[data-product-search]"),barcodePanel=form.querySelector("[data-new-product-barcode]"),barcodeInput=form.elements.barcode,generateButton=form.querySelector("[data-generate-barcode]");if(delegated){
  if(!canCreateOnLine){
    barcodePanel.querySelectorAll("label,input,button").forEach(node=>node.hidden=true);
    const hint=document.createElement("p");
    hint.textContent="Για νέο είδος απαιτείται δικαίωμα δημιουργίας ειδών. Μπορείς να αντιστοιχίσεις υπάρχον είδος του καταστήματος.";
    barcodePanel.appendChild(hint);
  }else{
    form.querySelector('[name="barcodeMode"][value="NONE"]').closest("label").hidden=true;
  }
}let mode=Number(l.proposedSalePrice)>0?"RETAIL":"NONE",selectedProductId=l.productId||"",retailBeforeSelection=null;barcodePanel.hidden=Boolean(selectedProductId);const restore=()=>{parent.style.display=""};m.addEventListener("click",event=>{if(event.target===m||event.target.closest("[data-po-close]"))setTimeout(()=>{if(!m.isConnected)restore()},0)},{capture:true});const taxonomy=installInvoiceLineTaxonomy({form,order:data.order,line:l,api,esc,enabled:!posContext?.staffCapabilities||staffCan("invoices.edit")});const productMatcher=installInvoiceProductMatcher({modal:m,orderId:data.order.id,storeId:data.order.storeId,lineId:l.id,description:l.description,api,esc,money,generateOnSave:canCreateOnLine,onSelect:(product,{revalidated=false}={})=>{selectedProductId=product?.id||"";barcodePanel.hidden=Boolean(selectedProductId);if(revalidated)return;taxonomy.selectProduct(selectedProductId);if(product){if(!retailBeforeSelection)retailBeforeSelection={value:form.elements.proposedSalePrice.value,mode};const price=product.salePrice;if(price!=null&&String(price).trim()!==""&&Number.isFinite(Number(price))&&Number(price)>=0){form.elements.proposedSalePrice.value=Number(price).toFixed(2);mode="RETAIL";calcDraft(form,mode)}}else if(retailBeforeSelection){form.elements.proposedSalePrice.value=retailBeforeSelection.value;mode=retailBeforeSelection.mode;retailBeforeSelection=null;calcDraft(form,mode)}}});const syncPack=()=>{const enabled=invoiceUnit.value==="PACKAGE";packSize.disabled=!enabled;if(!enabled)packSize.value="1"};invoiceUnit.addEventListener("change",syncPack);form.querySelectorAll('[name="barcodeMode"]').forEach(radio=>radio.addEventListener("change",()=>{const barcodeMode=form.elements.barcodeMode.value;barcodeInput.disabled=barcodeMode==="NONE"||canCreateOnLine&&barcodeMode==="GENERATED";barcodeInput.readOnly=barcodeMode==="GENERATED";generateButton.hidden=canCreateOnLine||barcodeMode!=="GENERATED";if(barcodeMode==="PROVIDED"){barcodeInput.value="";barcodeInput.focus()}else if(barcodeMode==="NONE"||canCreateOnLine)barcodeInput.value=""}));generateButton.addEventListener("click",()=>{barcodeInput.value=generateInternalBarcode();barcodeInput.dispatchEvent(new Event("input",{bubbles:true}))});syncPack();calcDraft(form,Number(l.proposedSalePrice)>0?"RETAIL":mode);form.querySelector("[data-minus]").onclick=()=>{form.elements.quantity.value=Math.max(.001,num(form.elements.quantity.value)-1);calcDraft(form,mode)};form.querySelector("[data-plus]").onclick=()=>{form.elements.quantity.value=num(form.elements.quantity.value)+1;calcDraft(form,mode)};form.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.matches("input"))e.preventDefault()});form.querySelectorAll("input").forEach(input=>{if(input.name==="markupPercent")input.addEventListener("input",()=>{mode="MARKUP";calcDraft(form,mode)});else if(input.name==="proposedSalePrice")input.addEventListener("input",()=>{mode="RETAIL";calcDraft(form,mode)});else if(!input.matches('[name^="discountAmount"],[name="finalUnitCost"],[name="barcode"],[name="barcodeMode"]'))input.addEventListener("input",()=>calcDraft(form,mode==="MARKUP"||mode==="RETAIL"?mode:"NONE"))});form.querySelector("[data-calc-markup]").onclick=()=>{mode="MARKUP";calcDraft(form,mode)};form.querySelector("[data-calc-retail]").onclick=()=>{mode="RETAIL";calcDraft(form,mode)};form.addEventListener("submit",async e=>{e.preventDefault();if(!e.submitter?.matches("button.primary[type=submit]"))return;const submit=e.submitter;if(submit.disabled)return;submit.disabled=true;
try{
  const initialBarcodeMode=form.elements.barcodeMode.value;
  const initialBarcode=barcodeInput.value.trim();
  if(!selectedProductId&&delegated){
    if(!canCreateOnLine)throw new Error("Επίλεξε υπάρχον είδος του καταστήματος ή ζήτησε δικαίωμα δημιουργίας ειδών.");
    if(!["PROVIDED","GENERATED"].includes(initialBarcodeMode))throw new Error("Επίλεξε υπάρχον είδος, σκάναρε το barcode του νέου είδους ή επίλεξε δημιουργία εσωτερικού barcode.");
  }
  await productMatcher.beforeSave();
  const productTaxonomy=await taxonomy.values();
  if(!m.isConnected||!root.isConnected||posContext!==lineContext)return;
  const currentMode=form.elements.barcodeMode.value;
  if(!selectedProductId&&delegated&&(currentMode!==initialBarcodeMode||barcodeInput.value.trim()!==initialBarcode))throw new Error("Η επιλογή barcode άλλαξε. Πάτησε ξανά Καταχώρηση.");const f=new FormData(form),selectedUnit=String(f.get("invoiceUnit")||"PIECE"),selectedPack=selectedUnit==="PACKAGE"?num(form.elements.stockUnitsPerInvoiceUnit.value||1):1,values={description:String(f.get("description")||"").trim(),quantity:num(f.get("quantity")),unitCost:num(f.get("unitCost")),invoiceUnit:selectedUnit,stockUnitsPerInvoiceUnit:selectedPack,discount1:num(f.get("discount1")),discount2:num(f.get("discount2")),discount3:num(f.get("discount3")),exciseTotal:num(f.get("exciseTotal")),vatRate:num(f.get("vatRate")),gift:form.elements.gift.checked,markupPercent:num(f.get("markupPercent")),proposedSalePrice:num(f.get("proposedSalePrice")),calculateFrom:mode};if(!delegated&&!selectedProductId&&f.get("barcodeMode")==="GENERATED"&&!String(f.get("barcode")||"").trim())return alert("Πάτησε Generate Barcode πριν από την καταχώρηση.");const saved=selectedProductId?await api(`/api/purchase-orders/${data.order.id}/lines/${l.id}`,{method:"PATCH",body:JSON.stringify({productId:selectedProductId,...values,...(productTaxonomy?{productTaxonomy}:{})})}):await api(`/api/commerce/purchase-orders/${data.order.id}/ocr-lines/${l.id}/create-product`,{method:"POST",body:JSON.stringify({...(productTaxonomy||{}),name:values.description,supplierCode:l.supplierCode||null,barcodeMode:String(f.get("barcodeMode")||"NONE"),...(delegated?{storeId:data.order.storeId,...(currentMode==="PROVIDED"?{barcode:String(f.get("barcode")||"").trim()}: {})}:{barcode:String(f.get("barcode")||"").trim()||null}),quantity:values.quantity,gift:values.gift,unitCost:values.unitCost,invoiceUnit:values.invoiceUnit,unitsPerPackage:values.stockUnitsPerInvoiceUnit,discount1:values.discount1,discount2:values.discount2,discount3:values.discount3,exciseTotal:values.exciseTotal,vatRate:values.vatRate,markupPercent:values.markupPercent,salePrice:values.proposedSalePrice})});m.remove();parent.remove();const learning=saved.centralLearning;const notice=learning?.learned?`Η διόρθωση αποθηκεύτηκε. Εκμάθηση προμηθευτή για όλα τα καταστήματα: ${learning.columnsLearned?"στήλες και μονάδες":"μονάδες/αντιστοίχιση· οι στήλες χρειάζονται επιβεβαίωση"}.`:saved.mappingLearned?"Η διόρθωση και η αντιστοίχιση προμηθευτή αποθηκεύτηκαν για την εταιρεία.":"Η διόρθωση αποθηκεύτηκε.";await openOrder(root,data.order.id,notice)}catch(err){alert(err.message)}finally{submit.disabled=false}})}
function productCard(root,data,lineId,parent){const l=data.lines.find(x=>x.id===lineId);if(!l)return;const m=modal(`<div class="po-modal-title blue"><div><h2>Διόρθωση κωδικού τιμολογίου</h2><b>${esc(l.description)}</b></div><button data-po-close>×</button></div><form class="po-form" data-card-form><label>Προμηθευτής<input value="${esc(data.order.supplierName||"—")}" disabled></label><label>Κωδικός τιμολογίου<input name="supplierCode" value="${esc(l.supplierCode||"")}"></label><label class="wide">Περιγραφή<input name="description" value="${esc(l.description)}"></label><label>Λιανική<input name="salePrice" type="number" step="0.01" value="${l.currentSalePrice||0}"></label><label>Barcode<input name="primaryBarcode" value="${esc(l.primaryBarcode||"")}"></label><button class="primary">✓ Καταχώρηση</button></form>`,false);m.querySelector("[data-card-form]").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await api(`/api/purchase-orders/${data.order.id}/lines/${l.id}/product-card`,{method:"PATCH",body:JSON.stringify({supplierCode:f.get("supplierCode")||null,description:f.get("description"),productName:f.get("description"),salePrice:Number(f.get("salePrice")||0),primaryBarcode:f.get("primaryBarcode")||undefined})});m.remove();parent.remove();await openOrder(root,data.order.id)}catch(err){alert(err.message)}})}
async function staffProductReference(root,parent,order,lineId,current,refresh){
  const active=()=>root.isConnected&&parent.isConnected&&current()&&staffCan("products.read");
  if(!active()||parent.dataset.productReferenceBusy)return;
  parent.dataset.productReferenceBusy="1";
  try{
    const data=await api(`/api/purchase-orders/${encodeURIComponent(order.id)}/lines/${encodeURIComponent(lineId)}/product-reference`);
    if(!active())return;
    if(data.orderId!==order.id||data.lineId!==lineId||data.storeId!==order.storeId)throw Error("Η καρτέλα αφορά άλλο κατάστημα ή γραμμή.");
    const {product,barcodes}=data;
    const editable=order.status==="NEW"&&!order.awaitingInvoice&&staffCan("invoices.edit");
    const companyCard=editable&&posContext?.canEditCompanyProduct;
    const companyBarcodes=editable&&posContext?.canEditCompanyBarcodes;
    const reference=modal(`<div class="po-modal-title blue"><h2>Καρτέλα είδους στο κατάστημα</h2><button data-po-close>×</button></div>
      <div class="po-form"><p><strong>${esc(product.name)}</strong> · ${esc(product.sku||"—")}</p>
      <p>Λιανική: ${product.salePrice==null?"—":money(product.salePrice)} · Απόθεμα: ${compactNumber(product.currentStock,3)}</p>
      <h3>Barcodes</h3><ul>${barcodes.length?barcodes.map(row=>`<li>${esc(row.barcode)} · ${compactNumber(row.unitMultiplier,3)} τεμ. ${esc(row.name||"")}</li>`).join(""):"<li>Δεν υπάρχουν barcodes.</li>"}</ul>
      ${companyCard?'<button type="button" data-company-product-card>Διόρθωση εταιρικής καρτέλας</button>':""}
      ${companyBarcodes?'<button type="button" data-company-product-barcodes>Διαχείριση εταιρικών barcodes</button>':""}</div>`);
    for(const kind of ["card","barcodes"]){
      const button=reference.querySelector(`[data-company-product-${kind}]`);
      button?.addEventListener("click",async()=>{
        if(button.disabled)return;
        button.disabled=true;
        try{await editStaffInvoiceCompanyProduct(order,lineId,kind,product.id,()=>active()&&reference.isConnected,async()=>{reference.remove();await refresh()})}
        catch(error){if(active()&&reference.isConnected)alert(error.message)}
        finally{button.disabled=false}
      });
    }
  }catch(error){if(active())alert(error.message)}
  finally{delete parent.dataset.productReferenceBusy}
}

async function editStaffInvoiceCompanyProduct(order,lineId,kind,productId,active,refresh){
  const path=`/api/purchase-orders/${encodeURIComponent(order.id)}/lines/${encodeURIComponent(lineId)}/product-company-${kind}`;
  const data=await api(path);
  if(!active())return;
  if(data.orderId!==order.id||data.lineId!==lineId||data.storeId!==order.storeId||data.product?.id!==productId)
    throw Error("Η αντιστοίχιση του είδους άλλαξε. Άνοιξε ξανά τη γραμμή.");
  const isCard=kind==="card",product=data.product;
  const priceInput=(value,required)=>`<input type="number" name="salePrice" min="0" max="1000000" step="any"
    value="${esc(value??"")}" ${required?"required":""}>`;
  const barcodeEditor=(row=null)=>`<form class="po-form" data-company-product="barcode">
    <label>Barcode<input name="barcode" required minlength="3" maxlength="80" value="${esc(row?.barcode||"")}"></label>
    <label>Τεμάχια<input type="number" name="unitMultiplier" step="any" max="100000" required value="${esc(row?.unitMultiplier??1)}"></label>
    <label>Περιγραφή<input name="name" maxlength="120" value="${esc(row?.name||"")}"></label>
    <label>Τιμή barcode${priceInput(row?.salePrice,false)}</label>
    <button type="submit">${row?"Αποθήκευση barcode":"Προσθήκη barcode"}</button>
    ${row?'<button type="button" data-delete-company-barcode>Αφαίρεση barcode</button>':""}
    <p role="alert"></p></form>`;
  const editor=modal(`<div class="po-modal-title blue"><h2>${esc(product.name)} · Εταιρικός κατάλογος</h2><button data-po-close>×</button></div>
    <p>Οι αλλαγές αφορούν την κοινή καρτέλα της εταιρείας.</p>
    ${isCard?`<form class="po-form" data-company-product="card">
      <label>Ονομασία είδους<input name="name" required maxlength="180" value="${esc(product.name)}"></label>
      <label>Βασική λιανική${priceInput(product.salePrice,true)}</label><button type="submit">Αποθήκευση εταιρικής καρτέλας</button>
      <p role="alert"></p></form>`:barcodeEditor()+data.barcodes.map(barcodeEditor).join("")}`);
  let busy=false;
  const commit=async(form,body)=>{
    if(busy||!active()||!editor.isConnected)return;
    if(!confirm("Επιβεβαιώνεις την αλλαγή στον εταιρικό κατάλογο;"))return;
    busy=true;
    const error=form.querySelector('[role="alert"]'),controls=[...editor.querySelectorAll('button')];
    controls.forEach(button=>button.disabled=true);
    error.textContent="";
    try{
      const result=await api(path,{method:"PATCH",body:JSON.stringify({productId,confirmed:true,...body})});
      if(!active()||!editor.isConnected)return;
      if(result.ok!==true||result.storeId!==order.storeId||result.productId!==productId||result.lineId!==lineId||result.orderId!==order.id)
        throw Error("Δεν επιβεβαιώθηκε η αποθήκευση.");
      editor.remove();
      await refresh();
    }catch(e){if(active()&&editor.isConnected)error.textContent=e.message}
    finally{busy=false;controls.forEach(button=>button.disabled=false)}
  };
  [...editor.querySelectorAll("[data-company-product]")].forEach((form,index)=>{
    const row=isCard?null:data.barcodes[index-1],revision=row?{id:row.id,expectedUpdatedAt:row.updatedAt}:{};
    form.addEventListener("submit",event=>{
      event.preventDefault();
      const value=name=>form.elements[name].value;
      if(isCard)return commit(form,{name:value("name"),salePrice:Number(value("salePrice")),expectedUpdatedAt:product.updatedAt});
      return commit(form,{...revision,action:row?"EDIT":"ADD",barcode:value("barcode"),unitMultiplier:Number(value("unitMultiplier")),
        salePrice:value("salePrice")===""?null:Number(value("salePrice")),name:value("name")||null});
    });
    form.querySelector("[data-delete-company-barcode]")?.addEventListener("click",()=>commit(form,{...revision,action:"DELETE"}));
  });
}

async function barcodes(root,productId){try{const data=await api(`/api/purchase-orders/products/${productId}/barcodes`);const m=modal(`<div class="po-modal-title blue"><div><h2>Εναλλακτικοί κωδικοί Barcodes είδους</h2><b>${esc(data.product.name)}</b></div><button data-po-close>×</button></div><div class="po-barcode-table"><div class="row head"><span></span><span>BARCODE</span><span>Πώληση</span><span>Συσκευασία</span><span>Τιμή τεμαχίου</span><span>Ονομασία</span><span>Ενημέρωση</span></div>${data.barcodes.map(b=>`<div class="row" data-barcode-row="${b.id}"><span><button data-barcode-save="${b.id}">✎</button><button data-barcode-delete="${b.id}">🗑</button></span><input data-bc="barcode" value="${esc(b.barcode)}"><input data-bc="salePrice" type="number" step="0.01" value="${b.salePrice??""}"><input data-bc="unitMultiplier" type="number" step="0.001" value="${b.unitMultiplier}"><span>${b.salePrice==null?"—":money(num(b.salePrice)/Math.max(1,b.unitMultiplier))}</span><input data-bc="name" value="${esc(b.name||"")}"><span>${fmt(b.updatedAt||b.createdAt)}</span></div>`).join("")||'<div class="po-empty">Δεν υπάρχουν εναλλακτικά barcodes.</div>'}</div><form class="po-new-barcode" data-new-barcode><input name="barcode" placeholder="Νέο BARCODE" required><input name="salePrice" type="number" step="0.01" placeholder="Πώληση"><input name="unitMultiplier" type="number" step="0.001" value="1"><input name="name" placeholder="Ονομασία"><button class="primary">＋ Νέο BARCODE</button></form>`);m.querySelectorAll("[data-barcode-save]").forEach(btn=>btn.addEventListener("click",async()=>{const row=m.querySelector(`[data-barcode-row="${btn.dataset.barcodeSave}"]`),get=name=>row.querySelector(`[data-bc="${name}"]`).value;try{await api(`/api/purchase-orders/products/${productId}/barcodes/${btn.dataset.barcodeSave}`,{method:"PATCH",body:JSON.stringify({barcode:get("barcode"),salePrice:get("salePrice")===""?null:Number(get("salePrice")),unitMultiplier:Number(get("unitMultiplier")),name:get("name")||null})});m.remove();barcodes(root,productId)}catch(e){alert(e.message)}}));m.querySelectorAll("[data-barcode-delete]").forEach(btn=>btn.addEventListener("click",async()=>{if(!confirm("Διαγραφή barcode;"))return;try{await api(`/api/purchase-orders/products/${productId}/barcodes/${btn.dataset.barcodeDelete}`,{method:"DELETE"});m.remove();barcodes(root,productId)}catch(e){alert(e.message)}}));m.querySelector("[data-new-barcode]").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await api(`/api/purchase-orders/products/${productId}/barcodes`,{method:"POST",body:JSON.stringify({barcode:f.get("barcode"),salePrice:f.get("salePrice")===""?null:Number(f.get("salePrice")),unitMultiplier:Number(f.get("unitMultiplier")||1),name:f.get("name")||null})});m.remove();barcodes(root,productId)}catch(err){alert(err.message)}})}catch(error){alert(error.message)}}
function install(){if(!allowed())return;document.querySelectorAll(".commerce-hub").forEach(hub=>{const strip=hub.querySelector(".commerce-module-strip");if(!strip)return;let btn=strip.querySelector("[data-purchase-orders-launch]");if(!btn){btn=document.createElement("button");btn.type="button";btn.dataset.purchaseOrdersLaunch="1";btn.innerHTML="▤ Παραγγελίες & Αγορές";strip.appendChild(btn);btn.addEventListener("click",()=>activate(hub,btn))}bindNative(strip,hub,btn);if(state.active&&!hub.querySelector(".purchase-orders-suite"))activate(hub,btn)})}
const monthlyInspections=new WeakMap();
async function inspectMonthlyOrder(hub,detail){
 const storeId=detail.storeId,orderId=detail.orderId;
 if(typeof storeId!=="string"||!storeId||typeof orderId!=="string"||!orderId||hub.dataset.activeStoreId!==storeId)return;
 const previous=monthlyInspections.get(hub);previous?.modal?.remove();
 const current={serial:(previous?.serial||0)+1,modal:null};monthlyInspections.set(hub,current);
 const valid=()=>hub.isConnected&&hub.dataset.activeStoreId===storeId&&monthlyInspections.get(hub)===current;
 try{
  const data=await api(`/api/purchase-orders/${encodeURIComponent(orderId)}/detail?`+new URLSearchParams({inspection:"true",storeId}));
  if(!valid())return;
  if(data.readOnly!==true||data.navigationOnly!==true||data.order?.id!==orderId||data.order?.storeId!==storeId||!Array.isArray(data.lines))throw Error("Δεν επιβεβαιώθηκε το υπάρχον παραστατικό του επιλεγμένου καταστήματος.");
  const order=data.order,lines=data.lines,candidate=detail.basis==="HEADER_CANDIDATE";
  const m=modal(`<div class="po-modal-title blue"><div><h2>Υπάρχουσα αγορά · ${esc(order.invoiceNumber||order.id)}</h2><b>${esc(order.supplierName||order.mydataIssuerName||"Προμηθευτής προς έλεγχο")}</b></div><button type="button" data-po-close aria-label="Κλείσιμο προβολής αγοράς">×</button></div><p>Μόνο προβολή του υπάρχοντος παραστατικού. Δεν δημιουργείται νέο πρόχειρο ή πληρωμή.</p>${candidate?'<p role="status" style="background:#fff5dd;padding:10px">Πιθανή αντιστοίχιση από τα στοιχεία του παραστατικού. Η σύνδεση παραμένει προς έλεγχο· δεν έγινε συγχώνευση.</p>':""}<p><b>Κατάσταση:</b> ${esc(order.status==="MERGED"?"Συγχωνευμένη":statusLabel(order.status))} · <b>Κατάστημα:</b> ${esc(order.storeName||storeId)}</p><div style="overflow:auto"><table><thead><tr><th>Προϊόν / περιγραφή</th><th>Ποσότητα</th><th>Μονάδα</th><th>Καθαρή αξία</th><th>ΦΠΑ</th><th>Σύνολο</th></tr></thead><tbody>${lines.map(line=>`<tr><td>${esc(line.productName||line.description||"—")}</td><td>${esc(compactNumber(line.quantity))}</td><td>${esc(line.invoiceUnit==="PACKAGE"?"Συσκευασία":"Τεμάχιο")}</td><td>${money(line.netAmount)}</td><td>${money(line.vatAmount)}</td><td>${money(line.grossAmount)}</td></tr>`).join("")}</tbody></table></div>${!lines.length?'<p>Δεν βρέθηκαν αποθηκευμένες γραμμές στην υπάρχουσα αγορά.</p>':""}<p><b>Σύνολο υπάρχουσας αγοράς:</b> ${money(data.totals?.gross)}</p>`);
  m.dataset.monthlyOrderInspection=orderId;m.setAttribute("role","dialog");m.setAttribute("aria-label","Προβολή υπάρχουσας αγοράς");current.modal=m;m.querySelector("[data-po-close]").focus();
  const observer=new MutationObserver(()=>{if(!m.isConnected){observer.disconnect();return}if(!valid()){observer.disconnect();m.remove()}});
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-active-store-id']});
 }catch(error){if(valid())notify(hub,error.message,true)}
}

export function installPurchaseOrdersSuite(){install();if(suiteListenersInstalled)return;suiteListenersInstalled=true;document.addEventListener("purchase-orders:refresh",refreshActiveSuite);document.addEventListener("purchase-orders:open",async event=>{const hub=event.target.closest?.(".commerce-hub")||document.querySelector(".commerce-hub"),button=hub?.querySelector("[data-purchase-orders-launch]");if(!hub||!button||!event.detail?.orderId)return;if(event.detail.monthlyAudit===true){if(event.target.closest?.(".commerce-hub")===hub)await inspectMonthlyOrder(hub,event.detail);return;}const readOnly=event.detail.readOnly===true||event.detail.navigationOnly===true;state.tab="orders";state.storeId=event.detail.storeId||"";state.supplierId="";state.q="";state.status="NEW";state.from="2000-01-01";state.to=today();activate(hub,button,readOnly);const root=hub.querySelector(".purchase-orders-suite");try{await openOrder(root,event.detail.orderId,"",event.detail.assistantSource||null,event.detail.openAssistant===true,readOnly,event.detail.navigationOnly===true?state.storeId:null)}catch(error){notify(root,error.message,true)}});const observer=new MutationObserver(install);observer.observe(document.documentElement,{childList:true,subtree:true})}

export function mountPosPurchaseOrders(root,{request,store,staffCapabilities=null,canEditCompanyProduct=false,canEditCompanyBarcodes=false}){
 if(posContext)throw new Error("Η οθόνη τιμολογίων είναι ήδη ανοιχτή.");
 const context={request,store,staffCapabilities,canEditCompanyProduct,canEditCompanyBarcodes,staffBusy:false,controller:new AbortController()};posContext=context;posClosed=false;
 Object.assign(state,{active:true,tab:"orders",storeId:store.id,supplierId:"",q:"",status:"ALL",from:"2000-01-01",to:today(),report:null,proposal:[],loading:false,lastRefresh:null,recovery:null});
 root.classList.add("purchase-orders-suite");root.dataset.posInvoiceWorkspace="1";
 render(root);void loadReport(root);
 return ()=>{if(posContext!==context)return;context.controller.abort();reportRequestId++;posContext=null;posClosed=true;state.active=false;state.report=null;root.innerHTML="";document.querySelectorAll("[data-pos-invoice-modal]").forEach(node=>node.remove())};
}

