import {greeceDateInput} from "../../../../shared/greece-time.mjs";
import {
  validateRecordedPayrollExpensePeriod,validateRecordedPayrollExpenseReport,
  buildRecordedPayrollExpenseCsv,renderRecordedPayrollExpensePage,escapeRecordedPayrollExpenseHtml
} from "./recordedPayrollExpenseView.js";

const sessions=new WeakMap();
let active=null;
const esc=escapeRecordedPayrollExpenseHtml;
const element=value=>Boolean(value&&value.nodeType===1&&typeof value.closest==="function");

function identity(){
  try{
    const token=localStorage.getItem("token"),rawUser=localStorage.getItem("user"),user=JSON.parse(rawUser||"null");
    return token&&["OWNER","SUPER_ADMIN"].includes(user?.role)?{token,rawUser}:null;
  }catch{return null;}
}
function visible(element){
  if(!element?.isConnected)return false;
  for(let node=element;node&&node.nodeType===1;node=node.parentElement){
    if(node.hidden||node.getAttribute("aria-hidden")==="true")return false;
    const style=window.getComputedStyle(node);
    if(style.display==="none"||style.visibility==="hidden"||style.visibility==="collapse")return false;
  }
  return true;
}
function context(root){
  const auth=identity(),hub=root?.closest(".commerce-hub"),storeId=root?.dataset.reportStoreId;
  const selected=root?.querySelector("[data-kr-store]");
  if(!auth||!hub||!storeId||hub.dataset.reportStoreId!==storeId||!selected||selected.value!==storeId||root.dataset.salesV4!=="1"||!visible(root))return null;
  const label=hub.dataset.reportStoreName||selected.selectedOptions[0]?.textContent||storeId;
  return {auth,hub,storeId,label};
}
function current(session){
  const actual=context(session.root);
  return !session.closed&&session.dialog.open&&session.root.contains(session.dialog)&&sessions.get(session.root)===session&&active===session&&actual&&actual.hub===session.hub&&actual.storeId===session.storeId&&actual.auth.token===session.auth.token&&actual.auth.rawUser===session.auth.rawUser;
}
function revoke(session,url){
  const timer=session.urls.get(url);if(timer!==undefined)window.clearTimeout(timer);
  session.urls.delete(url);try{URL.revokeObjectURL(url);}catch{}
}
function close(session,{restoreFocus=false}={}){
  if(!session||session.closed)return;
  const focus=restoreFocus&&current(session)?session.launch:null;
  session.closed=true;session.request++;
  session.abort?.abort();session.abort=null;session.snapshot=null;
  session.observer?.disconnect();session.observer=null;
  window.removeEventListener("storage",session.storage);
  window.removeEventListener("pagehide",session.pagehide);
  for(const url of [...session.urls.keys()])revoke(session,url);
  if(active===session)active=null;
  sessions.delete(session.root);
  try{if(session.dialog.open)session.dialog.close();}catch{}
  session.dialog.remove();
  if(focus?.isConnected)focus.focus();
}
export function closeRecordedPayrollExpenseDialog(root){close(sessions.get(root));}

