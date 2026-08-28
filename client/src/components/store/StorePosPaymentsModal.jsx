import React,{useEffect,useRef,useState} from "react";
import {Camera,Wallet,X} from "lucide-react";
import StoreSupplierInvoiceFast from "./StoreSupplierInvoiceFast.jsx";
import StoreSupplierInvoicePremiumFast from "./StoreSupplierInvoicePremiumFast.jsx";

const euro=v=>Number(v||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const num=v=>Number(String(v||"0").replace(",","."))||0;
const fileToDataUrl=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});
const paymentTabByStore=new Map();
const STALE_SHIFT_HOURS=24;
const cachedAccess=storeId=>{try{return JSON.parse(localStorage.getItem(`myworkstation:pos-runtime-access:${storeId}`)||"null")}catch{return null}};
function Pad({value,onChange}){const press=k=>{const c=String(value??"");if(k==="⌫")return onChange(c.slice(0,-1));if(k==="C")return onChange("");if(k===","){if(c.includes(",")||c.includes("."))return;return onChange(`${c||"0"},`)}onChange(`${c}${k}`.replace(/^0+(?=\d)/,""))};return <div className="pos-inline-keypad">{[7,8,9,4,5,6,1,2,3,0,",","⌫"].map(k=><button key={k} type="button" onClick={()=>press(String(k))}>{k}</button>)}<button type="button" className="wide" onClick={()=>press("C")}>ΚΑΘΑΡΙΣΜΟΣ</button></div>}

