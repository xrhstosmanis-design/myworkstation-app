import {inboxBusinessLabel} from "../../../../shared/invoice-inbox-state.mjs";
import InvoiceCommonDraftReview from "./InvoiceCommonDraftReview.jsx";
import {greeceDateInput} from "../../../../shared/greece-time.mjs";
import React,{useEffect,useMemo,useRef,useState} from "react";
import {CloudDownload,Eye,Inbox,RefreshCw,RotateCw,Search,Trash2} from "lucide-react";
import "./invoice-inbox.css";


const labels={RECEIVED:"Αρχειοθετήθηκε",IN_REVIEW:"Σε έλεγχο",PROCESSED:"Ελεγμένο"};
const when=value=>value?new Date(value).toLocaleString("el-GR",{timeZone:"Europe/Athens",hour12:false}):"—";
const dayKey=value=>{if(!value)return "Χωρίς ημερομηνία";const d=new Date(value);return Number.isNaN(d.getTime())?"Χωρίς ημερομηνία":d.toLocaleDateString("el-GR",{...({year:"numeric",month:"2-digit",day:"2-digit"}),timeZone:"Europe/Athens"})};
const isoDay=value=>{if(!value)return "";const d=new Date(value);return Number.isNaN(d.getTime())?"":greeceDateInput(d)};