function controls(session){
  session.dialog.querySelector("[data-rpe-export]").disabled=session.loading||!session.snapshot;
  session.dialog.querySelector("[data-rpe-search]").disabled=session.loading;
}
function status(session,message,error=false){
  const element=session.dialog.querySelector("[data-rpe-status]");
  element.textContent=message;element.className=error?"kr-error":"kr-info";
}
function clearResult(session){
  session.snapshot=null;session.page=0;session.dialog.querySelector("[data-rpe-results]").replaceChildren();controls(session);
}
function invalidateDraft(session){
  session.abort?.abort();session.abort=null;session.request++;session.loading=false;clearResult(session);
  status(session,"Το διάστημα άλλαξε. Πατήστε Αναζήτηση για νέο εφαρμοσμένο αποτέλεσμα.");
}
function appliedMatches(session,applied){
  const from=applied.from??applied.period?.calendarFrom,to=applied.to??applied.period?.calendarTo;
  if(session.dialog.querySelector("[data-rpe-from]")?.value===from&&session.dialog.querySelector("[data-rpe-to]")?.value===to)return true;
  invalidateDraft(session);return false;
}
async function search(session){
  if(!current(session)){close(session);return;}
  session.abort?.abort();session.abort=null;
  const request=++session.request;
  session.loading=false;clearResult(session);
  let applied;
  try{
    applied=validateRecordedPayrollExpensePeriod({storeId:session.storeId,from:session.dialog.querySelector("[data-rpe-from]").value,to:session.dialog.querySelector("[data-rpe-to]").value,timeZone:"Europe/Athens"});
  }catch(error){status(session,error.message||"Επίλεξε ολοκληρωμένες ημέρες στην ώρα Ελλάδας.",true);return;}
  const controller=new AbortController();session.abort=controller;session.loading=true;controls(session);
  status(session,"Φόρτωση καταγεγραμμένων εξόδων…");
  const query=new URLSearchParams({storeId:applied.storeId,from:applied.from,to:applied.to,timeZone:applied.timeZone});
  let message="Δεν ολοκληρώθηκε η αναζήτηση. Δοκιμάστε ξανά.";
  try{
    const response=await fetch(`/api/reports/recorded-payroll-expenses?${query}`,{headers:{Authorization:`Bearer ${session.auth.token}`},signal:controller.signal,cache:"no-store"});
    if(!current(session)){close(session);return;}if(request!==session.request||!appliedMatches(session,applied))return;
    if(!response.ok){
      // Do not display arbitrary server/SQL/proxy error payloads.
      message=response.status===403?"Δεν επιτρέπεται η αναφορά. Ελέγξτε ρόλο, άδεια και ενεργά πακέτα του καταστήματος.":response.status===401?"Η σύνδεση έληξε. Συνδεθείτε ξανά.":response.status===503?"Η πηγή της αναφοράς δεν είναι διαθέσιμη. Δοκιμάστε αργότερα.":"Η αναφορά δεν ολοκληρώθηκε. Ελέγξτε το διάστημα και δοκιμάστε ξανά.";
      throw new Error("report request failed");
    }
    const data=await response.json();
    if(!current(session)){close(session);return;}if(request!==session.request||!appliedMatches(session,applied))return;
    let snapshot;
    try{snapshot=validateRecordedPayrollExpenseReport(data,applied);}
    catch{message="Δεν επιβεβαιώθηκε η ακεραιότητα της αναφοράς. Δεν επιτρέπεται εξαγωγή.";throw new Error("invalid report");}
    if(!current(session)){close(session);return;}if(request!==session.request||!appliedMatches(session,applied))return;
    session.snapshot=snapshot;session.page=0;
    session.dialog.querySelector("[data-rpe-results]").innerHTML=renderRecordedPayrollExpensePage(snapshot,0);
    status(session,"Εμφανίζεται το εφαρμοσμένο διάστημα της τελευταίας επιτυχούς αναζήτησης. Αλλαγές στα πεδία εφαρμόζονται μόνο με νέα Αναζήτηση.");
  }catch(error){
    if(!current(session)){close(session);return;}
    if(request!==session.request)return;
    clearResult(session);
    status(session,error?.name==="AbortError"?"Η αναζήτηση ακυρώθηκε.":message,true);
  }finally{
    if(current(session)&&request===session.request){session.abort=null;session.loading=false;controls(session);}
  }
}
function paginate(session,button){
  if(!current(session)){close(session);return;}
  if(session.loading||!session.snapshot||button.disabled)return;
  if(!appliedMatches(session,session.snapshot))return;
  const page=Number(button.dataset.rpePage);
  if(!Number.isSafeInteger(page)||page<0)return;
  try{
    const html=renderRecordedPayrollExpensePage(session.snapshot,page);
    if(!current(session)){close(session);return;}
    session.page=page;session.dialog.querySelector("[data-rpe-results]").innerHTML=html;
  }catch{clearResult(session);status(session,"Δεν επιβεβαιώθηκε η σελίδα της αναφοράς. Κάντε νέα Αναζήτηση.",true);}
}
function exportSnapshot(session){
  if(!current(session)){close(session);return;}
  if(session.loading||!session.snapshot)return;
  if(!appliedMatches(session,session.snapshot))return;
  try{
    const csv=buildRecordedPayrollExpenseCsv(session.snapshot);
    if(!current(session)){close(session);return;}
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    session.urls.set(url,undefined);
    const anchor=document.createElement("a");
    anchor.href=url;anchor.download=`katagegrammena-exoda-${session.snapshot.period.calendarFrom}-${session.snapshot.period.calendarTo}.csv`;
    if(!current(session)){revoke(session,url);close(session);return;}
    session.dialog.append(anchor);anchor.click();anchor.remove();
    session.urls.set(url,window.setTimeout(()=>revoke(session,url),1000));
  }catch{status(session,"Δεν ολοκληρώθηκε η εξαγωγή του εφαρμοσμένου αποτελέσματος.",true);}
}
function yesterday(){
  const today=greeceDateInput(),stamp=Date.parse(today+"T12:00:00Z")-86400000;
  return new Date(stamp).toISOString().slice(0,10);
}
function open(root,launch){
  const ctx=context(root);if(!ctx)return;
  close(active);
  const dialog=document.createElement("dialog");
  dialog.dataset.rpeDialog="1";dialog.setAttribute("aria-label","Καταγεγραμμένα έξοδα και συνδεδεμένη μισθοδοσία");
  dialog.style.cssText="width:min(1120px,calc(100vw - 32px));max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);overflow-y:auto;overflow-x:hidden;box-sizing:border-box;padding:20px;border:1px solid #9aa9b8;border-radius:12px;background:#fff;color:#17233c;";
  const date=yesterday();
  dialog.innerHTML=`<header><h3>Καταγεγραμμένα έξοδα και συνδεδεμένη μισθοδοσία</h3><p><strong>Επιλεγμένο κατάστημα: ${esc(ctx.label)}</strong> · ${esc(ctx.storeId)}</p><button type="button" data-rpe-close>Κλείσιμο</button></header><p class="kr-info">Ανάγνωση καταγεγραμμένων κινήσεων, χωρίς πληρωμή ή μεταβολή. Δεν πιστοποιεί πραγματική εξόφληση, τραπεζική συμφωνία ή δεδουλευμένα. Μόνο ρητά συνδεδεμένη μισθοδοσία· τα λοιπά μη αποδιδόμενα έξοδα μπορεί επίσης να περιλαμβάνουν μισθοδοσία.</p><form data-rpe-form><div style="display:flex;gap:12px;align-items:end;flex-wrap:wrap"><label>Από<input type="date" data-rpe-from value="${date}"></label><label>Έως και<input type="date" data-rpe-to value="${date}"></label><button type="submit" data-rpe-search>Αναζήτηση</button><button type="button" data-rpe-export disabled>CSV εφαρμοσμένου αποτελέσματος</button></div><p>Ώρα Ελλάδας · μόνο ολοκληρωμένες ημέρες, έως 366 ημέρες. Κάθε σελίδα δείχνει έως 100 γραμμές. Το CSV περιέχει όλες τις επιστρεφόμενες γραμμές του εφαρμοσμένου αποτελέσματος, έως 10.000· δεν εξάγει κρυφά πλήρες σύνολο όταν υπάρχει περιορισμένη κάλυψη.</p></form><div class="kr-info" data-rpe-status role="status" aria-live="polite">Επιλέξτε διάστημα και πατήστε Αναζήτηση. Δεν έχει φορτωθεί αναφορά.</div><div data-rpe-results></div>`;
  const style=document.createElement("style");
  style.textContent='dialog[data-rpe-dialog]{overflow-wrap:anywhere}dialog[data-rpe-dialog] button,dialog[data-rpe-dialog] input{min-height:44px;max-width:100%;box-sizing:border-box;font:inherit;border:1px solid #9aa9b8;border-radius:6px;padding:8px 12px}dialog[data-rpe-dialog] button{background:#eef5fc;color:#17233c;white-space:normal;cursor:pointer}dialog[data-rpe-dialog] button:disabled{opacity:.55;cursor:default}dialog[data-rpe-dialog] label{display:grid;gap:6px;min-width:0}dialog[data-rpe-dialog] input{width:170px;background:#fff;color:#17233c}dialog[data-rpe-dialog] header{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}dialog[data-rpe-dialog] header h3,dialog[data-rpe-dialog] header p{margin:4px 0}dialog[data-rpe-dialog] [data-rpe-results]{width:100%;max-width:100%;overflow-x:auto;box-sizing:border-box}dialog[data-rpe-dialog] table{width:100%;min-width:660px;border-collapse:collapse;margin:12px 0}dialog[data-rpe-dialog] th,dialog[data-rpe-dialog] td{padding:8px;border:1px solid #d3dde6;text-align:left;vertical-align:top}dialog[data-rpe-dialog] th{background:#eef5fc}dialog[data-rpe-dialog] td:nth-child(4){white-space:nowrap}';
  dialog.prepend(style);
  const session={root,hub:ctx.hub,storeId:ctx.storeId,auth:ctx.auth,launch,dialog,closed:false,loading:false,abort:null,request:0,snapshot:null,page:0,urls:new Map(),observer:null};
  sessions.set(root,session);active=session;
  session.storage=()=>{if(!current(session))close(session);};
  session.pagehide=()=>close(session);
  window.addEventListener("storage",session.storage);window.addEventListener("pagehide",session.pagehide);
  dialog.addEventListener("cancel",event=>{event.preventDefault();close(session,{restoreFocus:true});});
  dialog.addEventListener("close",()=>close(session,{restoreFocus:true}));
  dialog.querySelector("[data-rpe-form]").addEventListener("submit",event=>{event.preventDefault();search(session);});
  const onDraftEdit=event=>{
    if(!event.target.matches("[data-rpe-from],[data-rpe-to]"))return;
    if(!current(session)){close(session);return;}
    invalidateDraft(session);
  };
  dialog.addEventListener("input",onDraftEdit);dialog.addEventListener("change",onDraftEdit);
  root.append(dialog);
  try{
    if(typeof dialog.showModal!=="function")throw new Error("unsupported");
    dialog.showModal();
  }catch{close(session);return;}
  // Observe only the bounded root/ancestor chain while this native dialog is
  // open. A top-layer dialog must close if React hides/removes its report.
  session.observer=new window.MutationObserver(()=>{if(!current(session))close(session);});
  for(let node=root;element(node);node=node.parentElement)session.observer.observe(node,{childList:true,attributes:true,attributeFilter:["hidden","style","class","aria-hidden","data-report-store-id","data-sales-v4"]});
  dialog.querySelector("[data-rpe-from]").focus();
}

