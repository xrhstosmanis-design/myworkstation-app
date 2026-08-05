import React,{useEffect,useState} from "react";
import {BarChart3,X} from "lucide-react";
import PilotDailyReport from "./PilotDailyReport.jsx";
import "./pilot-report-launcher.css";

const api=async(path,options={})=>{
  const token=localStorage.getItem("token");
  const response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})}});
  const text=await response.text();
  let data={};
  if(text){try{data=JSON.parse(text)}catch{data={error:"Μη αναμενόμενη απάντηση server."}}}
  if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);
  return data;
};

export default function PilotReportLauncher(){
  const [open,setOpen]=useState(false);
  const [stores,setStores]=useState([]);
  const [storeId,setStoreId]=useState("");
  const [error,setError]=useState("");

  useEffect(()=>{
    if(!open)return;
    api("/api/stores").then(rows=>{setStores(rows);if(rows[0])setStoreId(current=>current||rows[0].id)}).catch(err=>setError(err.message));
  },[open]);

  const store=stores.find(row=>row.id===storeId);
  if(!localStorage.getItem("token")||window.location.pathname.startsWith("/store/"))return null;

  return <>
    <button className="pilot-launch-button" onClick={()=>setOpen(true)}><BarChart3/>Αναφορά Πιλότου</button>
    {open&&<div className="pilot-launch-modal">
      <div className="pilot-launch-backdrop" onClick={()=>setOpen(false)}/>
      <div className="pilot-launch-dialog">
        <div className="pilot-launch-top"><div><b>Ημερήσια Αναφορά Εμπορικής Δοκιμής</b><span>Σύγκριση MyWorkStation με Kiosk Manager</span></div><select value={storeId} onChange={e=>setStoreId(e.target.value)}>{stores.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select><button onClick={()=>setOpen(false)}><X/></button></div>
        {error?<div className="cloud-alert cloud-error">{error}</div>:store?<PilotDailyReport api={api} store={store}/>:<div className="cloud-loading">Φόρτωση καταστημάτων…</div>}
      </div>
    </div>}
  </>;
}
