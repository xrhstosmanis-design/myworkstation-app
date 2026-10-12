import {greeceDateInput} from "../../../../shared/greece-time.mjs";
import DocumentPhotoList from "./DocumentPhotoList.jsx";
import MobileDocumentPhotosQr from "./MobileDocumentPhotosQr.jsx";
import useMobileDocumentPhotos from "./useMobileDocumentPhotos.js";
import {bundleDocumentPhotos,validatePhotoSelection} from "../../lib/document-photo-pdf.js";
import DocumentCameraFocus from "./DocumentCameraFocus.jsx";
import React,{useEffect,useMemo,useRef,useState} from "react";
import {Camera,FileUp,Wallet} from "lucide-react";
import {finalizeV244ProductLines} from "../../lib/invoice-v244.js";
import {prepareDocumentFile} from "../../lib/document-image-quality.js";
import InvoiceQrCamera from "./InvoiceQrCamera.jsx";
import InvoiceQrScanner from "./InvoiceQrScanner.jsx";
import {knownSupplierFromFastHeaders} from "../../lib/invoice-fast-supplier-match.js";

const today=()=>greeceDateInput(new Date());
const num=v=>Number(String(v??"0").replace(/\s/g,"").replace(",","."))||0;
const readFile=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error("Δεν διαβάστηκε το παραστατικό."));r.readAsDataURL(file)});
const paymentKey=()=>`pos-invoice-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;

async function backgroundV244({api,store,fileDataUrl,filename,mimeType,supplierId,documentNumber,documentDate,totalGross,inboxId,mode,paymentTransactionId,onStatus}){
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
    const message=`✅ Ανέβηκε στο BackOffice για έλεγχο • ${productLines.length} γραμμές • ${mode==="PAID"?"ΠΛΗΡΩΜΕΝΟ":"ΜΕ ΠΙΣΤΩΣΗ"}`;await patch("IN_REVIEW",message);onStatus?.(message);
  }catch(error){
    const message=`❌ Δεν ανέβηκε στο BackOffice — χρειάζεται επανάληψη/έλεγχος • ${String(error?.message||error).slice(0,500)}`;await patch("IN_REVIEW",message);onStatus?.(message);
  }
}

export default function StoreSupplierInvoiceFast({api,store,suppliers=[],onChanged,onCompleted,setMessage}){
  const [files,setFiles]=useState([]),[supplierId,setSupplierId]=useState(""),[amount,setAmount]=useState(""),[documentNumber,setDocumentNumber]=useState(""),[documentDate,setDocumentDate]=useState(today()),[mode,setMode]=useState(""),[paymentMethod,setPaymentMethod]=useState("CASH_SHIFT"),[busy,setBusy]=useState(false),[cameraOpen,setCameraOpen]=useState(false),[stream,setStream]=useState(null);
  const [invoiceQrOpen,setInvoiceQrOpen]=useState(false);
  const [invoiceScannerOpen,setInvoiceScannerOpen]=useState(false);
  const videoRef=useRef(null),canvasRef=useRef(null);
  const file=files[0]||null;
  const supplier=useMemo(()=>suppliers.find(x=>String(x.id)===String(supplierId))||null,[suppliers,supplierId]);
  const paymentSource=paymentMethod==="CASH_SHIFT"?"CASH_SHIFT":"EXTERNAL";
  const paymentMethodLabel={CASH_SHIFT:"Μετρητά από ενεργή βάρδια",CORPORATE_CARD:"Εταιρική κάρτα",BANK_TRANSFER:"Τραπεζική μεταφορά",EMPLOYEE_REIMBURSEMENT:"Πληρωμή υπαλλήλου προς επιστροφή"}[paymentMethod];
  useEffect(()=>()=>{stream?.getTracks?.().forEach(track=>track.stop())},[stream]);
  const stopCamera=()=>{stream?.getTracks?.().forEach(t=>t.stop());setStream(null);setCameraOpen(false)};
  const openInvoiceQr=()=>{stopCamera();setInvoiceQrOpen(true)};
  const readInvoiceQr=data=>{
    setInvoiceQrOpen(false);setInvoiceScannerOpen(false);
    if(data.header.documentType==="CREDIT_NOTE"){setMessage?.("⚠️ Το QR αφορά πιστωτικό. Χρειάζεται καταχώριση πιστωτικού στο BackOffice.");return}
    const known=knownSupplierFromFastHeaders([data.header],suppliers);
    setFiles([data.file]);setSupplierId(known?.id||"");setAmount(Number(data.header.totalGross).toFixed(2).replace(".",","));setDocumentNumber(data.header.documentNumber);setDocumentDate(data.header.documentDate);setMode("");
    setMessage?.(`✅ Παραλήφθηκε το πρωτότυπο PDF μέσω QR (${data.pageCount} σελίδες). Έλεγξε προμηθευτή, κατάστημα, αριθμό και ποσό· επίλεξε εσύ πληρωμή ή πίστωση.${known?"":" Ο προμηθευτής χρειάζεται επιλογή με το ΑΦΜ του τιμολογίου: "+data.header.supplierTaxId}`);
  };
  const choosing=useRef(false),selectionGeneration=useRef(0);
  useEffect(()=>()=>{selectionGeneration.current++},[store.id]);
  const chooseFiles=async selected=>{
    const incoming=Array.from(selected||[]).filter(Boolean);if(!incoming.length||choosing.current)return;
    const generation=selectionGeneration.current;
    try{validatePhotoSelection(files,incoming)}catch(error){setMessage?.(`⚠️ ${error.message}`);return}
    choosing.current=true;setBusy(true);
    try{const prepared=[];for(const next of incoming){const result=await prepareDocumentFile(next,{strict:true,maxSide:3000,enhance:true});prepared.push(result.file)}if(generation!==selectionGeneration.current)return;setFiles(current=>[...current,...prepared]);setMessage?.("✅ Οι φωτογραφίες / αρχεία προστέθηκαν στο ίδιο παραστατικό.")}
    catch(error){if(generation===selectionGeneration.current)setMessage?.(`❌ ${error?.message||"Η εικόνα δεν πέρασε τον έλεγχο ποιότητας."}`)}
    finally{choosing.current=false;if(generation===selectionGeneration.current)setBusy(false)}
  };
  const chooseFile=next=>chooseFiles(next?[next]:[]);
  const mobile=useMobileDocumentPhotos({api,storeId:store.id,count:files.length,onFiles:chooseFiles,setMessage});

  const startCamera=async()=>{try{stopCamera();const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080}},audio:false});setStream(s);setCameraOpen(true);setTimeout(()=>{if(videoRef.current)videoRef.current.srcObject=s},0)}catch{setMessage?.("❌ Δεν μπόρεσε να ανοίξει η κάμερα.")}};
  const capture=()=>{const v=videoRef.current,c=canvasRef.current;if(!v||!c)return;c.width=v.videoWidth||1280;c.height=v.videoHeight||720;c.getContext("2d").drawImage(v,0,0,c.width,c.height);c.toBlob(blob=>{stopCamera();if(blob)chooseFile(new File([blob],`timologio-${Date.now()}.jpg`,{type:"image/jpeg"}))},"image/jpeg",.94)};

  const ready=Boolean(file&&supplierId&&num(amount)>0&&mode&&!busy&&!mobile.pending);
  const submit=async()=>{
    if(!ready)return;
    setBusy(true);
    try{
      const documentFile=await bundleDocumentPhotos(files),dataUrl=await readFile(documentFile),key=paymentKey();
      const responsibleName="POS";
      const note=`POS FAST • ${mode==="PAID"?"ΠΛΗΡΩΜΕΝΟ":"ΜΕ ΠΙΣΤΩΣΗ"} • Ποσό ${num(amount).toFixed(2)} €${documentNumber?` • Τιμολόγιο ${documentNumber}`:""} • Αναμονή V2.4.4`;
      const inbox=await api("/api/commerce/documents/inbox",{method:"POST",body:JSON.stringify({storeId:store.id,supplierId,responsibleName,note,file:{dataUrl,filename:documentFile.name||"timologio.jpg"}})});
      let paymentTransactionId=null;
      if(mode==="PAID"){
        const description=documentNumber?`Τιμολόγιο ${documentNumber} — γρήγορη καταχώριση POS`:"Πληρωμή προμηθευτή γρήγορη καταχώριση POS";
        const payment=await api(`/api/transactions/stores/${encodeURIComponent(store.id)}`,{method:"POST",body:JSON.stringify({type:"SUPPLIER_PAYMENT",amount:num(amount),supplierId,supplierName:supplier?.name||null,invoiceDocumentNumber:documentNumber.trim()||null,description,evidenceMode:"NO_DOCUMENT",paymentSource,paymentMethod,idempotencyKey:key})});
        paymentTransactionId=payment?.id||null;
        if(!paymentTransactionId)throw new Error("Η πληρωμή γράφτηκε χωρίς αναγνωριστικό συναλλαγής.");
        if(paymentSource==="CASH_SHIFT")try{window.dispatchEvent(new CustomEvent("myworkstation:cash-drawer-request",{detail:{reason:"SUPPLIER_PAYMENT",amount:num(amount),storeId:store.id,transactionId:paymentTransactionId}}))}catch{}
      }
      const successText=mode==="PAID"?`Η πληρωμή καταχωρίστηκε με ${paymentMethodLabel}`:"Το τιμολόγιο καταχωρίστηκε με πίστωση";
      setMessage?.(`✅ ${successText}. Επιστροφή στο POS — ο έλεγχος συνεχίζεται στο BackOffice.`);
      onChanged?.();
      backgroundV244({api,store,fileDataUrl:dataUrl,filename:documentFile.name||"timologio.jpg",mimeType:documentFile.type||"image/jpeg",supplierId,documentNumber,documentDate,totalGross:num(amount),inboxId:inbox.id,mode,paymentTransactionId,onStatus:setMessage});
      onCompleted?.();
    }catch(error){
      setMessage?.(`❌ ${error?.message||"Η καταχώριση απέτυχε."}`);
      setBusy(false);
    }
  };
  return <div className="pos-payment-form-v3-root pos-new-invoice-form pos-new-invoice-basic">
    <div className="pos-invoice-document-area">
    <div style={{padding:"10px 12px",borderRadius:10,background:"#e9f8f1",fontWeight:900,color:"#0b6249",marginBottom:10}}>FAST PAYMENT — ο υπάλληλος πληρώνει/παραλαμβάνει και επιστρέφει αμέσως στις πωλήσεις. Ο έλεγχος γίνεται στο BackOffice.</div>
    <div className="pos-photo-actions"><button type="button" disabled={busy||mobile.pending||files.length>0} onClick={()=>{stopCamera();setInvoiceQrOpen(false);setInvoiceScannerOpen(true)}}>Σάρωση QR με scanner</button><button type="button" disabled={busy||mobile.pending||files.length>=5||file?.type==="application/pdf"} onClick={startCamera}><Camera/> Λήψη από κάμερα</button><label><FileUp/> Επιλογή έως 5 φωτογραφιών / PDF<input type="file" multiple accept="image/*,application/pdf" disabled={busy||mobile.pending||files.length>=5||file?.type==="application/pdf"} onChange={e=>{const selected=Array.from(e.target.files||[]);e.target.value="";chooseFiles(selected)}}/></label><button type="button" disabled={busy||mobile.pending||files.length>=5||file?.type==="application/pdf"} onClick={mobile.createQr}>QR από κινητό</button></div><DocumentPhotoList files={files} onChange={setFiles} disabled={busy||mobile.pending}/><MobileDocumentPhotosQr mobile={mobile}/>

    {cameraOpen&&<div className="pos-camera-live"><video ref={videoRef} autoPlay playsInline/><canvas ref={canvasRef} hidden/><DocumentCameraFocus track={stream?.getVideoTracks?.()[0]}/><div><button type="button" onClick={capture}><Camera/> Φωτογράφιση</button><button type="button" disabled={busy||mobile.pending||files.length>0} onClick={openInvoiceQr}>Σάρωση QR τιμολογίου</button><button type="button" onClick={stopCamera}>Κλείσιμο</button></div></div>}
    {invoiceScannerOpen&&<InvoiceQrScanner key={store.id} api={api} store={store} onRead={readInvoiceQr} onClose={()=>setInvoiceScannerOpen(false)}/>}
    {invoiceQrOpen&&<InvoiceQrCamera key={store.id} api={api} store={store} onRead={readInvoiceQr} onClose={()=>setInvoiceQrOpen(false)}/>}
    </div>
    <div className="pos-invoice-fields-area">
    <label>Προμηθευτής<select value={supplierId} onChange={e=>setSupplierId(e.target.value)}><option value="">Επίλεξε προμηθευτή</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}{s.taxId?` · ${s.taxId}`:""}</option>)}</select></label>
    <div className="pos-invoice-reference-fields"><label>Ποσό<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/></label><label>Αρ. τιμολογίου <small>(προαιρετικό)</small><input value={documentNumber} onChange={e=>setDocumentNumber(e.target.value)}/></label><label>Ημερομηνία<input type="date" value={documentDate} onChange={e=>setDocumentDate(e.target.value)}/></label></div>
    <div className="pos-payment-types"><button type="button" aria-pressed={mode==="PAID"} className={mode==="PAID"?"active":""} onClick={()=>setMode("PAID")}>ΠΛΗΡΩΜΕΝΟ</button><button type="button" aria-pressed={mode==="CREDIT"} className={mode==="CREDIT"?"active":""} onClick={()=>setMode("CREDIT")}>ΜΕ ΠΙΣΤΩΣΗ</button></div>
    {mode==="PAID"&&<div className="pos-expense-payment-sources"><b>Τρόπος πληρωμής προμηθευτή</b><div>{[["CASH_SHIFT","Μετρητά από ενεργή βάρδια"],["CORPORATE_CARD","Εταιρική κάρτα"],["BANK_TRANSFER","Τραπεζική μεταφορά"],["EMPLOYEE_REIMBURSEMENT","Πληρωμή υπαλλήλου προς επιστροφή"]].map(([value,label])=><button key={value} type="button" className={paymentMethod===value?"active":""} disabled={busy} onClick={()=>setPaymentMethod(value)}>{label}</button>)}</div><small>{paymentSource==="CASH_SHIFT"?"Το ποσό αφαιρείται από το ταμείο της ενεργής βάρδιας.":"Η πληρωμή καταχωρίζεται εξωτερικά και δεν αφαιρείται από τη βάρδια."}</small></div>}
    <button className="pos-primary-action" disabled={!ready} onClick={submit}><Wallet/> {busy?"Καταχώριση…":mode==="PAID"?"ΠΛΗΡΩΜΗ & ΕΠΙΣΤΡΟΦΗ ΣΤΟ POS":"ΚΑΤΑΧΩΡΙΣΗ ΜΕ ΠΙΣΤΩΣΗ"}</button>
    </div>
  </div>;
}
