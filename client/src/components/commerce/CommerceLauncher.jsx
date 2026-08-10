import React,{useEffect,useState} from "react";
import {BriefcaseBusiness,Boxes,Maximize2,Minimize2,X} from "lucide-react";
import CommerceHub from "./CommerceHub.jsx";
import KioskStyleProductCenterWithStock from "./KioskStyleProductCenterWithStock.jsx";
import InventoryArchivePanel from "./InventoryArchivePanel.jsx";
import "./inventory-archive-delivery.css";

async function request(path,options={}){
  const token=localStorage.getItem("token");
  const response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);
  return data;
}

const enhanceChildWindows=()=>{
  document.querySelectorAll(".commerce-overlay .kiosk-modal,.commerce-overlay .capital-modal").forEach(win=>{
    if(win.dataset.mwWindow==="1")return;
    win.dataset.mwWindow="1";
    win.classList.add("mw-managed-window","mw-maximized");
    const title=win.querySelector(".kiosk-modal-title,.capital-title");
    if(!title)return;
    const controls=document.createElement("div");
    controls.className="mw-window-controls";
    const min=document.createElement("button");min.type="button";min.className="mw-window-button";min.title="Ελαχιστοποίηση";min.textContent="—";
    const max=document.createElement("button");max.type="button";max.className="mw-window-button";max.title="Πλήρης οθόνη / επαναφορά";max.textContent="□";
    min.onclick=e=>{e.stopPropagation();win.classList.toggle("mw-minimized");if(win.classList.contains("mw-minimized"))win.classList.remove("mw-maximized")};
    max.onclick=e=>{e.stopPropagation();win.classList.remove("mw-minimized");win.classList.toggle("mw-maximized")};
    controls.append(min,max);title.appendChild(controls);
    title.ondblclick=()=>{win.classList.remove("mw-minimized");win.classList.toggle("mw-maximized")};
  });
};

export default function CommerceLauncher(){
  const [visible,setVisible]=useState(false);
  const [mode,setMode]=useState("products");
  const [inventoryStoreId,setInventoryStoreId]=useState("");
  const [authenticated,setAuthenticated]=useState(()=>Boolean(localStorage.getItem("token")&&localStorage.getItem("user")));
  const [stores,setStores]=useState([]);
  const [minimized,setMinimized]=useState(false);
  const [maximized,setMaximized]=useState(true);
  useEffect(()=>{
    const timer=setInterval(()=>setAuthenticated(Boolean(localStorage.getItem("token")&&localStorage.getItem("user"))),700);
    return()=>clearInterval(timer);
  },[]);
  useEffect(()=>{
    if(!visible)return;
    enhanceChildWindows();
    const observer=new MutationObserver(()=>enhanceChildWindows());
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[visible]);
  const open=async()=>{
    setMode("products");setVisible(true);setMinimized(false);setMaximized(true);
    try{const list=await request("/api/stores");setStores(list);setInventoryStoreId(list[0]?.id||"")}catch{setStores([]);setInventoryStoreId("")}
  };
  const toggleMax=()=>{setMinimized(false);setMaximized(v=>!v)};
  const interceptWarehouse=event=>{
    if(mode==="inventory"){
      const orderButton=event.target.closest?.(".ia-toolbar button");
      if(orderButton&&String(orderButton.textContent||"").includes("Παραγγελία")){
        event.preventDefault();event.stopPropagation();setMode("legacy");
        window.setTimeout(()=>document.querySelector("[data-purchase-orders-launch]")?.click(),60);
      }
      return;
    }
    if(mode!=="legacy")return;
    const button=event.target.closest?.(".commerce-hub .commerce-module-strip button");
    if(!button||!String(button.textContent||"").includes("Αποθήκη")||button.disabled)return;
    event.preventDefault();event.stopPropagation();
    const selector=document.querySelector(".commerce-hub > .panel label select");
    setInventoryStoreId(selector?.value||stores[0]?.id||"");setMode("inventory");
  };
  if(!authenticated)return null;
  return <>
    <button className="commerce-launcher" onClick={open}><BriefcaseBusiness/>Εμπορική λειτουργία</button>
    {visible&&<div className={`commerce-overlay ${minimized?"window-minimized":""}`}><section onClickCapture={interceptWarehouse} className={`commerce-shell ${maximized?"window-maximized":""} ${minimized?"window-minimized":""}`}>
      <div className="commerce-window-bar" onDoubleClick={toggleMax}><strong>MyWorkStation BackOffice</strong><div className="commerce-window-controls"><button title="Ελαχιστοποίηση" onClick={()=>{setMinimized(true);setMaximized(false)}}><Minimize2/></button><button title="Πλήρης οθόνη / επαναφορά" onClick={toggleMax}><Maximize2/></button><button title="Κλείσιμο" onClick={()=>setVisible(false)}><X/></button></div></div>
      {!minimized&&<>
      <div className="commerce-mode-switch">
        <button className={mode==="products"?"active":""} onClick={()=>setMode("products")}><Boxes/>Προϊόντα, Τιμές, Προσφορές & Απογραφή</button>
        <button className={mode==="legacy"||mode==="inventory"?"active":""} onClick={()=>setMode("legacy")}>Λοιπές εμπορικές λειτουργίες</button>
      </div>
      {mode==="products"?<KioskStyleProductCenterWithStock api={request} stores={stores}/>:mode==="inventory"?<InventoryArchivePanel api={request} stores={stores} storeId={inventoryStoreId||stores[0]?.id||""} onClose={()=>setMode("legacy")}/>:<CommerceHub api={request} stores={stores}/>} 
      </>}
    </section></div>}
  </>;
}