export default function StorePosPaymentsModal({api,store,onClose,onChanged,setMessage,setError}){
 const storeKey=String(store?.id||"default"),initialType=paymentTabByStore.get(storeKey)||"OTHER_EXPENSE";
 const [busy,setBusy]=useState(false),[localError,setLocalError]=useState(""),[ledger,setLedger]=useState(null),[access,setAccess]=useState(()=>cachedAccess(store?.id)),[expenseCategories,setExpenseCategories]=useState([]),[premiumInvoice,setPremiumInvoice]=useState(null),[cameraOpen,setCameraOpen]=useState(false),[stream,setStream]=useState(null);const videoRef=useRef(null),canvasRef=useRef(null);
 const [form,setForm]=useState({type:initialType,amount:"",description:"",expenseCategoryId:"",subtractFromShift:true,file:null});
 const setPaymentType=type=>{paymentTabByStore.set(storeKey,type);setLocalError("");setPaymentError("");setForm(c=>({...c,type}))};
 const setPaymentError=message=>{setLocalError(String(message||""));setError?.(message||"")};
 const stopCamera=()=>{stream?.getTracks?.().forEach(t=>t.stop());setStream(null);setCameraOpen(false)};
 useEffect(()=>{
  api(`/api/transactions/stores/${store.id}/overview`).then(setLedger).catch(e=>setPaymentError(e.message));
  if(!cachedAccess(store.id))api(`/api/store-pos/stores/${store.id}/access`).then(result=>setAccess(result?.access||{})).catch(e=>setPaymentError(e.message));
  api("/api/management/expense-categories").then(result=>setExpenseCategories((result?.items||[]).filter(x=>x.active!==false))).catch(()=>setExpenseCategories([]));
  api("/api/commerce/ai-reader/capability").then(()=>setPremiumInvoice(true)).catch(()=>setPremiumInvoice(false));
  return()=>stopCamera();
 },[]);
 useEffect(()=>{if(!access)return;const canSupplier=access.supplierPayment!==false,canOther=access.thirdPartyPayment!==false;if(form.type==="SUPPLIER_PAYMENT"&&!canSupplier&&canOther)setPaymentType("OTHER_EXPENSE");else if(form.type==="OTHER_EXPENSE"&&!canOther&&canSupplier)setPaymentType("SUPPLIER_PAYMENT");if(access.sameShiftPayments===false)setForm(c=>({...c,subtractFromShift:false}))},[access]);
 const canSupplier=access?.supplierPayment!==false,canOther=access?.thirdPartyPayment!==false,canSameShift=Boolean(access?.sameShiftPayments),hasPaymentAccess=canSupplier||canOther;
 const openedAt=ledger?.openSession?.openedAt?new Date(ledger.openSession.openedAt):null;
 const shiftAgeHours=openedAt&&!Number.isNaN(openedAt.getTime())?(Date.now()-openedAt.getTime())/3600000:null;
 const staleShift=Boolean(ledger?.openSession&&shiftAgeHours!=null&&shiftAgeHours>STALE_SHIFT_HOURS);
 const staleShiftMessage=staleShift?`Η ανοιχτή βάρδια είναι από ${openedAt.toLocaleString("el-GR",{dateStyle:"short",timeStyle:"short"})}. Δεν επιτρέπεται νέα κίνηση μετρητών σε ετεροχρονισμένη βάρδια. Κλείσε την παλιά βάρδια και άνοιξε τη σημερινή.`:"";
 const startCamera=async()=>{try{stopCamera();const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false});setStream(s);setCameraOpen(true);setTimeout(()=>{if(videoRef.current)videoRef.current.srcObject=s},0)}catch{setPaymentError("Δεν μπόρεσε να ανοίξει η κάμερα. Έλεγξε την άδεια κάμερας του browser.")}};
 const capture=()=>{const v=videoRef.current,c=canvasRef.current;if(!v||!c)return;c.width=v.videoWidth||1280;c.height=v.videoHeight||720;c.getContext("2d").drawImage(v,0,0,c.width,c.height);c.toBlob(blob=>{if(!blob)return;setForm(x=>({...x,file:new File([blob],`parastatiko-${Date.now()}.jpg`,{type:"image/jpeg"})}));stopCamera()},"image/jpeg",.9)};
 const submitOther=async()=>{setLocalError("");if(!canOther)return setPaymentError("Δεν έχεις δικαίωμα Πληρωμής προς Τρίτους από το BackOffice.");const amount=num(form.amount);if(amount<=0)return setPaymentError("Βάλε ποσό πληρωμής.");if(expenseCategories.length&&!form.expenseCategoryId)return setPaymentError("Επίλεξε κατηγορία εξόδου.");if(!form.file)return setPaymentError("Για καταχώριση Λοιπού Εξόδου χρειάζεται φωτογραφία ή αρχείο παραστατικού.");if(form.subtractFromShift&&staleShift)return setPaymentError(staleShiftMessage);const category=expenseCategories.find(x=>x.id===form.expenseCategoryId);const description=[category?.description,form.description].filter(Boolean).join(" — ")||null;setBusy(true);try{const dataUrl=await fileToDataUrl(form.file);await api(`/api/transactions/stores/${store.id}`,{method:"POST",body:JSON.stringify({type:"OTHER_EXPENSE",amount,description,subtractFromShift:Boolean(form.subtractFromShift),attachment:{dataUrl,filename:form.file.name||"parastatiko.jpg"}})});setLocalError("");setError?.("");setMessage(`Το έξοδο ${euro(amount)}${category?.description?` (${category.description})`:""} καταχωρίστηκε ${form.subtractFromShift?"στη βάρδια":"ως εξωτερική πληρωμή"} και στο BackOffice.`);onChanged?.();onClose()}catch(e){setPaymentError(e.message)}finally{setBusy(false)}};
 const supplierMode=form.type==="SUPPLIER_PAYMENT",suppliers=ledger?.suppliers||[];
 const invoiceChanged=()=>{onChanged?.()};
 const invoiceMessage=message=>{const success=String(message||"").startsWith("✅");if(success){setLocalError("");setError?.("")}setMessage?.(message);if(success)onClose?.()};
 const supplierInvoice=!canSupplier
  ?<div style={{padding:16,fontWeight:800}}>Δεν έχεις δικαίωμα Πληρωμής Προμηθευτή από το BackOffice.</div>
  :premiumInvoice===null
   ?<div style={{padding:16,fontWeight:800}}>Έλεγχος διαθέσιμου module…</div>
   :premiumInvoice
    ?<StoreSupplierInvoicePremiumFast api={api} store={store} suppliers={suppliers} onChanged={invoiceChanged} setMessage={invoiceMessage}/>
    :<StoreSupplierInvoiceFast api={api} store={store} suppliers={suppliers} onChanged={invoiceChanged} setMessage={invoiceMessage}/>;
 const blockPaidWithoutPermission=e=>{const button=e.target.closest?.("button");if(!button)return;const text=String(button.textContent||"").toLocaleUpperCase("el-GR");const isCashAction=text.includes("ΠΛΗΡΩΜΕΝΟ")||text.includes("ΠΛΗΡΩΜΗ &");if(!isCashAction)return;if(!canSameShift){e.preventDefault();e.stopPropagation();setPaymentError("Δεν έχεις δικαίωμα «Οι πληρωμές να αφαιρούνται από την ίδια βάρδια» από το BackOffice.");return}if(staleShift){e.preventDefault();e.stopPropagation();setPaymentError(staleShiftMessage)}};
 return <div className="pos-standard-modal" onMouseDown={e=>e.target===e.currentTarget&&!busy&&onClose()}><section><header><div><small>MYWORKSTATION STANDARD POS</small><h2>Πληρωμές</h2></div><button onClick={()=>!busy&&onClose()}><X/></button></header><main><div data-invoice-v244="1">
  {localError&&<div style={{margin:"0 0 10px",padding:"10px 12px",borderRadius:8,background:"#fee2e2",color:"#991b1b",fontWeight:800}}>{localError}</div>}
  {staleShift&&canSameShift&&<div style={{margin:"0 0 10px",padding:"10px 12px",borderRadius:8,background:"#fff5df",color:"#8a4b08",fontWeight:800}}>{staleShiftMessage}</div>}
  {!access?<div style={{padding:16,fontWeight:800}}>Έλεγχος δικαιωμάτων χειριστή…</div>:!hasPaymentAccess?<div style={{padding:16,fontWeight:800}}>Δεν έχεις ενεργό δικαίωμα πληρωμών από το BackOffice.</div>:<>
  <div style={{marginBottom:8}}><small style={{fontWeight:800,color:"#47655d"}}>{premiumInvoice?"PREMIUM AI READER — FAST στοιχεία / πληρωμή, προϊόντα στο background":"STANDARD — απλή καταχώριση πληρωμής προμηθευτή"}</small></div>
  <div className="pos-payment-types">{canOther&&<button type="button" aria-pressed={!supplierMode} className={!supplierMode?"active":""} onClick={()=>setPaymentType("OTHER_EXPENSE")}>Λοιπά έξοδα</button>}{canSupplier&&<button type="button" aria-pressed={supplierMode} className={supplierMode?"active":""} onClick={()=>setPaymentType("SUPPLIER_PAYMENT")}>Πληρωμή προμηθευτή</button>}</div>
  {supplierMode?<div onClickCapture={blockPaidWithoutPermission}>{!canSameShift&&<div style={{padding:"8px 10px",marginBottom:8,borderRadius:8,background:"#fff5df",fontWeight:800}}>Δεν επιτρέπεται πληρωμή από τα μετρητά της βάρδιας. Μπορείς να καταχωρίσεις το τιμολόγιο με πίστωση.</div>}{supplierInvoice}</div>:<div className="pos-payment-form">
   {expenseCategories.length>0&&<label>Κατηγορία εξόδου<select value={form.expenseCategoryId} onChange={e=>setForm(c=>({...c,expenseCategoryId:e.target.value}))}><option value="">— Επιλογή κατηγορίας —</option>{expenseCategories.map(category=><option key={category.id} value={category.id}>{category.description}</option>)}</select></label>}
   <label>Ποσό<input readOnly inputMode="decimal" value={form.amount}/></label><Pad value={form.amount} onChange={amount=>setForm(c=>({...c,amount}))}/><label>Παρατηρήσεις<input value={form.description} onChange={e=>setForm(c=>({...c,description:e.target.value}))}/></label>
   <div className="pos-photo-actions"><button type="button" onClick={startCamera}><Camera/> Λήψη από κάμερα</button><label><Camera/> Επιλογή αρχείου<input type="file" accept="image/*,application/pdf" onChange={e=>setForm(c=>({...c,file:e.target.files?.[0]||null}))}/></label><b>{form.file?.name||"Δεν επιλέχθηκε φωτογραφία"}</b></div>
   {cameraOpen&&<div className="pos-camera-live"><video ref={videoRef} autoPlay playsInline/><canvas ref={canvasRef} hidden/><div><button type="button" onClick={capture}><Camera/> Φωτογράφιση</button><button type="button" onClick={stopCamera}>Κλείσιμο κάμερας</button></div></div>}
   {canSameShift?<label className="pos-check"><input type="checkbox" checked={form.subtractFromShift} onChange={e=>setForm(c=>({...c,subtractFromShift:e.target.checked}))}/>Αφαίρεση από τα μετρητά της βάρδιας</label>:<div style={{padding:"8px 10px",borderRadius:8,background:"#f3f6f8",fontWeight:800}}>Η πληρωμή θα καταχωριστεί εξωτερικά και δεν θα αφαιρεθεί από τη βάρδια.</div>}<button className="pos-primary-action" disabled={busy} onClick={submitOther}><Wallet/> {busy?"Καταχώριση…":"Καταχώριση εξόδου"}</button>
  </div>}</>}
 </div></main></section></div>
}
