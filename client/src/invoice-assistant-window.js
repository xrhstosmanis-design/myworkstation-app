// Minimize only hides the retained window. It never starts/cancels an API call.
const windows=new Map();
export function restoreInvoiceAssistant(orderId){
 const window=windows.get(orderId);
 if(!window?.overlay.isConnected)return false;
 window.restore();return true;
}
export function installInvoiceAssistantWindow(overlay,{orderId,order,scoped,onRemoved}){
 let minimized=false,disposed=false;
 const hiddenModals=new Map();
 const dock=document.createElement("button");dock.type="button";
 dock.className="invoice-assistant-dock";dock.dataset.invoiceAssistantRestore=orderId;
 if(scoped)dock.dataset.posInvoiceModal="1";
 const title=document.createElement("b"),progress=document.createElement("span");
 title.textContent=`↗ Επαναφορά βοηθού · ${order.invoiceNumber||"τιμολόγιο"}`;
 progress.setAttribute("role","status");dock.append(title,progress);dock.hidden=true;
 const dockHost=scoped?document.querySelector("[data-invoice-assistant-dock-host]"):null;
 if(dockHost)dock.classList.add("invoice-assistant-dock-pos");
 (dockHost||document.body).appendChild(dock);
 const status=overlay.querySelector("[data-status]");
 const statusObserver=new MutationObserver(()=>{progress.textContent=status.textContent});
 statusObserver.observe(status,{childList:true,characterData:true,subtree:true});
 const visibility=()=>{if(scoped)document.dispatchEvent(new window.CustomEvent("mws:invoice-assistant-visibility",{detail:{minimized}}))};
 const restore=()=>{
  if(disposed)return;
  minimized=false;overlay.style.display="block";dock.hidden=true;
  for(const [node,display] of hiddenModals)if(node.isConnected)node.style.display=display;
  hiddenModals.clear();visibility();overlay.querySelector("[data-minimize]")?.focus();
 };
 const minimize=()=>{
  if(disposed||minimized)return;minimized=true;
  if(scoped)for(const node of document.querySelectorAll("[data-pos-invoice-modal]")){
   if(node===overlay||node===dock||node.classList.contains("invoice-assistant-dock"))continue;
   hiddenModals.set(node,node.style.display);node.style.display="none";
  }
  overlay.style.display="none";progress.textContent=status.textContent;
  dock.hidden=false;visibility();dock.focus();
 };
 const requestedRestore=()=>{if(minimized)restore()};
 document.addEventListener("mws:invoice-assistant-restore",requestedRestore);
 dock.onclick=restore;overlay.querySelector("[data-minimize]").onclick=minimize;
 const dispose=()=>{
  if(disposed)return;disposed=true;statusObserver.disconnect();removalObserver.disconnect();
  document.removeEventListener("mws:invoice-assistant-restore",requestedRestore);
  dock.remove();for(const [node,display] of hiddenModals)if(node.isConnected)node.style.display=display;
  hiddenModals.clear();minimized=false;visibility();
  if(windows.get(orderId)?.overlay===overlay)windows.delete(orderId);
 };
 const removalObserver=new MutationObserver(()=>{if(!overlay.isConnected){dispose();onRemoved?.()}});
 removalObserver.observe(document.body,{childList:true,subtree:true});
 windows.set(orderId,{overlay,restore});
 return {dispose,isActive:()=>!disposed&&overlay.isConnected};
}
