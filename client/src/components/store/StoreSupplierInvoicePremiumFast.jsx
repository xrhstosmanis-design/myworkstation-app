import React,{useMemo,useRef,useState} from "react";
import {Camera,FileUp,Wallet} from "lucide-react";
import {finalizeV244ProductLines} from "../../lib/invoice-v244.js";

const num=v=>Number(String(v??"0").replace(/\s/g,"").replace(/\.(?=\d{3}(?:\D|$))/g,"").replace(",",".").replace(/[^0-9.-]/g,""))||0;
const readFile=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error("Δεν διαβάστηκε το παραστατικό."));r.readAsDataURL(file)});
const paymentKey=()=>`pos-invoice-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;

async function backgroundV244({api,store,fileDataUrl,filename,mimeType,supplierId,documentNumber,documentDate,totalGross,mode,paymentTransactionId,supplierName}){
  let inboxId=null;
  try{
    const note=`POS PREMIUM FAST • ${mode==="PAID"?"ΠΛΗΡΩΜΕΝΟ":"ΜΕ ΠΙΣΤΩΣΗ"} • ${totalGross.toFixed(2)} € • Τιμολόγιο ${documentNumber} • Background V2.4.4`;
    const inbox=await api("/api/commerce/documents/inbox",{method:"POST",body:JSON.stringify({storeId:store.id,supplierId,responsibleName:"POS",note,file:{dataUrl:fileDataUrl,filename}})});
    inboxId=inbox?.id||null;
  }catch{}
  const patch=async(status,note)=>{if(!inboxId)return;try{await api(`/api/commerce/documents/inbox/${encodeURIComponent(inboxId)}`,{method:"PATCH",body:JSON.stringify({status,note})})}catch{}};
  try{
    const job=await api("/api/commerce/ai-reader/jobs",{method:"POST",body:JSON.stringify({storeId:store.id,filename,mimeType,dataUrl:fileDataUrl,localConfidence:0,result:{rawText:"",lines:[],pageCount:null,pdfNote:"POS PREMIUM FAST — background V2.4.4"}})});
    if(!job?.id)throw new Error("Δεν δημιουργήθηκε εργασία V2.4.4.");
    const ai=await api(`/api/commerce/ai-reader/jobs/${encodeURIComponent(job.id)}/ai-recheck`,{method:"POST",body:JSON.stringify({force:true})});
    const productLines=finalizeV244ProductLines(Array.isArray(ai?.result?.productLines)?ai.result.productLines:[]);
    if(!productLines.length)throw new Error("Δεν βρέθηκαν ασφαλείς γραμμές προϊόντων.");
    await api(`/api/commerce/ai-reader/jobs/${encodeURIComponent(job.id)}/product-lines`,{method:"PUT",body:JSON.stringify({source:"V2.4.4",productLines})});
    const created=await api(`/api/commerce/ai-reader/jobs/${encodeURIComponent(job.id)}/pos-intake`,{method:"POST",body:JSON.stringify({storeId:store.id,supplierId,documentNumber,documentDate,totalGross,settlementMode:mode,paymentTransactionId:mode==="PAID"?paymentTransactionId:null,note:`POS PREMIUM FAST${inboxId?` • Inbox ${inboxId}`:" • χωρίς DOCUMENTS archive"} • ${mode==="PAID"?"ΠΛΗΡΩΜΕΝΟ":"ΜΕ ΠΙΣΤΩΣΗ"}`})});
    await patch("IN_REVIEW",`✅ Background V2.4.4 ολοκληρώθηκε • ${productLines.length} γραμμές • ${created?.purchaseOrderId||created?.id||"προς έλεγχο"}`);
  }catch(error){await patch("IN_REVIEW",`⚠️ Χρειάζεται έλεγχο BackOffice • ${String(error?.message||error).slice(0,700)}`)}
}

export default function StoreSupplierInvoicePremiumFast({api,store,suppliers=[],onChanged,setMessage}){
  const [file,setFile]=useState(null),[fileDataUrl,setFileDataUrl]=useState(""),[supplierId,setSupplierId]=useState(""),[amount,setAmount]=useState(""),[documentNumber,setDocumentNumber]=useState(""),[documentDate,setDocumentDate]=useState(""),[mode,setMode]=useState(""),[busy,setBusy]=useState(false),[reading,setReading]=useState(false),[status,setStatus]=useState("Επίλεξε ή φωτογράφισε το τιμολόγιο."),[cameraOpen,setCameraOpen]=useState(false),[stream,setStream]=useState(null),[supplierCandidate,setSupplierCandidate]=useState({name:"",taxId:""}),[createdSupplier,setCreatedSupplier]=useState(null),[savingSupplier,setSavingSupplier]=useState(false);
  const videoRef=useRef(null),canvasRef=useRef(null);
  const supplierOptions=useMemo(()=>createdSupplier&&!suppliers.some(x=>String(x.id)===String(createdSupplier.id))?[createdSupplier,...suppliers]:suppliers,[suppliers,createdSupplier]);
  const supplier=useMemo(()=>supplierOptions.find(x=>String(x.id)===String(supplierId))||null,[supplierOptions,supplierId]);
  const stopCamera=()=>{stream?.getTracks?.().forEach(t=>t.stop());setStream(null);setCameraOpen(false)};
  const selectFile=async next=>{
    if(!next)return;
    setFile(next);setFileDataUrl("");setSupplierId("");setAmount("");setDocumentNumber("");setDocumentDate("");setMode("");setCreatedSupplier(null);setSupplierCandidate({name:"",taxId:""});setReading(true);setStatus("PREMIUM FAST AI — διαβάζω μόνο προμηθευτή, αριθμό, ημερομηνία και ποσό…");
    try{
      const dataUrl=await readFile(next);setFileDataUrl(dataUrl);
      const meta=await api("/api/commerce/ai-reader/fast-header",{method:"POST",body:JSON.stringify({storeId:store.id,filename:next.name||"timologio.jpg",mimeType:next.type||"image/jpeg",dataUrl})});
      if(meta?.supplierId)setSupplierId(meta.supplierId);
      setSupplierCandidate({name:String(meta?.supplierName||""),taxId:String(meta?.supplierTaxId||"")});
      if(meta?.documentNumber)setDocumentNumber(meta.documentNumber);
      if(meta?.documentDate)setDocumentDate(meta.documentDate);
      if(Number(meta?.totalGross||0)>0)setAmount(Number(meta.totalGross).toFixed(2).replace(".",","));
      const baseComplete=Boolean(meta?.documentNumber&&meta?.documentDate&&Number(meta?.totalGross||0)>0);
      if(!meta?.supplierId){setStatus("FAST AI ολοκληρώθηκε. Ο προμηθευτής δεν υπάρχει στη βάση. Έλεγξε/συμπλήρωσε Επωνυμία και ΑΦΜ, καταχώρισέ τον και συνέχισε χωρίς νέο upload.")}
      else{const complete=Boolean(meta?.supplierId&&baseComplete);setStatus(complete?`FAST AI ολοκληρώθηκε (${Math.round(Number(meta?.confidence||0))}%). Έλεγξε τα 4 στοιχεία και πάτησε ΠΛΗΡΩΜΕΝΟ ή ΜΕ ΠΙΣΤΩΣΗ.`:"FAST AI ολοκληρώθηκε. Συμπλήρωσε μόνο όποιο από τα 4 βασικά στοιχεία λείπει και συνέχισε.")}
    }catch(error){setStatus(`FAST AI δεν ολοκληρώθηκε. Συμπλήρωσε τα βασικά στοιχεία χειροκίνητα και συνέχισε. ${error?.message||""}`)}finally{setReading(false)}
  };
  const saveNewSupplier=async()=>{
    const name=supplierCandidate.name.trim(),taxId=supplierCandidate.taxId.trim();
    if(name.length<2)return setMessage?.("❌ Συμπλήρωσε την επωνυμία του νέου προμηθευτή.");
    setSavingSupplier(true);
    try{
      const created=await api("/api/commerce/suppliers",{method:"POST",body:JSON.stringify({name,taxId:taxId||null})});
      const next={id:created.id,name:created.name||name,taxId};
      setCreatedSupplier(next);setSupplierId(created.id);
      setStatus(`✅ Ο νέος προμηθευτής ${next.name} καταχωρίστηκε και επιλέχθηκε. Συνέχισε την ίδια πληρωμή.`);
      onChanged?.();
    }catch(error){setMessage?.(`❌ ${error?.message||"Δεν καταχωρίστηκε ο νέος προμηθευτής."}`)}finally{setSavingSupplier(false)}
  };
  const startCamera=async()=>{try{stopCamera();const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false});setStream(s);setCameraOpen(true);setTimeout(()=>{if(videoRef.current)videoRef.current.srcObject=s},0)}catch{setMessage?.("❌ Δεν μπόρεσε να ανοίξει η κάμερα.")}};
  const capture=()=>{const v=videoRef.current,c=canvasRef.current;if(!v||!c)return;c.width=v.videoWidth||1280;c.height=v.videoHeight||720;c.getContext("2d").drawImage(v,0,0,c.width,c.height);c.toBlob(blob=>{stopCamera();if(blob)selectFile(new File([blob],`timologio-${Date.now()}.jpg`,{type:"image/jpeg"}))},"image/jpeg",.9)};
  const ready=Boolean(file&&fileDataUrl&&supplierId&&documentNumber.trim()&&documentDate&&num(amount)>0&&mode&&!busy&&!reading&&!savingSupplier);
  const submit=async()=>{
    if(!ready)return;
    setBusy(true);
    let stage="DUPLICATE CHECK";
    try{
      setStatus("Έλεγχος duplicate τιμολογίου…");
      await api("/api/commerce/ai-reader/fast-duplicate-check",{method:"POST",body:JSON.stringify({storeId:store.id,supplierId,documentNumber:documentNumber.trim(),documentDate})});
      const key=paymentKey(),totalGross=num(amount);
      let paymentTransactionId=null;
      if(mode==="PAID"){
        stage="ΠΛΗΡΩΜΗ ΒΑΡΔΙΑΣ";
        setStatus("Καταχώριση πληρωμής στη βάρδια…");
        const payment=await api(`/api/transactions/stores/${encodeURIComponent(store.id)}`,{method:"POST",body:JSON.stringify({type:"SUPPLIER_PAYMENT",amount:totalGross,supplierId,supplierName:supplier?.name||null,description:`Τιμολόγιο ${documentNumber.trim()} — PREMIUM FAST POS`,evidenceMode:"NO_DOCUMENT",paymentSource:"CASH_SHIFT",idempotencyKey:key})});
        paymentTransactionId=payment?.id||null;if(!paymentTransactionId)throw new Error("Η πληρωμή γράφτηκε χωρίς αναγνωριστικό συναλλαγής.");
        try{window.dispatchEvent(new CustomEvent("myworkstation:cash-drawer-request",{detail:{reason:"SUPPLIER_PAYMENT",amount:totalGross,storeId:store.id,transactionId:paymentTransactionId}}))}catch{}
      }
      setStatus("✅ Η FAST καταχώριση ολοκληρώθηκε. Η πλήρης ανάγνωση συνεχίζεται στο background.");
      const success=mode==="PAID"?`✅ Πληρωμή ${totalGross.toFixed(2)} € καταχωρίστηκε. Επιστροφή στο POS — τα προϊόντα διαβάζονται στο background.`:"✅ Τιμολόγιο με πίστωση καταχωρίστηκε. Επιστροφή στο POS — τα προϊόντα διαβάζονται στο background.";
      setMessage?.(success);onChanged?.();
      backgroundV244({api,store,fileDataUrl,filename:file.name||"timologio.jpg",mimeType:file.type||"image/jpeg",supplierId,documentNumber:documentNumber.trim(),documentDate,totalGross,mode,paymentTransactionId,supplierName:supplier?.name||null});
    }catch(error){
      const detail=error?.message||"Η καταχώριση απέτυχε.";
      setStatus(`❌ ΑΠΟΤΥΧΙΑ ΣΤΟ: ${stage}. ${detail}`);
      setMessage?.(`❌ ΑΠΟΤΥΧΙΑ ΣΤΟ ${stage}: ${detail}`);
      setBusy(false);
    }
  };
  return <div className="pos-payment-form-v3-root">
    <div style={{padding:"10px 12px",borderRadius:10,background:"#e9f8f1",fontWeight:900,color:"#0b6249",marginBottom:10}}>PREMIUM FAST — AI μόνο για τα 4 βασικά στοιχεία. Η πλήρης V2.4.4 ανάγνωση προϊόντων συνεχίζεται μετά στο BackOffice.</div>
    <div style={{padding:"9px 11px",borderRadius:9,background:"#fff",fontWeight:800,marginBottom:10}}>{status}</div>
    <div className="pos-photo-actions"><button type="button" onClick={startCamera} disabled={busy||reading}><Camera/> Λήψη από κάμερα</button><label><FileUp/> Επιλογή αρχείου / PDF<input type="file" accept="image/*,application/pdf" disabled={busy||reading} onChange={e=>selectFile(e.target.files?.[0]||null)}/></label><b>{file?.name||"Δεν επιλέχθηκε τιμολόγιο"}</b></div>
    {cameraOpen&&<div className="pos-camera-live"><video ref={videoRef} autoPlay playsInline/><canvas ref={canvasRef} hidden/><div><button type="button" onClick={capture}><Camera/> Φωτογράφιση</button><button type="button" onClick={stopCamera}>Κλείσιμο</button></div></div>}
    <label>Προμηθευτής<select value={supplierId} disabled={busy||savingSupplier} onChange={e=>setSupplierId(e.target.value)}><option value="">Επίλεξε προμηθευτή</option>{supplierOptions.map(s=><option key={s.id} value={s.id}>{s.name}{s.taxId?` · ${s.taxId}`:""}</option>)}</select></label>
    {!supplierId&&fileDataUrl&&<div style={{padding:"10px 12px",border:"1px solid #c9a227",borderRadius:10,background:"#fff8dc",margin:"8px 0"}}>
      <div style={{fontWeight:900,marginBottom:6}}>Νέος προμηθευτής</div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:8}}>
        <label>Επωνυμία<input value={supplierCandidate.name} disabled={savingSupplier||busy} onChange={e=>setSupplierCandidate(c=>({...c,name:e.target.value}))} placeholder="Επωνυμία προμηθευτή"/></label>
        <label>ΑΦΜ<input value={supplierCandidate.taxId} disabled={savingSupplier||busy} onChange={e=>setSupplierCandidate(c=>({...c,taxId:e.target.value}))} placeholder="ΑΦΜ"/></label>
      </div>
      <button type="button" onClick={saveNewSupplier} disabled={savingSupplier||busy||supplierCandidate.name.trim().length<2} style={{marginTop:8,fontWeight:900}}>{savingSupplier?"Καταχώριση…":"ΚΑΤΑΧΩΡΙΣΗ ΝΕΟΥ ΠΡΟΜΗΘΕΥΤΗ"}</button>
    </div>}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}><label>Συνολικό ποσό<input inputMode="decimal" value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/></label><label>Αριθμός τιμολογίου<input value={documentNumber} disabled={busy} onChange={e=>setDocumentNumber(e.target.value)}/></label><label>Ημερομηνία<input type="date" value={documentDate} disabled={busy} onChange={e=>setDocumentDate(e.target.value)}/></label></div>
    <div className="pos-payment-types"><button type="button" aria-pressed={mode==="PAID"} className={mode==="PAID"?"active":""} disabled={busy||reading||savingSupplier} onClick={()=>setMode("PAID")}>ΠΛΗΡΩΜΕΝΟ — από ταμείο</button><button type="button" aria-pressed={mode==="CREDIT"} className={mode==="CREDIT"?"active":""} disabled={busy||reading||savingSupplier} onClick={()=>setMode("CREDIT")}>ΜΕ ΠΙΣΤΩΣΗ</button></div>
    <button className="pos-primary-action" disabled={!ready} onClick={submit}><Wallet/> {reading?"FAST AI ανάγνωση…":savingSupplier?"Καταχώριση προμηθευτή…":busy?"Καταχώριση…":mode==="PAID"?"ΠΛΗΡΩΜΗ & ΕΠΙΣΤΡΟΦΗ ΣΤΟ POS":"ΚΑΤΑΧΩΡΙΣΗ ΜΕ ΠΙΣΤΩΣΗ"}</button>
  </div>;
}