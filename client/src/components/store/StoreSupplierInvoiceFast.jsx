import React,{useMemo,useRef,useState} from "react";
import {Camera,FileUp,Wallet} from "lucide-react";
import {finalizeV244ProductLines} from "../../lib/invoice-v244.js";

const today=()=>new Date().toISOString().slice(0,10);
const num=v=>Number(String(v??"0").replace(/\s/g,"").replace(",","."))||0;
const readFile=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error("Δεν διαβάστηκε το παραστατικό."));r.readAsDataURL(file)});
const paymentKey=()=>`pos-invoice-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;

async function backgroundV244({api,store,fileDataUrl,filename,mimeType,supplierId,documentNumber,documentDate,totalGross,inboxId,mode,paymentTransactionId}){
  const patch=async(status,note)=>{try{await api(`/api/commerce/documents/inbox/${encodeURIComponent(inboxId)}`,{method:"PATCH",body:JSON.stringify({status,note})})}catch{}};
  try{
    const job=await api("/api/commerce/ai-reader/jobs",{method:"POST",body:JSON.stringify({storeId:store.id,filename,mimeType,dataUrl:fileDataUrl,localConfidence:0,result:{rawText:"",lines:[],pageCount:null,pdfNote:"POS FAST PAYMENT — background V2.4.4"}})});
    if(!job?.id)throw new Error("Δεν δημιουργήθηκε εργασία V2.4.4.");
    const ai=await api(`/api/commerce/ai-reader/jobs/${encodeURIComponent(job.id)}/ai-recheck`,{method:"POST",body:JSON.stringify({force:true})});
    const result=ai?.result||{};
    const productLines=finalizeV244ProductLines(Array.isArray(result.productLines)?result.productLines:[]);
    if(!productLines.length)throw new Error("Δεν βρέθηκαν ασφαλείς γραμμές προϊόντων.");
    await api(`/api/commerce/ai-reader/jobs/${encodeURIComponent(job.id)}/product-lines`,{method:"PUT",body:JSON.stringify({productLines})});
    const finalNumber=String(result.documentNumber||documentNumber||"").trim();
    const finalDate=String(result.documentDate||documentDate||today()).slice(0,10);
    const finalTotal=Number(result.totalGross||totalGross||0);
    const created=await api(`/api/commerce/ai-reader/jobs/${encodeURIComponent(job.id)}/pos-intake`,{method:"POST",body:JSON.stringify({storeId:store.id,supplierId,documentNumber:finalNumber||`POS-${Date.now()}`,documentDate:finalDate,totalGross:finalTotal,settlementMode:mode,paymentTransactionId:mode==="PAID"?paymentTransactionId:null,note:`POS FAST • Inbox ${inboxId} • ${mode==="PAID"?"ΠΛΗΡΩΜΕΝΟ":"ΜΕ ΠΙΣΤΩΣΗ"}`})});
    await patch("IN_REVIEW",`✅ V2.4.4 ολοκληρώθηκε στο παρασκήνιο • ${productLines.length} γραμμές • ${mode==="PAID"?"ΠΛΗΡΩΜΕΝΟ":"ΜΕ ΠΙΣΤΩΣΗ"} • ${created?.purchaseOrderId||created?.id||"προς έλεγχο"}`);
  }catch(error){
    await patch("IN_REVIEW",`⚠️ Χρειάζεται έλεγχο BackOffice • ${String(error?.message||error).slice(0,700)}`);
  }
}

export default function StoreSupplierInvoiceFast({api,store,suppliers=[],onChanged,setMessage}){
  const [file,setFile]=useState(null),[supplierId,setSupplierId]=useState(""),[amount,setAmount]=useState(""),[documentNumber,setDocumentNumber]=useState(""),[documentDate,setDocumentDate]=useState(today()),[mode,setMode]=useState(""),[busy,setBusy]=useState(false),[cameraOpen,setCameraOpen]=useState(false),[stream,setStream]=useState(null);
  const videoRef=useRef(null),canvasRef=useRef(null);
  const supplier=useMemo(()=>suppliers.find(x=>String(x.id)===String(supplierId))||null,[suppliers,supplierId]);
  const stopCamera=()=>{stream?.getTracks?.().forEach(t=>t.stop());setStream(null);setCameraOpen(false)};
  const startCamera=async()=>{try{stopCamera();const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false});setStream(s);setCameraOpen(true);setTimeout(()=>{if(videoRef.current)videoRef.current.srcObject=s},0)}catch{setMessage?.("❌ Δεν μπόρεσε να ανοίξει η κάμερα.")}};
  const capture=()=>{const v=videoRef.current,c=canvasRef.current;if(!v||!c)return;c.width=v.videoWidth||1280;c.height=v.videoHeight||720;c.getContext("2d").drawImage(v,0,0,c.width,c.height);c.toBlob(blob=>{if(blob)setFile(new File([blob],`timologio-${Date.now()}.jpg`,{type:"image/jpeg"}));stopCamera()},"image/jpeg",.9)};
  const ready=Boolean(file&&supplierId&&num(amount)>0&&mode&&!busy);
  const submit=async()=>{
    if(!ready)return;
    setBusy(true);
    try{
      const dataUrl=await readFile(file),key=paymentKey();
      const responsibleName="POS";
      const note=`POS FAST • ${mode==="PAID"?"ΠΛΗΡΩΜΕΝΟ":"ΜΕ ΠΙΣΤΩΣΗ"} • Ποσό ${num(amount).toFixed(2)} €${documentNumber?` • Τιμολόγιο ${documentNumber}`:""} • Αναμονή V2.4.4`;
      const inbox=await api("/api/commerce/documents/inbox",{method:"POST",body:JSON.stringify({storeId:store.id,supplierId,responsibleName,note,file:{dataUrl,filename:file.name||"timologio.jpg"}})});
      let paymentTransactionId=null;
      if(mode==="PAID"){
        const payment=await api(`/api/transactions/stores/${encodeURIComponent(store.id)}`,{method:"POST",body:JSON.stringify({type:"SUPPLIER_PAYMENT",amount:num(amount),supplierId,supplierName:supplier?.name||null,description:documentNumber?`Τιμολόγιο ${documentNumber} — FAST POS":"Πληρωμή προμηθευτή FAST POS",evidenceMode:"NO_DOCUMENT",paymentSource:"CASH_SHIFT",idempotencyKey:key})});
        paymentTransactionId=payment?.id||null;
        if(!paymentTransactionId)throw new Error("Η πληρωμή γράφτηκε χωρίς αναγνωριστικό συναλλαγής.");
        try{window.dispatchEvent(new CustomEvent("myworkstation:cash-drawer-request",{detail:{reason:"SUPPLIER_PAYMENT",amount:num(amount),storeId:store.id,transactionId:paymentTransactionId}}))}catch{}
      }
      setMessage?.(`✅ ${mode==="PAID"?"Η πληρωμή καταχωρίστηκε στη βάρδια":"Το τιμολόγιο καταχωρίστηκε με πίστωση"}. Επιστροφή στο POS — ο έλεγχος συνεχίζεται στο BackOffice.`);
      onChanged?.();
      backgroundV244({api,store,fileDataUrl:dataUrl,filename:file.name||"timologio.jpg",mimeType:file.type||"image/jpeg",supplierId,documentNumber,documentDate,totalGross:num(amount),inboxId:inbox.id,mode,paymentTransactionId});
    }catch(error){
      setMessage?.(`❌ ${error?.message||"Η καταχώριση απέτυχε."}`);
      setBusy(false);
    }
  };
  return <div className="pos-payment-form-v3-root">
    <div style={{padding:"10px 12px",borderRadius:10,background:"#e9f8f1",fontWeight:900,color:"#0b6249",marginBottom:10}}>FAST PAYMENT — ο υπάλληλος πληρώνει/παραλαμβάνει και επιστρέφει αμέσως στις πωλήσεις. Ο έλεγχος γίνεται στο BackOffice.</div>
    <div className="pos-photo-actions"><button type="button" onClick={startCamera}><Camera/> Λήψη από κάμερα</button><label><FileUp/> Επιλογή αρχείου / PDF<input type="file" accept="image/*,application/pdf" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><b>{file?.name||"Δεν επιλέχθηκε τιμολόγιο"}</b></div>
    {cameraOpen&&<div className="pos-camera-live"><video ref={videoRef} autoPlay playsInline/><canvas ref={canvasRef} hidden/><div><button type="button" onClick={capture}><Camera/> Φωτογράφιση</button><button type="button" onClick={stopCamera}>Κλείσιμο</button></div></div>}
    <label>Προμηθευτής<select value={supplierId} onChange={e=>setSupplierId(e.target.value)}><option value="">Επίλεξε προμηθευτή</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}{s.taxId?` · ${s.taxId}`:""}</option>)}</select></label>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}><label>Ποσό<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/></label><label>Αρ. τιμολογίου <small>(προαιρετικό)</small><input value={documentNumber} onChange={e=>setDocumentNumber(e.target.value)}/></label><label>Ημερομηνία<input type="date" value={documentDate} onChange={e=>setDocumentDate(e.target.value)}/></label></div>
    <div className="pos-payment-types"><button type="button" aria-pressed={mode==="PAID"} className={mode==="PAID"?"active":""} onClick={()=>setMode("PAID")}>ΠΛΗΡΩΜΕΝΟ — από ταμείο</button><button type="button" aria-pressed={mode==="CREDIT"} className={mode==="CREDIT"?"active":""} onClick={()=>setMode("CREDIT")}>ΜΕ ΠΙΣΤΩΣΗ</button></div>
    <button className="pos-primary-action" disabled={!ready} onClick={submit}><Wallet/> {busy?"Καταχώριση…":mode==="PAID"?"ΠΛΗΡΩΜΗ & ΕΠΙΣΤΡΟΦΗ ΣΤΟ POS":"ΚΑΤΑΧΩΡΙΣΗ ΜΕ ΠΙΣΤΩΣΗ"}</button>
  </div>;
}
