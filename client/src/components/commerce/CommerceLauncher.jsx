import React,{useEffect,useState} from "react";
import {BriefcaseBusiness,Boxes,X} from "lucide-react";
import CommerceHub from "./CommerceHub.jsx";
import OwnerProductCenter from "./OwnerProductCenter.jsx";

async function request(path,options={}){
  const token=localStorage.getItem("token");
  const response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);
  return data;
}

export default function CommerceLauncher(){
  const [visible,setVisible]=useState(false);
  const [mode,setMode]=useState("products");
  const [authenticated,setAuthenticated]=useState(()=>Boolean(localStorage.getItem("token")&&localStorage.getItem("user")));
  const [stores,setStores]=useState([]);
  useEffect(()=>{
    const timer=setInterval(()=>setAuthenticated(Boolean(localStorage.getItem("token")&&localStorage.getItem("user"))),700);
    return()=>clearInterval(timer);
  },[]);
  const open=async()=>{
    setMode("products");setVisible(true);
    try{setStores(await request("/api/stores"))}catch{setStores([])}
  };
  if(!authenticated)return null;
  return <>
    <button className="commerce-launcher" onClick={open}><BriefcaseBusiness/>Εμπορική λειτουργία</button>
    {visible&&<div className="commerce-overlay"><section className="commerce-shell">
      <button className="commerce-close" onClick={()=>setVisible(false)}><X/></button>
      <div className="commerce-mode-switch">
        <button className={mode==="products"?"active":""} onClick={()=>setMode("products")}><Boxes/>Προϊόντα, Τιμές, Προσφορές & Απογραφή</button>
        <button className={mode==="legacy"?"active":""} onClick={()=>setMode("legacy")}>Λοιπές εμπορικές λειτουργίες</button>
      </div>
      {mode==="products"?<OwnerProductCenter api={request} stores={stores}/>:<CommerceHub api={request} stores={stores}/>} 
    </section></div>}
  </>;
}
