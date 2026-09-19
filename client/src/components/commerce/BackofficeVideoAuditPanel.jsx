import React,{useEffect,useState} from "react";
import {Camera,Copy,RefreshCw} from "lucide-react";

export default function BackofficeVideoAuditPanel({api,storeId}){
 const [data,setData]=useState(null),[code,setCode]=useState(null),[error,setError]=useState("");
 const load=()=>storeId&&api(`/api/video-admin/stores/${encodeURIComponent(storeId)}`).then(setData).catch(e=>setError(e.message));
 useEffect(()=>{setCode(null);load()},[storeId]);
 const pairing=async()=>{try{setError("");setCode(await api(`/api/video-admin/stores/${encodeURIComponent(storeId)}/pairing-code`,{method:"POST",body:JSON.stringify({minutes:15})}))}catch(e){setError(e.message)}};
 const saveCameras=async()=>{try{setError("");const result=await api(`/api/video-admin/stores/${encodeURIComponent(storeId)}/cameras`,{method:"PUT",body:JSON.stringify({cameras:data.cameras})});setData(v=>({...v,cameras:result.cameras}))}catch(e){setError(e.message)}};
 if(!data)return <section className="commerce-box"><h3><Camera/> Κάμερες / Video Audit</h3>{error?<div className="commerce-error">{error}</div>:<p>Φόρτωση…</p>}</section>;
 const setCamera=(i,k,v)=>setData(d=>({...d,cameras:d.cameras.map((c,x)=>x===i?{...c,[k]:v}:c)}));
 return <section className="commerce-box">
  <h3><Camera/> Κάμερες / Video Audit</h3><p><b>{data.store.name}</b> · Κατάσταση connector: <b>{data.connector?.online?"ONLINE":"OFFLINE"}</b></p>
  {error&&<div className="commerce-error">{error}</div>}
  <div className="commerce-notice">NVR: {data.connection.provider||"—"} · {data.connection.endpoint||"Δεν έχει ρυθμιστεί"} · Retention {data.connection.retentionDays||30} ημέρες. Τα στοιχεία σύνδεσης/κωδικός NVR παραμένουν προστατευμένα.</div>
  <div className="commerce-form"><button type="button" onClick={pairing}>Δημιουργία κωδικού Video Connector</button>{code&&<div className="commerce-success"><b>Pairing code: {code.code}</b><br/><small>Ισχύει έως {new Date(code.expiresAt).toLocaleString("el-GR")}</small><button type="button" onClick={()=>navigator.clipboard.writeText(code.code)}><Copy/> Αντιγραφή</button></div>}<button type="button" onClick={load}><RefreshCw/> Ανανέωση κατάστασης</button></div>
  <h3>Κάμερες και ζώνες</h3>{data.cameras.map((c,i)=><div className="commerce-form" key={c.cameraKey||i}><input value={c.cameraKey} onChange={e=>setCamera(i,"cameraKey",e.target.value)} placeholder="Κανάλι / ID"/><input value={c.displayName} onChange={e=>setCamera(i,"displayName",e.target.value)} placeholder="Όνομα κάμερας"/><select value={c.zone} onChange={e=>setCamera(i,"zone",e.target.value)}><option value="POS_1">POS 1</option><option value="POS_2">POS 2</option><option value="WAREHOUSE">Αποθήκη</option><option value="ENTRANCE">Είσοδος</option><option value="DELIVERY">Delivery</option><option value="OTHER">Άλλη ζώνη</option></select><input value={c.streamReference||""} onChange={e=>setCamera(i,"streamReference",e.target.value)} placeholder="Stream / vendor ref"/></div>)}<button type="button" onClick={saveCameras}>Αποθήκευση καμερών</button>
  <p><small>Η σύνδεση είναι event-only, χωρίς ήχο. Το Video Audit χρησιμοποιεί μόνο τα χρονικά αποσπάσματα που ζητούνται από εξουσιοδοτημένο χρήστη.</small></p>
 </section>;
}
