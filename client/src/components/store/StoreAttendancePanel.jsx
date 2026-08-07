import React,{useEffect,useState} from "react";
import {Clock3,LogIn,LogOut,RefreshCw} from "lucide-react";
import "./store-attendance.css";

const dateTime=value=>value?new Date(value).toLocaleString("el-GR",{dateStyle:"short",timeStyle:"short"}):"—";

export default function StoreAttendancePanel({api,employee}){
  const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const load=async()=>{setError("");try{setData(await api("/api/attendance/me"))}catch(e){setError(e.message)}};
  useEffect(()=>{load()},[]);
  const clock=async eventType=>{setBusy(true);setError("");setMessage("");try{await api("/api/attendance/clock",{method:"POST",body:JSON.stringify({eventType})});setMessage(eventType==="IN"?"Η είσοδός σου καταγράφηκε.":"Η έξοδός σου καταγράφηκε.");await load()}catch(e){setError(e.message)}finally{setBusy(false)}};
  if(error?.includes("module")||error?.includes("ενεργό"))return null;
  const working=data?.status==="WORKING";
  return <section className={`store-attendance ${working?"working":""}`}><div className="store-attendance-main"><div className="store-attendance-icon"><Clock3/></div><div><span>ΠΡΟΣΩΠΙΚΗ ΠΑΡΟΥΣΙΑ</span><h2>{working?"Εργάζεσαι τώρα":"Εκτός εργασίας"}</h2><p>{data?.latest?`Τελευταία κίνηση: ${dateTime(data.latest.occurredAt)}`:"Δεν υπάρχει ακόμη καταχώριση."}</p></div></div><div className="store-attendance-actions">{error&&<small>{error}</small>}{message&&<small className="success">{message}</small>}<button className="refresh" onClick={load} aria-label="Ανανέωση"><RefreshCw/></button>{working?<button disabled={busy} onClick={()=>clock("OUT")}><LogOut/>{busy?"Καταχώριση…":"Λήξη εργασίας"}</button>:<button disabled={busy||!data} onClick={()=>clock("IN")}><LogIn/>{busy?"Καταχώριση…":"Έναρξη εργασίας"}</button>}</div><details><summary>Οι τελευταίες κινήσεις μου</summary><div>{data?.recent?.map(item=><p key={item.id}><b>{item.eventType==="IN"?"Είσοδος":"Έξοδος"}</b><span>{dateTime(item.occurredAt)}</span></p>)}</div></details></section>;
}
