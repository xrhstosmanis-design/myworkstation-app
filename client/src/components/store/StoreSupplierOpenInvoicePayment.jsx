import useCameraAcquisition from "./useCameraAcquisition.js";
import {captureCameraFrame} from "../../lib/camera-acquisition.js";
import DocumentScanButton from "./DocumentScanButton.jsx";
import {greeceDateTimeInput,greeceDateTimeToIso} from "../../../../shared/greece-time.mjs";
import DocumentPhotoList from "./DocumentPhotoList.jsx";
import MobileDocumentPhotosQr from "./MobileDocumentPhotosQr.jsx";
import useMobileDocumentPhotos from "./useMobileDocumentPhotos.js";
import {bundleDocumentPhotos,validatePhotoSelection} from "../../lib/document-photo-pdf.js";
import DocumentCameraFocus from "./DocumentCameraFocus.jsx";
import React,{useEffect,useMemo,useRef,useState} from "react";
import {Camera,FileText,Upload,Wallet} from "lucide-react";
import "./store-pos-open-invoices.css";
import {prepareDocumentFile} from "../../lib/document-image-quality.js";

const num=value=>Number(String(value??"0").replace(",","."))||0;
const euro=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const readFile=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error("Δεν διαβάστηκε το αποδεικτικό."));reader.readAsDataURL(file)});
const key=()=>`supplier-settlement-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;

export default function StoreSupplierOpenInvoicePayment({api,store,suppliers=[],onChanged,onCompleted,setMessage,allowCash=true}){
  const cameraSession=useCameraAcquisition(store.id);
  const [supplierId,setSupplierId]=useState(""),[items,setItems]=useState([]),[allocations,setAllocations]=useState({}),[paymentMethod,setPaymentMethod]=useState("CASH_SHIFT"),[files,setFiles]=useState([]),[paidAt,setPaidAt]=useState(()=>greeceDateTimeInput()),[note,setNote]=useState(""),[feedback,setFeedback]=useState(null),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[cameraOpen,setCameraOpen]=useState(false),[stream,setStream]=useState(null);
  const videoRef=useRef(null),canvasRef=useRef(null),paymentKey=useRef(key()),submitting=useRef(false);
  const [noDocumentAcknowledged,setNoDocumentAcknowledged]=useState(false);
  const [advances,setAdvances]=useState([]),[advanceId,setAdvanceId]=useState("");
  const [paidAmount,setPaidAmount]=useState(""),[advanceAcknowledged,setAdvanceAcknowledged]=useState(false);
  const file=files[0]||null;
  const selected=useMemo(()=>suppliers.find(row=>String(row.id)===String(supplierId))||null,[suppliers,supplierId]);
  const allocatedTotal=useMemo(()=>Number(Object.values(allocations).reduce((sum,value)=>sum+num(value),0).toFixed(2)),[allocations]);
  const total=paidAmount.trim()===""?allocatedTotal:num(paidAmount),advanceAmount=Number((total-allocatedTotal).toFixed(2));
  useEffect(()=>{setAdvanceAcknowledged(false);setNoDocumentAcknowledged(false)},[paidAmount,allocations]);
  useEffect(()=>{setPaidAmount("");setAdvanceAcknowledged(false)},[store.id,supplierId]);
  useEffect(()=>()=>{stream?.getTracks?.().forEach(track=>track.stop())},[stream]);
  const chosenAdvance=advances.find(a=>a.id===advanceId)||null;
  const stopCamera=()=>{cameraSession.cancel();stream?.getTracks?.().forEach(track=>track.stop());setStream(null);setCameraOpen(false)};
  useEffect(()=>()=>stopCamera(),[]);
  useEffect(()=>{if(!allowCash&&paymentMethod==="CASH_SHIFT")setPaymentMethod("CORPORATE_CARD")},[allowCash,paymentMethod]);
  // Parent refreshes recreate callbacks; they must not erase an in-progress amount.
  const invoiceCallbacks=useRef({api,setMessage});
  invoiceCallbacks.current={api,setMessage};
  useEffect(()=>{
    let cancelled=false;
    setItems([]);setAllocations({});setAdvances([]);setAdvanceId("");setLoading(false);
    if(!store.id||!supplierId)return;
    setLoading(true);
    invoiceCallbacks.current.api(`/api/transactions/stores/${encodeURIComponent(store.id)}/supplier-open-invoices?supplierId=${encodeURIComponent(supplierId)}`)
      .then(data=>{if(!cancelled){setItems(data.items||[]);setAdvances(data.advances||[])}})
      .catch(error=>{if(!cancelled)invoiceCallbacks.current.setMessage?.(`❌ ${error?.message||"Δεν φορτώθηκαν τα ανοιχτά τιμολόγια."}`)})
      .finally(()=>{if(!cancelled)setLoading(false)});
    return()=>{cancelled=true};
  },[store.id,supplierId]);
  useEffect(()=>setNoDocumentAcknowledged(false),[store.id,supplierId,paymentMethod,allocations,paidAt]);
  const choosing=useRef(false),selectionGeneration=useRef(0);
  useEffect(()=>()=>{selectionGeneration.current++},[store.id]);
  const chooseFiles=async selected=>{
    const incoming=Array.from(selected||[]).filter(Boolean);if(!incoming.length||choosing.current)return;
    const generation=selectionGeneration.current;
    try{validatePhotoSelection(files,incoming)}catch(error){setMessage?.(`⚠️ ${error.message}`);return}
    choosing.current=true;setBusy(true);
    try{const prepared=[];for(const next of incoming){const result=await prepareDocumentFile(next,{strict:true,maxSide:3000,enhance:true});prepared.push(result.file)}if(generation!==selectionGeneration.current)return;setFiles(current=>[...current,...prepared]);setNoDocumentAcknowledged(false);setMessage?.("✅ Οι φωτογραφίες / αρχεία προστέθηκαν στο ίδιο παραστατικό.")}
    catch(error){if(generation===selectionGeneration.current)setMessage?.(`❌ ${error?.message||"Η εικόνα δεν πέρασε τον έλεγχο ποιότητας."}`)}
    finally{choosing.current=false;if(generation===selectionGeneration.current)setBusy(false)}
  };
  const chooseFile=next=>chooseFiles(next?[next]:[]);
  const mobile=useMobileDocumentPhotos({api,storeId:store.id,count:files.length,onFiles:chooseFiles,setMessage});

  const startCamera=async()=>{try{stopCamera();const next=await cameraSession.open();if(!next)return;setStream(next);setCameraOpen(true);setTimeout(()=>{if(videoRef.current&&cameraSession.current(epoch))videoRef.current.srcObject=next},0);const epoch=cameraSession.checkpoint()}catch(error){setMessage?.(`❌ ${error.message}`)}};
  const capture=async()=>{const epoch=cameraSession.checkpoint();try{const file=await captureCameraFrame(videoRef.current,{name:`parastatiko-${Date.now()}.jpg`,isCurrent:()=>cameraSession.current(epoch)});if(!file)return;stopCamera();chooseFile(file)}catch(error){setMessage?.(`❌ ${error.message}`)}};
  const submit=async()=>{
    if(submitting.current)return;
    const rows=items.map(item=>({purchaseDocumentId:item.id,amount:num(allocations[item.id])})).filter(row=>row.amount>0);
    if(!selected)return setMessage?.("❌ Επίλεξε προμηθευτή.");
    if(advanceId){
      if(!chosenAdvance||!rows.length||allocatedTotal>chosenAdvance.availableAmount)return setMessage?.("❌ Επίλεξε τιμολόγια μέχρι το διαθέσιμο έναντι.");
      submitting.current=true;setBusy(true);try{await api(`/api/transactions/stores/${encodeURIComponent(store.id)}/supplier-advances/${encodeURIComponent(advanceId)}/allocate`,{method:"POST",body:JSON.stringify({expectedAvailable:chosenAdvance.availableAmount,allocations:rows,idempotencyKey:paymentKey.current})});setMessage?.(`✅ Συμψηφίστηκαν ${euro(allocatedTotal)} από υπάρχον έναντι. Δεν έγινε νέα πληρωμή ή άνοιγμα συρταριού.`);paymentKey.current=key();setAllocations({});setAdvanceId("");setAdvances([]);onChanged?.();onCompleted?.()}catch(error){setMessage?.(`❌ ${error.message}`)}finally{submitting.current=false;setBusy(false)}return;
    }
    if(!(total>0)||total<allocatedTotal)return setMessage?.("❌ Το ποσό που παραδόθηκε πρέπει να καλύπτει τα επιλεγμένα τιμολόγια.");
    if(advanceAmount>0&&!advanceAcknowledged)return setMessage?.("❌ Επιβεβαίωσε το ποσό που μένει ως έναντι.");
    if(!file&&!noDocumentAcknowledged)return setMessage?.("❌ Ανέβασε αποδεικτικό ή αποδέξου τη δήλωση ευθύνης χωρίς αποδεικτικό.");
    if(rows.some(row=>row.amount>(items.find(item=>item.id===row.purchaseDocumentId)?.outstandingAmount||0)+.005))return setMessage?.("❌ Ένα ποσό υπερβαίνει το διαθέσιμο υπόλοιπο τιμολογίου.");
    submitting.current=true;setBusy(true);setFeedback(null);
    try{
      let attachment=null;
      if(file){const documentFile=await bundleDocumentPhotos(files,{maxBytes:1200000});attachment={dataUrl:await readFile(documentFile),filename:documentFile.name||"apodeixi.jpg"}}
      const result=await api(`/api/transactions/stores/${encodeURIComponent(store.id)}/supplier-settlements`,{method:"POST",body:JSON.stringify({supplierId,paymentMethod,totalAmount:total,advanceAcknowledged,paidAt:greeceDateTimeToIso(paidAt),note:note.trim()||null,attachment,evidenceMode:file?"DOCUMENT":"NO_DOCUMENT",noDocumentAcknowledged:!file&&noDocumentAcknowledged,allocations:rows,idempotencyKey:paymentKey.current})});
      if(paymentMethod==="CASH_SHIFT")try{window.dispatchEvent(new CustomEvent("myworkstation:cash-drawer-request",{detail:{reason:"SUPPLIER_PAYMENT",amount:total,storeId:store.id,transactionId:result?.transaction?.id}}))}catch{}
      const success=`✅ Πληρωμή ${euro(total)} για ${selected.name} ${result?.status==="CONFIRMED"?"επιβεβαιώθηκε ως πληρωμή ιδιοκτήτη":"καταχωρίστηκε σε αναμονή ελέγχου"}. Δεν αλλάζει δεύτερη φορά κανένα τιμολόγιο ή απόθεμα.`;setFeedback({ok:true,text:success});setMessage?.(success);
      setItems([]);setAllocations({});setPaidAmount("");setAdvanceAcknowledged(false);setFiles([]);setNote("");setNoDocumentAcknowledged(false);paymentKey.current=key();onChanged?.();onCompleted?.();
    }catch(error){const failure=`❌ ${error?.message||"Δεν καταχωρίστηκε η πληρωμή."}`;setFeedback({ok:false,text:failure});setMessage?.(failure)}finally{submitting.current=false;setBusy(false)}
  };
  return <div className="pos-payment-form-v3-root pos-open-invoice-form">
    <div style={{padding:"10px 12px",borderRadius:10,background:"#e9f8f1",fontWeight:900,color:"#0b6249",marginBottom:10}}>Πληρωμή ανοιχτών τιμολογίων — βλέπεις μόνο τις οφειλές του επιλεγμένου προμηθευτή. Η επιβεβαίωση γίνεται στο BackOffice.</div>
    <label>Προμηθευτής<select value={supplierId} disabled={busy} onChange={event=>setSupplierId(event.target.value)}><option value="">Επίλεξε προμηθευτή</option>{suppliers.map(row=><option key={row.id} value={row.id}>{row.name}{row.taxId?` · ${row.taxId}`:""}</option>)}</select></label>
    {supplierId&&<div className="supplier-open-invoices">{loading?<div style={{padding:12,fontWeight:800}}>Φόρτωση ανοιχτών τιμολογίων…</div>:items.length?<>{items.map(item=><div key={item.id} className="supplier-open-invoice-row"><div><b>{item.documentNumber||"Χωρίς αριθμό"}</b><small style={{display:"block"}}>{String(item.documentDate||"").slice(0,10)} · {item.storeName} · Υπόλοιπο {euro(item.outstandingAmount)}</small></div><input className="supplier-open-invoice-amount" aria-label={`Ποσό για ${item.documentNumber||item.id}`} inputMode="decimal" value={allocations[item.id]||""} max={item.outstandingAmount} placeholder="0,00" disabled={busy} onChange={event=>setAllocations(current=>({...current,[item.id]:event.target.value}))}/></div>)}<div style={{padding:10,fontWeight:900,textAlign:"right"}}>Σύνολο επιλεγμένης πληρωμής: {euro(total)}</div></>:<div style={{padding:12,fontWeight:800}}>Δεν υπάρχουν απλήρωτα τιμολόγια με πίστωση για αυτόν τον προμηθευτή.</div>}</div>}
    {supplierId&&<label>Χρήση πληρωμής<select aria-label="Χρήση πληρωμής" value={advanceId} disabled={busy||loading} onChange={e=>{setAdvanceId(e.target.value);setNoDocumentAcknowledged(false);setAdvanceAcknowledged(false);paymentKey.current=key()}}><option value="">Νέα πληρωμή στον προμηθευτή</option>{advances.map(a=><option value={a.id} key={a.id}>Συμψηφισμός υπάρχοντος έναντι · {euro(a.availableAmount)}</option>)}</select></label>}
    {chosenAdvance&&<p>Διαθέσιμο επιβεβαιωμένο έναντι: {euro(chosenAdvance.availableAmount)}. Επίλεξε κατανομές στα τιμολόγια. Δεν αφαιρούνται ξανά χρήματα από το ταμείο.</p>}
    {supplierId&&!advanceId&&<div className="pos-supplier-advance" style={{padding:14,border:"2px solid #087a52",borderRadius:12,background:"#eefaf5",display:"grid",gap:10,fontSize:18}}><label>Ποσό που παραδόθηκε στον προμηθευτή<input aria-label="Ποσό που παραδόθηκε" inputMode="decimal" value={paidAmount} placeholder={allocatedTotal.toFixed(2)} disabled={busy} onChange={e=>setPaidAmount(e.target.value)}/></label><p>Σε τιμολόγια: {euro(allocatedTotal)} · Συνολική πληρωμή: {euro(total)}</p>{advanceAmount>0&&<><strong>Έναντι στον προμηθευτή: {euro(advanceAmount)}</strong><label><input type="checkbox" style={{width:24,height:24,minHeight:24,marginRight:10}} checked={advanceAcknowledged} disabled={busy} onChange={e=>setAdvanceAcknowledged(e.target.checked)}/> Η διαφορά μένει στην καρτέλα του προμηθευτή ως έναντι.</label></>}{advanceAmount<0&&<p role="alert">Το ποσό δεν καλύπτει τις επιλεγμένες κατανομές.</p>}</div>}
    {Boolean(supplierId)&&!advanceId&&<>
      <div className="pos-expense-payment-sources"><b>Τρόπος πληρωμής</b><div>{[["CASH_SHIFT","Μετρητά από ενεργή βάρδια"],["CORPORATE_CARD","Εταιρική κάρτα"],["BANK_TRANSFER","Τραπεζική μεταφορά"],["EMPLOYEE_REIMBURSEMENT","Πληρωμή υπαλλήλου προς επιστροφή"]].map(([value,label])=><button key={value} type="button" className={paymentMethod===value?"active":""} disabled={busy||(value==="CASH_SHIFT"&&!allowCash)} onClick={()=>setPaymentMethod(value)}>{label}</button>)}</div><small>{paymentMethod==="CASH_SHIFT"?"Μόνο αυτή η επιλογή αφαιρεί άμεσα το ποσό από την ενεργή βάρδια.":"Η καταχώριση είναι εξωτερική· το φυσικό ταμείο της βάρδιας δεν αλλάζει."}</small></div>
      {["CORPORATE_CARD","BANK_TRANSFER"].includes(paymentMethod)&&<small>Η κίνηση καταχωρίζεται στο ενιαίο εικονικό «Ταμείο Τράπεζας» του καταστήματος. Δεν γίνεται σύνδεση με πραγματικό τραπεζικό λογαριασμό.</small>}
    </>}
    {!advanceId&&<><label>Ημερομηνία και ώρα πραγματικής πληρωμής (Ελλάδας)<input lang="en-GB" type="datetime-local" value={paidAt} disabled={busy} onChange={event=>setPaidAt(event.target.value)}/></label><label>Σημείωση <small>(προαιρετική)</small><input value={note} disabled={busy} onChange={event=>setNote(event.target.value)} placeholder="π.χ. αριθμός μεταφοράς"/></label><div className="pos-photo-actions"><strong><Upload/> Αποδεικτικό πληρωμής</strong><div><label><Camera/> Έως 5 φωτογραφίες από PC<input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy||mobile.pending||files.length>=5||file?.type==="application/pdf"} onChange={e=>{const selected=Array.from(e.target.files||[]);e.target.value="";chooseFiles(selected)}}/></label><label><FileText/> PDF από PC<input type="file" accept="application/pdf" disabled={busy||mobile.pending||files.length>0} onChange={e=>{const next=e.target.files?.[0];e.target.value="";chooseFile(next)}}/></label><button type="button" disabled={busy||mobile.pending||files.length>=5||file?.type==="application/pdf"} onClick={startCamera}><Camera/> Λήψη από κάμερα</button><button type="button" disabled={busy||mobile.pending||files.length>=5||file?.type==="application/pdf"} onClick={mobile.createQr}>QR από κινητό</button></div></div><DocumentScanButton scopeKey={store.id} onFiles={chooseFiles} disabled={busy||mobile.pending||files.length>=5||file?.type==="application/pdf"} maxPages={5-files.length}/><DocumentPhotoList files={files} onChange={setFiles} disabled={busy||mobile.pending}/>{!file&&<div className="pos-supplier-no-document"><b>Πληρωμή χωρίς αποδεικτικό</b><p>Δηλώνω υπεύθυνα ότι πραγματοποίησα την πληρωμή {euro(total)} στον προμηθευτή {selected?.name||"που θα επιλέξω"}, με τον επιλεγμένο τρόπο πληρωμής, και αναλαμβάνω την ευθύνη της καταχώρισης χωρίς αποδεικτικό.</p><button type="button" className="pos-supplier-no-document-toggle" aria-pressed={noDocumentAcknowledged} disabled={busy||mobile.pending||!selected||!total} onClick={()=>setNoDocumentAcknowledged(current=>!current)}>{noDocumentAcknowledged?"✓ Δήλωση αποδεκτή — χωρίς αποδεικτικό":"Δηλώνω υπεύθυνα ότι παρέδωσα τα χρήματα"}</button><small>Η δήλωση, το ποσό, ο χειριστής και η ώρα καταγράφονται. Η πληρωμή παραμένει προς έλεγχο στο BackOffice.</small></div>}<MobileDocumentPhotosQr mobile={mobile}/>{files.length>1&&<small>Όριο συνολικού αποδεικτικού 1,2 MB. Όλες οι φωτογραφίες συνδέονται με την ίδια πληρωμή.</small>}{feedback&&<div role="status" style={{padding:"10px 12px",borderRadius:8,background:feedback.ok?"#e7f8ef":"#fee2e2",color:feedback.ok?"#08783e":"#991b1b",fontWeight:800}}>{feedback.text}</div>}{cameraOpen&&<div className="pos-camera-live"><video ref={videoRef} autoPlay playsInline/><canvas ref={canvasRef} hidden/><DocumentCameraFocus track={stream?.getVideoTracks?.()[0]} videoRef={videoRef}/><div><button type="button" onClick={capture}>Φωτογράφιση</button><button type="button" onClick={stopCamera}>Κλείσιμο κάμερας</button></div></div>}</>}<button className="pos-primary-action" disabled={busy||mobile.pending||(advanceId?(!chosenAdvance||!allocatedTotal||allocatedTotal>chosenAdvance.availableAmount):(!total||advanceAmount<0||(advanceAmount>0&&!advanceAcknowledged)||(!file&&!noDocumentAcknowledged)))} onClick={submit}><Wallet/> {busy?"Καταχώριση…":advanceId?"Συμψηφισμός έναντι χωρίς νέα πληρωμή":"Καταχώριση πληρωμής προς έλεγχο"}</button>
  </div>;
}


