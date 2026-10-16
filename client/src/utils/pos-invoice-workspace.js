// Retain the authorized POS invoice DOM; minimize never saves or reloads it.
export function installPosInvoiceWorkspace({shell,onChange}){
 const doc=shell.ownerDocument,win=doc.defaultView,added=new Set();
 let manual=false,assistant=false,disposed=false,focus=null,focusTimer=null;
 const owned=()=>[...doc.querySelectorAll("[data-pos-invoice-modal]")];
 const notify=()=>{if(!disposed)onChange({manual,minimized:manual||assistant})};
 const sync=()=>{
  for(const node of owned()){
   node.classList.toggle("pos-invoice-workspace-suspended",manual);
   const header=node.querySelector(".pos-po-modal > .po-modal-title");
   if(!header||header.querySelector("[data-pos-workspace-minimize]"))continue;
   const button=doc.createElement("button");button.type="button";button.dataset.posWorkspaceMinimize="";
   button.textContent="— Ελαχιστοποίηση";button.setAttribute("aria-label","Ελαχιστοποίηση τιμολογίου");
   button.addEventListener("click",minimize);header.querySelector("[data-po-close]")?.before(button);added.add(button);
  }
 };
 function minimize(){
  if(disposed||manual)return;
  const active=doc.activeElement;
  focus=active&&((shell.contains(active))||owned().some(n=>n.contains(active)))&&!active.matches("button")?active:null;
  manual=true;sync();notify();
 }
 function restore(){
  if(disposed||!manual)return;
  manual=false;sync();notify();
  clearTimeout(focusTimer);focusTimer=setTimeout(()=>{if(!disposed&&!manual&&!assistant&&focus?.isConnected)focus.focus({preventScroll:true})},0);
 }
 const assistantVisibility=event=>{assistant=Boolean(event.detail?.minimized);notify()};
 const observer=new win.MutationObserver(sync);observer.observe(doc.body,{childList:true,subtree:true});
 doc.addEventListener("mws:invoice-assistant-visibility",assistantVisibility);
 doc.addEventListener("mws:invoice-workspace-restore",restore);
 sync();notify();
 return {minimize,restore,dispose(){disposed=true;clearTimeout(focusTimer);observer.disconnect();doc.removeEventListener("mws:invoice-assistant-visibility",assistantVisibility);doc.removeEventListener("mws:invoice-workspace-restore",restore);for(const b of added)b.remove();for(const n of owned())n.classList.remove("pos-invoice-workspace-suspended");onChange({manual:false,minimized:false})}};
}