export default function InvoiceInboxPanel({api,stores=[],onOpenAi,onOpenOrder,readOnly=false,canUploadOriginal=false,canFetchOriginal=false}){
  const [storeId,setStoreId]=useState(stores[0]?.id||"");
  const [items,setItems]=useState([]);
  const [inboxView,setInboxView]=useState("today");
  const [processing,setProcessing]=useState("PENDING");
  const [offset,setOffset]=useState(0);
  const [total,setTotal]=useState(0);
  const [archiveTotal,setArchiveTotal]=useState(0);
  const [supplierOptions,setSupplierOptions]=useState([]);
  const loadSequence=useRef(0);
  const reviewScope=useRef({storeId,api,readOnly,canUploadOriginal,canFetchOriginal,epoch:0,mounted:true});
  const flight=useRef(null);
  if(reviewScope.current.storeId!==storeId||reviewScope.current.api!==api||reviewScope.current.readOnly!==readOnly||reviewScope.current.canUploadOriginal!==canUploadOriginal||reviewScope.current.canFetchOriginal!==canFetchOriginal){reviewScope.current={storeId,api,readOnly,canUploadOriginal,canFetchOriginal,epoch:reviewScope.current.epoch+1,mounted:reviewScope.current.mounted};flight.current=null}
  const scope=reviewScope.current;
  const current=token=>reviewScope.current.mounted&&reviewScope.current===token;
  const begin=(id,{allowReadOnly=false}={})=>{if(flight.current||readOnly&&!allowReadOnly)return null;const token={scope:reviewScope.current,id};flight.current=token;setWorkingId(id);setError("");return token};
  const finish=token=>{if(flight.current===token){flight.current=null;if(current(token.scope))setWorkingId("")}};
  useEffect(()=>{setWorkingId("");setMessage("");setError("");setReconcileItem(null)},[storeId,api,readOnly,canUploadOriginal,canFetchOriginal]);
  useEffect(()=>{reviewScope.current.mounted=true;return()=>{reviewScope.current.mounted=false}},[]);
  const refreshCurrent=useRef(()=>{});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [supplierFilter,setSupplierFilter]=useState("");
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");
  const [applied,setApplied]=useState({q:"",supplier:"",dateFrom:"",dateTo:""});
  const [todayItems,setTodayItems]=useState([]);
  const [todayTotal,setTodayTotal]=useState(0);
  const [todayOffset,setTodayOffset]=useState(0);
  const [workingId,setWorkingId]=useState("");
  const [message,setMessage]=useState("");
  const [myDataStatus,setMyDataStatus]=useState(null);
  const [reconcileItem,setReconcileItem]=useState(null);
  useEffect(()=>{if(!storeId&&stores[0])setStoreId(stores[0].id)},[stores,storeId]);
  const archiveUrl=(extra={})=>`/api/commerce/documents/inbox/archive?${new URLSearchParams({storeId,...applied,processing,receivedBeforeToday:"true",offset:String(offset),...extra})}`;
  const load=async()=>{if(!storeId)return;const token=reviewScope.current;const sequence=++loadSequence.current;setLoading(true);setError("");try{const [result,today]=await Promise.all([api(archiveUrl()),api(archiveUrl({q:"",supplier:"",dateFrom:"",dateTo:"",receivedToday:"true",receivedBeforeToday:"",offset:String(todayOffset)}))]);if(current(token)&&sequence===loadSequence.current){setItems(result.items);setTodayItems(today.items);setTodayTotal(today.total);setTotal(result.total);setArchiveTotal(result.archiveTotal);setSupplierOptions(result.suppliers)}}catch(err){if(current(token)&&sequence===loadSequence.current)setError(err.message)}finally{if(current(token)&&sequence===loadSequence.current)setLoading(false)}};
  useEffect(()=>{loadSequence.current++;const timer=setTimeout(load,250);return()=>{clearTimeout(timer);loadSequence.current++}},[storeId,api,readOnly,applied,processing,offset,todayOffset]);
  const exportArchive=async(format,item,extra={})=>{const token=reviewScope.current;const popup=format==="pdf"?window.open("","_blank"):null;if(format==="pdf"&&!popup){setError("Επιτρέψτε τα αναδυόμενα παράθυρα για την αναφορά PDF.");return}setWorkingId("EXPORT");setError("");try{if(popup)popup.document.body.textContent="Προετοιμασία αναφοράς…";const result=await api(archiveUrl({format,...extra,...(item?{id:item.id,q:"",supplier:"",dateFrom:"",dateTo:"",receivedToday:"",receivedBeforeToday:"",processing:"ALL"}:{})}));if(!current(token)){popup?.close();return}if(popup){popup.document.open();popup.document.write(result.html);popup.document.close()}else{const link=document.createElement("a");link.href=result.dataUrl;link.download=result.filename;link.click()}setMessage(`${result.count} παραστατικά στην εξαγωγή. Η αναφορά περιέχει στοιχεία και δεν είναι πρωτότυπο PDF προμηθευτή.`)}catch(err){popup?.close();if(current(token))setError(err.message)}finally{if(current(token))setWorkingId("")}};
  const loadMyDataStatus=async()=>{if(readOnly||!storeId)return;const token=reviewScope.current;try{const result=await api(`/api/commerce/documents/mydata/status?storeId=${encodeURIComponent(storeId)}`);if(current(token))setMyDataStatus(result)}catch{if(current(token))setMyDataStatus(null)}};
  const syncMyData=async automatic=>{if(readOnly||!storeId)return;const token=begin("MYDATA");if(!token)return;if(!automatic)setMessage("");try{const result=await api("/api/commerce/documents/mydata/sync",{method:"POST",body:JSON.stringify({storeId})});if(!current(token.scope))return;if(!automatic||result.created)setMessage(result.message);await Promise.all([load(),loadMyDataStatus()])}catch(err){if(current(token.scope)&&!automatic)setError(err.message)}finally{finish(token)}};
  refreshCurrent.current=()=>{load();loadMyDataStatus()};
  useEffect(()=>{if(readOnly)return;loadMyDataStatus();const timer=setInterval(()=>{if(myDataStatus?.serverAutomatic){refreshCurrent.current()}else if(myDataStatus?.enabled&&!myDataStatus?.labLocked)syncMyData(true)},15*60*1000);return()=>clearInterval(timer)},[storeId,api,readOnly,myDataStatus?.enabled,myDataStatus?.labLocked,myDataStatus?.lastSyncAt]);
  const filtered=items;
  const groupItems=filtered=>{const supplierMap=new Map();for(const item of filtered){const supplier=item.supplierName||"Χωρίς αντιστοίχιση προμηθευτή";if(!supplierMap.has(supplier))supplierMap.set(supplier,new Map());const days=supplierMap.get(supplier),day=isoDay(item.issueDate)||"Χωρίς ημερομηνία";if(!days.has(day))days.set(day,[]);days.get(day).push(item)}return [...supplierMap.entries()].sort((a,b)=>a[0].localeCompare(b[0],"el")).map(([supplier,days])=>({supplier,days:[...days.entries()].sort((a,b)=>b[0].localeCompare(a[0])).map(([day,rows])=>({day,rows:rows.sort((a,b)=>new Date(b.receivedAt||0)-new Date(a.receivedAt||0))}))}))};
  const groups=useMemo(()=>groupItems(items),[items]);
  const todayGroups=useMemo(()=>groupItems(todayItems),[todayItems]);
  const view=async item=>{const token=reviewScope.current;try{const result=await api(`/api/commerce/documents/inbox/${item.id}/file`);if(!current(token))return;const popup=window.open();if(!popup)return;if(readOnly){if(!/^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,[A-Za-z0-9+/=\r\n]+$/.test(result.dataUrl||'')){popup.close();throw Error('Δεν επιβεβαιώθηκε διαθέσιμο πρωτότυπο PDF ή εικόνα.')}popup.opener=null;popup.document.title=result.filename||'Παραστατικό';const media=popup.document.createElement(result.mimeType==='application/pdf'?'iframe':'img');media.src=result.dataUrl;media.style.cssText='border:0;width:100%;min-height:95vh;object-fit:contain';popup.document.body.appendChild(media);return;}popup.document.write(result.mimeType==="application/pdf"?`<title>${result.filename}</title><iframe src="${result.dataUrl}" style="border:0;width:100vw;height:100vh"></iframe>`:`<title>${result.filename}</title><img src="${result.dataUrl}" style="max-width:100%;height:auto;display:block;margin:auto">`)}catch(err){if(current(token))setError(err.message)}};
  const navigateOrder=detail=>onOpenOrder?onOpenOrder(detail):document.dispatchEvent(new CustomEvent("purchase-orders:open",{detail}));
  const receiveOriginal=async(item,explicitAssistant=false)=>{
    const token=begin(item.id);if(!token)return;const selectedStore=storeId;
    try{
      const result=await api(`/api/commerce/documents/inbox/${item.id}/original`,{method:"POST",body:JSON.stringify({storeId:selectedStore})});
      if(!current(token.scope))return;
      if(result.reconciliationRequired===true){setReconcileItem(item);setMessage("Το PDF είναι διαθέσιμο. Απαιτείται αντιστοίχιση με το υπάρχον πρόχειρο POS.");await load();return}
      const dto=result.pdfReadiness,hasDto=Object.prototype.hasOwnProperty.call(result,"pdfReadiness");
      const countsValid=dto&&[dto.orderLineCount,dto.documentLineCount].every(n=>Number.isSafeInteger(n)&&n>=0);
      const bound=typeof result.purchaseOrderId==="string"&&result.purchaseOrderId.length>0&&dto?.version==="MYDATA_PDF_READINESS_V1"&&dto.storeId===selectedStore&&dto.inboxId===item.id&&dto.orderId===result.purchaseOrderId&&typeof dto.needsPdfReading==="boolean";
      const empty=bound&&countsValid&&dto.state==="NEEDS_READING"&&dto.needsPdfReading===true&&dto.orderLineCount===0&&dto.documentLineCount===0;
      const populated=bound&&countsValid&&dto.state==="HAS_LINES"&&dto.needsPdfReading===false&&(dto.orderLineCount>0||dto.documentLineCount>0);
      const locked=result.readOnly===true||(bound&&dto.state==="READ_ONLY");
      const openAssistant=!locked&&(empty||(explicitAssistant&&(populated||!hasDto)));
      if(result.purchaseOrderId)navigateOrder({orderId:result.purchaseOrderId,storeId:selectedStore,assistantSource:{inboxId:item.id,storeId:selectedStore},openAssistant,...(locked?{readOnly:true}:{})});
      setMessage(locked?"Άνοιγμα καταχωρισμένης αγοράς μόνο για ανάγνωση.":result.purchaseOrderId?"Το υπάρχον πρόχειρο άνοιξε στις Παραγγελίες & Αγορές.":result.downloaded?"Το πρωτότυπο PDF επισυνάφθηκε. Δεν έγινε καταχώρηση ή πληρωμή.":"Το πρωτότυπο υπάρχει ήδη.");
      await load();
    }catch(err){if(current(token.scope))setError(err.message)}finally{finish(token)}
  };
  const reprocess=async item=>{if(item.mark)return receiveOriginal(item,true);const token=begin(item.id);if(!token)return;setMessage("");try{const prepared=await api(`/api/commerce/documents/inbox/${item.id}/reprocess`,{method:"POST",body:"{}"});if(!current(token.scope))return;let lineCount=Number(prepared.productLineCount||0);if(prepared.needsRecheck){const ai=await api(`/api/commerce/ai-reader/jobs/${prepared.jobId}/ai-recheck`,{method:"POST",body:JSON.stringify({force:true})});if(!current(token.scope))return;lineCount=Array.isArray(ai?.result?.productLines)?ai.result.productLines.length:0}await api(`/api/commerce/documents/inbox/${item.id}`,{method:"PATCH",body:JSON.stringify({status:"IN_REVIEW",note:`✅ Αναγνώριση ολοκληρώθηκε • ${lineCount} γραμμές • AI job ${prepared.jobId} • χωρίς νέα πληρωμή`})});if(!current(token.scope))return;setMessage(`Το παλιό τιμολόγιο αναγνώστηκε ξανά με ${lineCount} γραμμές. Άνοιξε τον έλεγχο και την αντιστοίχιση προϊόντων.`);await load();if(current(token.scope))onOpenAi?.(prepared.jobId)}catch(err){if(current(token.scope))setError(err.message||"Η επανεπεξεργασία απέτυχε.")}finally{finish(token)}};
  const remove=async item=>{if(!window.confirm("Να διαγραφεί οριστικά η φωτογραφία;"))return;const token=begin(item.id);if(!token)return;try{await api("/api/commerce/documents/inbox/"+item.id,{method:"DELETE"});if(!current(token.scope))return;setMessage("Η φωτογραφία διαγράφηκε. Μπορείς να την περάσεις ξανά.");await load()}catch(err){if(current(token.scope))setError(err.message||"Η διαγραφή απέτυχε.")}finally{finish(token)}};
  const openLinked=item=>{if(item.mark&&item.mimeType==="application/pdf"&&item.processingStatus!=="REGISTERED"&&item.processingStatus!=="LINK_REVIEW")return receiveOriginal(item);navigateOrder({orderId:item.linkedOrderId,storeId,readOnly:readOnly||item.processingStatus==="REGISTERED"})};
  const canFetchProvider=item=>canFetchOriginal&&item.mark&&item.status==="RECEIVED"&&item.hasProviderOriginal&&!item.hasAttachment;
  const fetchProviderOriginal=async item=>{
    if(!canFetchProvider(item))return;
    const token=begin(item.id,{allowReadOnly:true});
    if(!token)return;
    setMessage("");
    try{
      const result=await api(`/api/commerce/documents/inbox/${encodeURIComponent(item.id)}/provider-original`,
        {method:"POST",body:JSON.stringify({storeId})});
      if(!current(token.scope))return;
      setMessage(result.reused?"Το πρωτότυπο είναι ήδη διαθέσιμο.":"Το πρωτότυπο PDF επισυνάφθηκε στη θυρίδα.");
      await load();
    }catch(err){if(current(token.scope))setError(err.message)}finally{finish(token)}
  };
  const uploadOriginal=async event=>{
    const input=event.currentTarget,file=input.files?.[0];
    input.value="";
    if(!file||!storeId||!canUploadOriginal||flight.current)return;
    if(file.size<100||file.size>3400000||file.name.length>180){
      setError("Επίλεξε ένα αρχείο PDF, JPEG, PNG ή WEBP έως 3,4 MB, με όνομα έως 180 χαρακτήρες.");
      return;
    }
    const token={scope:reviewScope.current,id:"upload-original"};
    flight.current=token;
    setWorkingId(token.id);setError("");setMessage("");
    try{
      const dataUrl=await new Promise((resolve,reject)=>{
        const reader=new window.FileReader();
        reader.onload=()=>resolve(String(reader.result));
        reader.onerror=()=>reject(new Error("Το αρχείο δεν διαβάστηκε."));
        reader.readAsDataURL(file);
      });
      if(!current(token.scope))return;
      await api("/api/commerce/documents/inbox",{method:"POST",body:JSON.stringify({storeId,file:{dataUrl,filename:file.name}})});
      if(!current(token.scope))return;
      setMessage("Το πρωτότυπο αποθηκεύτηκε στη θυρίδα.");
      await load();
    }catch(err){if(current(token.scope))setError(err.message)}finally{finish(token)}
  };
  const renderGroups=list=>(<div className="invoice-supplier-groups">{list.map(group=><section className="invoice-supplier-group" key={group.supplier}><header><b>{group.supplier}</b><span>{group.days.reduce((n,d)=>n+d.rows.length,0)} παραστατικά</span></header>{group.days.map(day=><div className="invoice-day-group" key={day.day}><h4>{dayKey(day.day)}<span>{day.rows.length}</span></h4><div className="invoice-list">{day.rows.map(item=><article key={item.id}><div className="invoice-main"><b>{item.filename||(item.mark?`myDATA ${item.series||""} ${item.documentNumber||""}`:"Παραστατικό")}</b><small>{item.issueDate?`Ημερομηνία παραστατικού: ${dayKey(item.issueDate)} · `:""}Λήψη: {when(item.receivedAt)}</small>{item.responsibleName&&<small>Υπεύθυνος: {item.responsibleName}</small>}{item.supplierId&&<small>Κωδικός προμηθευτή: {item.supplierId}</small>}{item.processingStatus==="REGISTERED"?<p>Η αγορά έχει ήδη τιμολογηθεί / καταχωριστεί. Δεν απαιτείται νέα ανάγνωση ή νέο πρόχειρο.</p>:item.note&&<p>{item.note}</p>}{item.paymentCount===1&&<small>Υπάρχουσα πληρωμή: {Number(item.paymentAmount).toLocaleString("el-GR",{style:"currency",currency:"EUR"})} · χωρίς νέα πληρωμή</small>}{Number(item.paymentCount)>1&&<small>Πολλαπλές συνδεδεμένες πληρωμές — απαιτείται έλεγχος.</small>}</div><div className="invoice-actions"><em className={item.processingStatus||item.status}>{inboxBusinessLabel(item)}</em>{!readOnly&&item.linkedOrderId&&<button onClick={()=>openLinked(item)}>{item.processingStatus==="REGISTERED"?"Άνοιγμα καταχωρισμένου τιμολογίου":"Άνοιγμα υπάρχοντος προχείρου"}</button>}{item.mark&&<button onClick={()=>exportArchive("pdf",item)} disabled={!!workingId}>Σύνοψη στοιχείων (όχι πρωτότυπο PDF)</button>}{item.mark&&!item.hasAttachment&&<small>{item.hasProviderOriginal ? item.originalError || "Αναμονή πρωτοτύπου παρόχου" : "Το myDATA δεν έδωσε σύνδεσμο πρωτοτύπου."}</small>}{readOnly&&canFetchProvider(item)&&<button type="button" onClick={()=>fetchProviderOriginal(item)} disabled={!!workingId}>Λήψη πρωτότυπου PDF παρόχου</button>}{!readOnly&&item.mark&&item.hasProviderOriginal&&!item.hasAttachment&&<button onClick={()=>receiveOriginal(item)} disabled={!!workingId}>Λήψη πρωτοτύπου για έλεγχο</button>}{!readOnly&&item.mark&&item.hasAttachment&&<button onClick={()=>setReconcileItem(item)} disabled={!!workingId}>Έλεγχος εγγραφής & διπλών / συγχώνευση</button>}{item.hasAttachment&&<button title="Άνοιγμα του πραγματικού αρχείου προμηθευτή" onClick={()=>view(item)}><Eye/>Πρωτότυπο φωτογραφία/PDF</button>}{!readOnly&&item.hasAttachment&&item.status!=="PROCESSED"&&item.processingStatus!=="REGISTERED"&&item.processingStatus!=="LINK_REVIEW"&&<button onClick={()=>remove(item)} disabled={workingId===item.id}><Trash2/>{workingId===item.id?"Διαγραφή…":"Διαγραφή φωτογραφίας"}</button>}{!readOnly&&item.hasAttachment&&item.status!=="PROCESSED"&&item.processingStatus!=="REGISTERED"&&item.processingStatus!=="LINK_REVIEW"&&<button onClick={()=>reprocess(item)} disabled={workingId===item.id}><RotateCw/>{workingId===item.id?"Αναγνώριση γραμμών…":item.mark?"Έλεγχος από βοηθό AI":"Επανεπεξεργασία γραμμών"}</button>}</div></article>)}</div></div>)}</section>)}</div>);
  return <div className="invoice-inbox">
    {!readOnly&&reconcileItem&&<InvoiceCommonDraftReview key={`${storeId}:${reconcileItem.id}`} api={api} storeId={storeId} item={reconcileItem} onClose={()=>setReconcileItem(null)} onComplete={result=>{if(!current(scope))return;setReconcileItem(null);setMessage(result.reused?"Άνοιγμα κοινής αγοράς.":"Τα πρωτότυπα συνδέθηκαν σε ένα κοινό πρόχειρο. Δεν έγινε πληρωμή ή κίνηση αποθήκης.");load();if(result.orderId)navigateOrder({orderId:result.orderId,storeId,readOnly:result.readOnly===true})}}/>}
    <section className="invoice-inbox-head"><div><h2><Inbox/>Θυρίδα Τιμολογίων / Αρχείο</h2><p>Τα παραστατικά myDATA μπαίνουν πρώτα ως πρόχειρα. Η αποθήκη ενημερώνεται μόνο μετά τον έλεγχο του πρωτοτύπου.</p>{myDataStatus&&<small className={`mydata-state ${myDataStatus.enabled&&!myDataStatus.labLocked?"ready":"locked"}`}>myDATA: {myDataStatus.enabled?(myDataStatus.labLocked?"κλειδωμένο — μη έγκυρη ρύθμιση":myDataStatus.environment==="PRODUCTION"?"Παραγωγή — λήψη παραστατικών":"LAB/SANDBOX ενεργό"):"δεν έχει ενεργοποιηθεί"}{myDataStatus.lastSyncError&&` · ${myDataStatus.lastSyncError}`}{myDataStatus.lastSyncAt?` · έλεγχος ανά 15 λεπτά · τελευταίος έλεγχος ${when(myDataStatus.lastSyncAt)}`:""}</small>}</div><div><select value={storeId} onChange={e=>{setStoreId(e.target.value);setInboxView("today");setOffset(0);setTodayOffset(0);setTodayItems([]);setItems([]);setMyDataStatus(null);setReconcileItem(null)}}>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><button hidden={readOnly} onClick={()=>syncMyData(false)} disabled={workingId==="MYDATA"||!myDataStatus?.enabled||myDataStatus?.labLocked}><CloudDownload/>{workingId==="MYDATA"?"Έλεγχος…":"Λήψη από myDATA"}</button><button onClick={load}><RefreshCw/>Ανανέωση</button></div></section>
    {canUploadOriginal&&storeId&&<section className="commerce-box"><label>Μεταφόρτωση πρωτοτύπου τιμολογίου <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={!!workingId} onChange={uploadOriginal}/></label></section>}
    {error&&<div className="commerce-error">{error}</div>}{message&&<div className="commerce-success">{message}</div>}
    <nav className="invoice-view-switch" aria-label="Προβολή τιμολογίων"><button type="button" aria-pressed={inboxView==="today"} onClick={()=>setInboxView("today")}>Τιμολόγια ημέρας</button><button type="button" aria-pressed={inboxView==="archive"} onClick={()=>setInboxView("archive")}>Παλιά τιμολόγια</button></nav>
    <nav className="invoice-view-switch" aria-label="Κατάσταση καταχώρησης">{[["PENDING","Εκκρεμότητες"],["REGISTERED","Τιμολογημένα / καταχωρισμένα"],["ALL","Όλα"]].map(([value,label])=><button key={value} type="button" aria-pressed={processing===value} onClick={()=>{setProcessing(value);setOffset(0);setTodayOffset(0)}}>{label}</button>)}</nav>
    {inboxView==="today"?<section className="commerce-box invoice-today" aria-label="Τιμολόγια ημέρας"><h3>Τιμολόγια ημέρας</h3><p>Νέες λήψεις της ημέρας Ελλάδας. Η ημερομηνία έκδοσης του προμηθευτή παραμένει χωριστή.</p><div className="invoice-archive-tools"><small>{todayTotal} παραστατικά · εμφάνιση {todayItems.length?todayOffset+1:0}–{todayOffset+todayItems.length}</small><button disabled={!!workingId||!todayTotal} onClick={()=>exportArchive("xlsx",null,{q:"",supplier:"",dateFrom:"",dateTo:"",receivedToday:"true",receivedBeforeToday:""})}>Excel ημέρας</button><button disabled={!!workingId||!todayTotal} onClick={()=>exportArchive("pdf",null,{q:"",supplier:"",dateFrom:"",dateTo:"",receivedToday:"true",receivedBeforeToday:""})}>PDF ημέρας / Εκτύπωση</button><button disabled={loading||!todayOffset} onClick={()=>setTodayOffset(Math.max(0,todayOffset-100))}>Προηγούμενα</button><button disabled={loading||todayOffset+todayItems.length>=todayTotal} onClick={()=>setTodayOffset(todayOffset+100)}>Επόμενα</button></div>{loading?<p>Φόρτωση…</p>:todayGroups.length?renderGroups(todayGroups):<p>Δεν υπάρχουν νέες λήψεις σήμερα.</p>}</section>:<div className="invoice-old-view" role="region" aria-label="Παλιά τιμολόγια">
    <section className="commerce-box"><h3><Search style={{width:17,verticalAlign:"middle"}}/> Παλιά τιμολόγια</h3><p>Λήψεις πριν από τη σημερινή ημέρα Ελλάδας. Η αναζήτηση και οι εξαγωγές αφορούν μόνο αυτό το αρχείο.</p><div className="invoice-archive-filters"><label>Προμηθευτής<select value={supplierFilter} onChange={e=>{setSupplierFilter(e.target.value)}}><option value="">Όλοι οι προμηθευτές</option>{supplierOptions.map(name=><option key={name} value={name}>{name}</option>)}</select></label><label>Έκδοση από<input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></label><label>Έκδοση έως<input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></label><label>Αριθμός τιμολογίου / όνομα αρχείου / λέξη<input value={query} onChange={e=>{setQuery(e.target.value)}} placeholder="π.χ. 12548 ή Coca Cola"/></label><button type="button" onClick={()=>{if(dateFrom&&dateTo&&dateFrom>dateTo){setError("Η ημερομηνία από πρέπει να προηγείται της έως.");return}setOffset(0);setApplied({q:query,supplier:supplierFilter,dateFrom,dateTo})}}><Search/>Αναζήτηση</button><button type="button" onClick={()=>{setSupplierFilter("");setDateFrom("");setDateTo("");setQuery("");setOffset(0);setApplied({q:"",supplier:"",dateFrom:"",dateTo:""})}}>Καθαρισμός</button></div><div className="invoice-archive-tools"><small>{loading?"Αναζήτηση σε όλο το αρχείο…":`Βρέθηκαν ${total} από ${archiveTotal} παραστατικά · εμφάνιση ${items.length?offset+1:0}–${offset+items.length}.`}</small><button onClick={()=>exportArchive("xlsx")} disabled={loading||!!workingId||!total}>Εξαγωγή Excel (.xlsx)</button><button onClick={()=>exportArchive("pdf")} disabled={loading||!!workingId||!total}>Αναφορά PDF / Εκτύπωση</button><button onClick={()=>setOffset(Math.max(0,offset-100))} disabled={loading||offset===0}>Προηγούμενα</button><button onClick={()=>setOffset(offset+100)} disabled={loading||offset+items.length>=total}>Επόμενα</button></div><small>Οι εξαγωγές περιλαμβάνουν όλα τα αποτελέσματα των φίλτρων. Στην αναφορά επιλέξτε «Αποθήκευση ως PDF» από την εκτύπωση.</small></section>
    <section className="commerce-box"><h3>Ανά προμηθευτή → ανά ημέρα</h3>{loading?<div>Φόρτωση…</div>:groups.length===0?<div className="invoice-empty">Δεν βρέθηκαν τιμολόγια με αυτά τα φίλτρα.</div>:renderGroups(groups)}</section></div>}
  </div>;
}