export function installRecordedPayrollExpenseEntry(root){
  const launch=root?.querySelector("[data-rpe-launch]");
  if(!context(root)){if(launch)launch.remove();close(sessions.get(root));return;}
  if(launch)return;
  const toolbar=root.querySelector(".kr-toolbar");if(!toolbar)return;
  const button=document.createElement("button");button.type="button";button.dataset.rpeLaunch="1";
  button.textContent="Καταγεγραμμένα έξοδα / μισθοδοσία";toolbar.append(button);
}

// Called by the existing single V4 capture listener, before its sales actions.
// It owns only data-rpe-* controls; all existing report controls keep their flow.
export function handleRecordedPayrollExpenseNavigation(event){
  const target=element(event.target)?event.target:null;
  if(!target)return false;
  const launch=target.closest("[data-rpe-launch]");
  if(event.type==="click"&&launch){
    event.preventDefault();event.stopImmediatePropagation();
    const root=launch.closest(".kiosk-reports-suite");if(root)open(root,launch);return true;
  }
  const session=active;if(!session)return false;
  if(!current(session)){close(session);return false;}
  if(!session.dialog.contains(target)){close(session);return false;}
  if(event.type!=="click")return true;
  const button=target.closest("button");if(!button)return true;
  if(button.matches("[data-rpe-close],[data-rpe-search],[data-rpe-export],[data-rpe-page]")){
    event.preventDefault();event.stopImmediatePropagation();
    if(button.disabled)return true;
    if(button.matches("[data-rpe-close]"))close(session,{restoreFocus:true});
    else if(button.matches("[data-rpe-search]"))search(session);
    else if(button.matches("[data-rpe-export]"))exportSnapshot(session);
    else paginate(session,button);
  }
  return true;
}
