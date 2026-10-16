import React,{useEffect,useRef,useState} from "react";
import {installPosInvoiceWorkspace} from "../../utils/pos-invoice-workspace.js";
import {createPortal} from "react-dom";
import "../commerce/purchase-orders-suite.css";
import "./pos-purchase-orders.css";

export default function PosPurchaseOrdersModal({api,store,onClose,onVisibilityChange}){
 const root=useRef(null),shell=useRef(null),workspace=useRef(null),visibilityCallback=useRef(onVisibilityChange),[error,setError]=useState(""),[minimized,setMinimized]=useState(false);
 visibilityCallback.current=onVisibilityChange;
 useEffect(()=>{const manager=installPosInvoiceWorkspace({shell:shell.current,onChange:state=>{setMinimized(state.minimized);visibilityCallback.current?.(state.minimized)}});workspace.current=manager;return()=>{manager.dispose();workspace.current=null}},[store.id]);
 useEffect(()=>{let active=true,dispose=null;const controller=new AbortController();
  // Revalidate before showing records; cached runtime rights cannot grant entry.
  api(`/api/store-pos/stores/${encodeURIComponent(store.id)}/access`,{signal:controller.signal}).then(async result=>{
   if(!active)return;if(result.access?.purchaseOrders!==true)throw new Error("Δεν έχεις δικαίωμα «Παραγγελίες» από το BackOffice.");
   const {mountPosPurchaseOrders}=await import("../commerce/installPurchaseOrdersSuite.js");
   if(!active)return;
   dispose=mountPosPurchaseOrders(root.current,{request:api,store});
  }).catch(err=>{if(active)setError(err.message)});
  return()=>{active=false;controller.abort();dispose?.()};
 },[api,store.id]);
 return createPortal(<div ref={shell} className="pos-invoice-overlay" style={minimized?{display:"none"}:undefined}><section className="pos-invoice-window" role="dialog" aria-modal="true" aria-label="Τιμολόγια / Παραλαβές"><header><div><b>Τιμολόγια / Παραλαβές</b><small>{store.name}</small></div><div className="pos-invoice-window-actions"><button type="button" data-pos-workspace-minimize onClick={()=>workspace.current?.minimize()}>— Ελαχιστοποίηση</button><button type="button" onClick={onClose}>← Επιστροφή στο POS</button></div></header>{error&&<p role="alert">{error}</p>}<div ref={root} className="pos-invoice-body"/></section></div>,document.body);
}
