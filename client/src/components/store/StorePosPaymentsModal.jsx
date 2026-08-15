import React,{useEffect,useRef,useState} from "react";
import {Camera,Wallet,X} from "lucide-react";
import StoreSupplierInvoiceV3 from "./StoreSupplierInvoiceV3.jsx";

const euro=v=>Number(v||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const num=v=>Number(String(v||"0").replace(",","."))||0;
const fileToDataUrl=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});
function Pad({value,onChange}){const press=k=>{const c=String(value??"");if(k==="⌫")return onChange(c.slice(0,-1));if(k==="C")return onChange("");if(k===","){if(c.includes(",")||c.includes("."))return;return onChange(`${c||"0"},`)}onChange(`${c}${k}`.replace(/^0+(?=\d)/,""))};return <div className="pos-inline-keypad">{[7,8,9,4,5,6,1,2,3,0,",","⌫"].map(k=><button key={k} type="button" onClick={()=>press(String(k))}>{k}</button>)}<button type="button" className="wide" onClick={()=>press("C")}>ΚΑΘΑΡΙΣΜΟΣ</button></div>}

export default function StorePosPaymentsModal({api,store,onClose,onChanged,setMessage,setError}){
 const [busy,setBusy]=useState(false),[ledger,setLedger]=useState(null),[cameraOpen,setCameraOpen]=useState(false),[stream,setStream]=useState(null);const videoRef=useRef(null),canvasRef=useRef(null);
 const [form,setForm]=useState({type:"OTHER_EXPENSE",amount:"",description:"",subtractFromShift:true,file:null});
 const stopCamera=()=>{stream?.getTracks?.().forEach(t=>t.stop());setStream(null);setCameraOpen(false)};
 useEffect(()=>{api(`/api/transactions/stores/${store.id}/overview`).then(setLedger).catch(e=>setError(e.message));return()=>stopCamera()},[]);
 const startCamera=async()=>{try{stopCamera();const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false});setStream(s);setCameraOpen(true);setTimeout(()=>{if(videoRef.current)videoRef.current.srcObject=s},0)}catch{setError("Δεν μπόρεσε να ανοίξει η κάμερα. Έλεγξε την άδεια κάμερας του browser.")}};
 const capture=()=>{const v=videoRef.current,c=canvasRef.current;if(!v||!c)return;c.width=v.videoWidth||1280;c.height=v.videoHeight||720;c.getContext("2d").drawImage(v,0,0,c.width,c.height);c.toBlob(blob=>{if(!blob)return;setForm(x=>({...x,file:new File([blob],`parastatiko-${Date.now()}.jpg`,{type:"image/jpeg"})}));stopCamera()},"image/jpeg",.9)};
 const submitOther=async()=>{const amount=num(form.amount);if(amount<=0)return setError("Βάλε ποσό πληρωμής.");if(!form.file)return setError("Βγάλε ή επίλεξε φωτογραφία παραστατικού.");setBusy(true);try{const dataUrl=await fileToDataUrl(form.file);await api(`/api/transactions/stores/${store.id}`,{method:"POST",body:JSON.stringify({type:"OTHER_EXPENSE",amount,description:form.description||null,subtractFromShift:Boolean(form.subtractFromShift),attachment:{dataUrl,filename:form.file.name||"parastatiko.jpg"}})});setMessage(`Το έξοδο ${euro(amount)} καταχωρίστηκε στη βάρδια και στο BackOffice.`);onChanged?.();onClose()}catch(e){setError(e.message)}finally{setBusy(false)}};
 const supplierMode=form.type==="SUPPLIER_PAYMENT",suppliers=ledger?.suppliers||[];
 return <div className="pos-standard-modal" onMouseDown={e=>e.target===e.currentTarget&&!busy&&onClose()}><section><header><div><small>MYWORKSTATION STANDARD POS</small><h2>Πληρωμές</h2></div><button onClick={()=>!busy&&onClose()}><X/></button></header><main><div className="pos-payment-form" data-invoice-v3="1">
  <div style={{marginBottom:8}}><small style={{fontWeight:800,color:"#47655d"}}>ΕΠΙΛΟΓΗ ΚΑΤΗΓΟΡΙΑΣ — η πραγματική πληρωμή εκτελείται μόνο από την τελική καταχώριση του τιμολογίου</small></div>
  <div className="pos-payment-types"><button type="button" aria-pressed={!supplierMode} className={!supplierMode?"active":""} onClick={()=>setForm(c=>({...c,type:"OTHER_EXPENSE"}))}>Λοιπά έξοδα</button><button type="button" aria-pressed={supplierMode} className={supplierMode?"active":""} onClick={()=>setForm(c=>({...c,type:"SUPPLIER_PAYMENT"}))}>Πληρωμή προμηθευτή</button></div>
  {supplierMode?<StoreSupplierInvoiceV3 api={api} store={store} suppliers={suppliers} onChanged={onChanged} setMessage={setMessage}/>:<>
   <label>Ποσό<input readOnly inputMode="decimal" value={form.amount}/></label><Pad value={form.amount} onChange={amount=>setForm(c=>({...c,amount}))}/><label>Παρατηρήσεις<input value={form.description} onChange={e=>setForm(c=>({...c,description:e.target.value}))}/></label>
   <div className="pos-photo-actions"><button type="button" onClick={startCamera}><Camera/> Λήψη από κάμερα</button><label><Camera/> Επιλογή αρχείου<input type="file" accept="image/*,application/pdf" onChange={e=>setForm(c=>({...c,file:e.target.files?.[0]||null}))}/></label><b>{form.file?.name||"Δεν επιλέχθηκε φωτογραφία"}</b></div>
   {cameraOpen&&<div className="pos-camera-live"><video ref={videoRef} autoPlay playsInline/><canvas ref={canvasRef} hidden/><div><button type="button" onClick={capture}><Camera/> Φωτογράφιση</button><button type="button" onClick={stopCamera}>Κλείσιμο κάμερας</button></div></div>}
   <label className="pos-check"><input type="checkbox" checked={form.subtractFromShift} onChange={e=>setForm(c=>({...c,subtractFromShift:e.target.checked}))}/>Αφαίρεση από τα μετρητά της βάρδιας</label><button className="pos-primary-action" disabled={busy} onClick={submitOther}><Wallet/> Καταχώριση εξόδου</button>
  </>}
 </div></main></section></div>
}