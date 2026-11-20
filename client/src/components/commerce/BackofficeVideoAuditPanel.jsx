import React,{useEffect,useRef,useState} from "react";
import {Camera,Copy,RefreshCw} from "lucide-react";
import VideoPackageDownload from "../video/VideoPackageDownload.jsx";

export default function BackofficeVideoAuditPanel({api:sendRequest,storeId,companyId,readOnly=false}){
 const api=(path,options={})=>{
  if(readOnly&&String(options.method||'GET').toUpperCase()!=='GET')return Promise.reject(Error('Η πρόσβαση επιτρέπει μόνο προβολή.'));
  return sendRequest(path,options);
 };
 const [storedData,setData]=useState(null),[code,setCode]=useState(null),[error,setError]=useState("");
 const sequence=useRef(0),currentScope=useRef(''),scope=JSON.stringify([companyId,storeId,readOnly]);currentScope.current=scope;
 const [loadedScope,setLoadedScope]=useState(''),[busy,setBusy]=useState(false);
 const data=loadedScope===scope?storedData:null;
 const load=async()=>{
  const current=++sequence.current,own=scope;setData(null);setLoadedScope('');setCode(null);setError('');setBusy(true);
  if(!storeId){setBusy(false);return}
  try{
   const result=await api(`/api/video-admin/stores/${encodeURIComponent(storeId)}`);
   if(current!==sequence.current||own!==currentScope.current)return;
   if(readOnly&&(result?.companyId!==companyId||result.storeId!==storeId||result.store?.id!==storeId||!Array.isArray(result.cameras)))throw Error('Δεν επιβεβαιώθηκε το κατάστημα των καμερών.');
   setData(result);setLoadedScope(own);
  }catch(e){if(current===sequence.current&&own===currentScope.current)setError(e.message)}
  finally{if(current===sequence.current&&own===currentScope.current)setBusy(false)}
 };
 useEffect(()=>{setCode(null);load();return()=>{sequence.current++}},[storeId,companyId,readOnly,sendRequest]);
 const pairing=async()=>{if(readOnly)return;try{setError("");setCode(await api(`/api/video-admin/stores/${encodeURIComponent(storeId)}/pairing-code`,{method:"POST",body:JSON.stringify({minutes:15})}))}catch(e){setError(e.message)}};
 const saveCameras=async()=>{if(readOnly)return;try{setError("");const result=await api(`/api/video-admin/stores/${encodeURIComponent(storeId)}/cameras`,{method:"PUT",body:JSON.stringify({cameras:data.cameras})});setData(v=>({...v,cameras:result.cameras}))}catch(e){setError(e.message)}};
 if(!data)return <section className="commerce-box"><h3><Camera/> Κάμερες / Video Audit</h3>{error?<div className="commerce-error" role="alert">{error}</div>:<p>Φόρτωση…</p>}{readOnly&&<button type="button" disabled={busy} onClick={load}>Ανανέωση κατάστασης</button>}</section>;
 const setCamera=(i,k,v)=>setData(d=>({...d,cameras:d.cameras.map((c,x)=>x===i?{...c,[k]:v}:c)}));
 return <section className="commerce-box">
  <h3><Camera/> Κάμερες / Video Audit</h3><p><b>{data.store.name}</b> · Κατάσταση connector: <b>{data.connector?.online?"ONLINE":"OFFLINE"}</b></p>
  {error&&<div className="commerce-error" role="alert">{error}</div>}
  <div className="commerce-notice">NVR: {data.connection.provider||"—"} · {readOnly?`${data.connection.protocol||"—"} · ${data.connection.connectionStatus||"—"}`:(data.connection.endpoint||"Δεν έχει ρυθμιστεί")} · Retention {data.connection.retentionDays||30} ημέρες. Τα στοιχεία σύνδεσης/κωδικός NVR παραμένουν προστατευμένα.</div>
  {!readOnly&&storeId&&data.store.id===storeId&&<VideoPackageDownload downloadUrl={`/api/video-admin/stores/${encodeURIComponent(storeId)}/packages/hikvision-precheck`}/>}
  <div className="commerce-form">{!readOnly&&<button type="button" onClick={pairing}>Δημιουργία κωδικού Video Connector</button>}{!readOnly&&code&&<div className="commerce-success"><b>Pairing code: {code.code}</b><br/><small>Ισχύει έως {new Date(code.expiresAt).toLocaleString("el-GR",{timeZone:"Europe/Athens",hour12:false})}</small><button type="button" onClick={()=>navigator.clipboard.writeText(code.code)}><Copy/> Αντιγραφή</button></div>}<button type="button" disabled={busy} onClick={load}><RefreshCw/> Ανανέωση κατάστασης</button></div>
  <h3>Κάμερες και ζώνες</h3>{data.cameras.map((c,i)=><div className="commerce-form" key={c.cameraKey||i}><input disabled={readOnly} value={c.cameraKey} onChange={e=>setCamera(i,"cameraKey",e.target.value)} placeholder="Κανάλι / ID"/><input disabled={readOnly} value={c.displayName} onChange={e=>setCamera(i,"displayName",e.target.value)} placeholder="Όνομα κάμερας"/><select disabled={readOnly} value={c.zone} onChange={e=>setCamera(i,"zone",e.target.value)}><option value="POS_1">POS 1</option><option value="POS_2">POS 2</option><option value="WAREHOUSE">Αποθήκη</option><option value="ENTRANCE">Είσοδος</option><option value="DELIVERY">Delivery</option><option value="OTHER">Άλλη ζώνη</option></select>{!readOnly&&<input value={c.streamReference||""} onChange={e=>setCamera(i,"streamReference",e.target.value)} placeholder="Stream / vendor ref"/>}</div>)}{!readOnly&&<button type="button" onClick={saveCameras}>Αποθήκευση καμερών</button>}
  <p><small>Η σύνδεση είναι event-only, χωρίς ήχο. Το Video Audit χρησιμοποιεί μόνο τα χρονικά αποσπάσματα που ζητούνται από εξουσιοδοτημένο χρήστη.</small></p>
 </section>;
}
