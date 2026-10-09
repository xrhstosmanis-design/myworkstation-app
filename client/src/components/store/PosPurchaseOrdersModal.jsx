import React,{useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import "../commerce/purchase-orders-suite.css";
import "./pos-purchase-orders.css";

export default function PosPurchaseOrdersModal({api,store,onClose}){
 const root=useRef(null),[error,setError]=useState(""),[minimized,setMinimized]=useState(false);
 useEffect(()=>{const visibility=event=>setMinimized(Boolean(event.detail?.minimized));document.addEventListener("mws:invoice-assistant-visibility",visibility);return()=>document.removeEventListener("mws:invoice-assistant-visibility",visibility)},[]);
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
 return createPortal(<div className="pos-invoice-overlay" style={minimized?{display:"none"}:undefined}><section className="pos-invoice-window" role="dialog" aria-modal="true" aria-label="Τιμολόγια / Παραλαβές"><header><div><b>Τιμολόγια / Παραλαβές</b><small>{store.name}</small></div><button type="button" onClick={onClose}>← Επιστροφή στο POS</button></header>{error&&<p role="alert">{error}</p>}<div ref={root} className="pos-invoice-body"/></section></div>,document.body);
}
