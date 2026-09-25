import React,{useEffect,useMemo,useRef,useState} from "react";
import {Camera,FileUp,Wallet} from "lucide-react";
import QRCode from "qrcode";
import {mergeFastInvoiceHeaders} from "../../lib/invoice-fast-header-merge.js";
import {prepareDocumentFile} from "../../lib/document-image-quality.js";

const num=v=>Number(String(v??"0").replace(/\s/g,"").replace(/\.(?=\d{3}(?:\D|$))/g,"").replace(",",".").replace(/[^0-9.-]/g,""))||0;
const readFile=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error("Δεν διαβάστηκε το παραστατικό."));r.readAsDataURL(file)});
const paymentKey=()=>`pos-invoice-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;

function monitorBackgroundV244({api,jobId,documentNumber,setMessage,onChanged}){
  const startedAt=Date.now(),poll=async()=>{
    try{
      const result=await api(`/api/commerce/ai-reader/fast-status/${encodeURIComponent(jobId)}`);
      if(result?.done){
        const review=Boolean(result.reconciliationRequired),difference=Number(result.reconciliationDifference||0),lineCount=Number(result.lineCount||0);
        if(lineCount<=0){setMessage?.(`❌ Τιμολόγιο ${documentNumber}: η ανάγνωση ολοκληρώθηκε χωρίς γραμμές. Δεν θεωρείται επιτυχής και χρειάζεται ασφαλές retry του ίδιου job.`);return}
        setMessage?.(review?`⚠️ Τιμολόγιο ${documentNumber}: πέρασε κανονικά στο BackOffice ως πρόχειρο με ${lineCount} γραμμές. Ο οικονομικός έλεγχος έχει διαφορά ${difference.toFixed(2)} € και χρειάζεται διόρθωση πριν από έγκριση ή αποθήκη.`:`✅ Τιμολόγιο ${documentNumber}: ολοκληρώθηκε σωστά στο BackOffice (${lineCount} γραμμές, οικονομικός έλεγχος ΟΚ).`);
        onChanged?.();return;
      }
      if(result?.failed){setMessage?.(`❌ Τιμολόγιο ${documentNumber}: η αυτόματη ανάγνωση απέτυχε${result.error?` — ${result.error}`:""}. Χρησιμοποίησε ασφαλές retry του ίδιου job· μην ανεβάσεις ξανά το αρχείο.`);return}
    }catch{}
    const elapsed=Date.now()-startedAt;
    if(elapsed>=30*1000&&elapsed<33*1000)setMessage?.(`⏳ Τιμολόγιο ${documentNumber}: η ανάγνωση συνεχίζεται πέρα από τον στόχο των 15 δευτερολέπτων. Δεν έχει δηλωθεί επιτυχία.`);
    if(elapsed<3*60*1000)setTimeout(poll,2000);else setMessage?.(`❌ Τιμολόγιο ${documentNumber}: δεν ολοκληρώθηκε εντός 3 λεπτών. Μην κάνεις δεύτερο upload· απαιτείται έλεγχος του ίδιου job.`);
  };
  setTimeout(poll,2000);
}

export default function StoreSupplierInvoicePremiumFast({api,store,suppliers=[],onChanged,setMessage}){
  const [pages,setPages]=useState([]),[supplierId,setSupplierId]=useState(""),[amount,setAmount]=useState(""),[documentNumber,setDocumentNumber]=useState(""),[documentDate,setDocumentDate]=useState(""),[documentType,setDocumentType]=useState(""),[creditDetected,setCreditDetected]=useState(false),[mode,setMode]=useState(""),[paymentMethod,setPaymentMethod]=useState("CASH_SHIFT"),[busy,setBusy]=useState(false),[reading,setReading]=useState(false),[status,setStatus]=useState("Επίλεξε ή φωτογράφισε έως 5 σελίδες του ίδιου τιμολογίου."),[cameraOpen,setCameraOpen]=useState(false),[stream,setStream]=useState(null),[supplierCandidate,setSupplierCandidate]=useState({name:"",taxId:""}),[createdSupplier,setCreatedSupplier]=useState(null),[savingSupplier,setSavingSupplier]=useState(false),[vatLookup,setVatLookup]=useState({busy:false,verified:false,message:""});
  const videoRef=useRef(null),canvasRef=useRef(null);
  useEffect(()=>{if(!cameraOpen||!stream||!videoRef.current)return;const video=videoRef.current;video.srcObject=stream;const play=()=>video.play().catch(()=>{});if(video.readyState>=2)play();else video.addEventListener("loadedmetadata",play,{once:true});return()=>video.removeEventListener("loadedmetadata",play)},[cameraOpen,stream]);
  const [qr,setQr]=useState("");
  const [qrUrl,setQrUrl]=useState("");
  const supplierOptions=useMemo(()=>createdSupplier&&!suppliers.some(x=>String(x.id)===String(createdSupplier.id))?[createdSupplier,...suppliers]:suppliers,[suppliers,createdSupplier]);
  const supplier=useMemo(()=>supplierOptions.find(x=>String(x.id)===String(supplierId))||null,[supplierOptions,supplierId]);
  const paymentSource=paymentMethod==="CASH_SHIFT"?"CASH_SHIFT":"EXTERNAL";
  const paymentMethodLabel={CASH_SHIFT:"Μετρητά από ενεργή βάρδια",CORPORATE_CARD:"Εταιρική κάρτα",BANK_TRANSFER:"Τραπεζική μεταφορά",EMPLOYEE_REIMBURSEMENT:"Πληρωμή υπαλλήλου προς επιστροφή"}[paymentMethod];
  const file=pages[0]?.file||null,fileDataUrl=pages[0]?.dataUrl||"";
  const stopCamera=()=>{stream?.getTracks?.().forEach(t=>t.stop());setStream(null);setCameraOpen(false)};
  const selectFiles=async selected=>{
    const incoming=Array.from(selected||[]).filter(Boolean);
    if(!incoming.length)return;
    if(incoming.length>5-pages.length){setMessage?.(`⚠️ Μπορείς να ανεβάσεις μέχρι 5 σελίδες για το ίδιο τιμολόγιο. Έχεις ήδη επιλέξει ${pages.length}.`);return}
    const initial=pages.length===0;
    setReading(true);setStatus("Προετοιμασία σελίδων και γρήγορη ανάγνωση βασικών στοιχείων…");
    try{
      const prepared=[];
      for(const next of incoming){const result=await prepareDocumentFile(next,{strict:true,maxSide:3000,enhance:true}),clean=result.file;prepared.push({file:clean,dataUrl:await readFile(clean),imageQuality:result.quality})}
      const nextPages=[...pages,...prepared];setPages(nextPages);
      if(initial){setSupplierId("");setAmount("");setDocumentNumber("");setDocumentDate("");setDocumentType("");setCreditDetected(false);setMode("");setCreatedSupplier(null);setSupplierCandidate({name:"",taxId:""})}
      const headerPages=initial&&nextPages.length>1?[nextPages[0],nextPages[nextPages.length-1]]:[nextPages[nextPages.length-1]];
      const headerResults=[],headerErrors=[];
      // Pages may be selected back-first and a continuation page may not carry
      // supplier/header fields. Read every candidate independently so one weak
      // page can never prevent the real first page from being processed.
      const processedPages=[...nextPages];
      // The LAB-proven path reads one page after the other. Concurrent FAST
      // requests exhausted the shared provider and made both pages fail.
      for(const sourcePage of headerPages){
        try{
          const result=await api("/api/commerce/ai-reader/fast-header",{method:"POST",timeoutMs:100000,body:JSON.stringify({storeId:store.id,filename:sourcePage.file.name||"timologio.jpg",mimeType:sourcePage.file.type||"image/jpeg",dataUrl:sourcePage.dataUrl})});
          if(!result)continue;
          headerResults.push(result);
          const pageIndex=processedPages.indexOf(sourcePage);
          if(pageIndex>=0)processedPages[pageIndex]={...sourcePage,fastProductLines:Array.isArray(result.productLines)?result.productLines:[],fastDocumentType:result.documentType};
        }catch(error){headerErrors.push(error)}
      }
      setPages(processedPages);
      if(processedPages.some(page=>page.fastDocumentType==="CREDIT_NOTE")){setDocumentType("CREDIT_NOTE");setCreditDetected(true)}
      if(!headerResults.length)throw headerErrors.at(-1)||new Error("Δεν διαβάστηκαν βασικά στοιχεία από τις επιλεγμένες σελίδες.");
      const {supplierHeader:supplierMeta,documentHeader:documentMeta,totalHeader:totalMeta,confidence}=mergeFastInvoiceHeaders(headerResults);
      if(supplierMeta?.supplierId&&(initial||!supplierId))setSupplierId(supplierMeta.supplierId);
      if(supplierMeta&&(initial||!supplierCandidate.name))setSupplierCandidate({name:String(supplierMeta.supplierName||""),taxId:String(supplierMeta.supplierTaxId||"")});
      if(documentMeta?.documentNumber&&(initial||!documentNumber))setDocumentNumber(documentMeta.documentNumber);
      if(documentMeta?.documentDate&&(initial||!documentDate))setDocumentDate(documentMeta.documentDate);
      if(totalMeta)setAmount(Number(totalMeta.totalGross).toFixed(2).replace(".",","));
      const foundSupplier=Boolean(supplierMeta?.supplierId||supplierId),baseComplete=Boolean((documentMeta?.documentNumber||documentNumber)&&(documentMeta?.documentDate||documentDate)&&Number(totalMeta?.totalGross||num(amount))>0);
      if(!foundSupplier){setStatus(`${nextPages.length} ${nextPages.length===1?"σελίδα επιλέχθηκε":"σελίδες επιλέχθηκαν"}. Ο προμηθευτής δεν υπάρχει στη βάση. Έλεγξε/συμπλήρωσε Επωνυμία και ΑΦΜ.`)}
      else{setStatus(baseComplete?`${nextPages.length} ${nextPages.length===1?"σελίδα έτοιμη":"σελίδες έτοιμες"} (${Math.round(confidence)}%). Έλεγξε τα 4 στοιχεία και συνέχισε.`:`${nextPages.length} ${nextPages.length===1?"σελίδα έτοιμη":"σελίδες έτοιμες"}. Συμπλήρωσε μόνο όποιο βασικό στοιχείο λείπει.`)}
    }catch(error){setStatus(`Δεν ολοκληρώθηκε η επιλογή/ανάγνωση των σελίδων. ${error?.message||""}`);setMessage?.(`⚠️ ${error?.message||"Δεν διαβάστηκαν οι σελίδες."}`)}finally{setReading(false)}
  };
  const removePage=index=>{if(busy||reading)return;const next=pages.filter((_,i)=>i!==index);setPages(next);const foundCredit=next.some(page=>page.fastDocumentType==="CREDIT_NOTE");setCreditDetected(foundCredit);if(foundCredit)setDocumentType("CREDIT_NOTE");else if(creditDetected)setDocumentType("");if(!next.length){setSupplierId("");setAmount("");setDocumentNumber("");setDocumentDate("");setDocumentType("");setMode("");setStatus("Επίλεξε ή φωτογράφισε έως 5 σελίδες του ίδιου τιμολογίου.")}};
  const movePage=(index,direction)=>{if(busy||reading)return;const target=index+direction;if(target<0||target>=pages.length)return;const next=[...pages];[next[index],next[target]]=[next[target],next[index]];setPages(next)};
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
  const lookupVat=async()=>{
    const taxId=String(supplierCandidate.taxId||"").replace(/\D/g,"");
    if(taxId.length!==9)return setVatLookup({busy:false,verified:false,message:"Το ΑΦΜ πρέπει να έχει 9 ψηφία."});
    setVatLookup({busy:true,verified:false,message:"Έλεγχος επίσημων στοιχείων…"});
    try{
      const data=await api(`/api/commerce/vat-lookup?storeId=${encodeURIComponent(store.id)}&taxId=${encodeURIComponent(taxId)}`);
      if(data.existingSupplier){setCreatedSupplier(data.existingSupplier);setSupplierId(data.existingSupplier.id);setVatLookup({busy:false,verified:true,message:`Υπάρχει ήδη: ${data.existingSupplier.name}`});return}
      setSupplierCandidate(current=>({...current,taxId:data.taxId,name:data.name||current.name}));
      setVatLookup({busy:false,verified:true,message:`Πλήρης επωνυμία (${data.source==="AADE_BASIC_REGISTRY"?"από ΑΑΔΕ":"από VIES"}): ${data.name}`});
    }catch(error){setVatLookup({busy:false,verified:false,message:error?.message||"Δεν ολοκληρώθηκε η αναζήτηση ΑΦΜ."})}
  };
  const startCamera=async()=>{try{stopCamera();let s;try{s=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080}},audio:false})}catch{s=await navigator.mediaDevices.getUserMedia({video:true,audio:false})}setStream(s);setCameraOpen(true)}catch{setMessage?.("❌ Δεν μπόρεσε να ανοίξει η κάμερα. Έλεγξε την άδεια κάμερας του Chrome και ξαναδοκίμασε.")}};
  const capture=()=>{const v=videoRef.current,c=canvasRef.current;if(!v||!c||!v.videoWidth||!v.videoHeight){setMessage?.("⚠️ Η προεπισκόπηση κάμερας δεν είναι ακόμη έτοιμη. Περίμενε μια στιγμή και ξαναπάτησε Φωτογράφιση.");return}c.width=v.videoWidth;c.height=v.videoHeight;c.getContext("2d").drawImage(v,0,0,c.width,c.height);c.toBlob(blob=>{stopCamera();if(blob)selectFiles([new File([blob],`timologio-selida-${pages.length+1}-${Date.now()}.jpg`,{type:"image/jpeg"})])},"image/jpeg",.9)};
  const createQr=async()=>{if(pages.length>=5)return setMessage?.("⚠️ Έχουν ήδη επιλεγεί 5 σελίδες.");try{const r=await api("/api/commerce/mobile-invoice-upload-sessions",{method:"POST",body:JSON.stringify({storeId:store.id})});setQrUrl(r.url);setQr(await QRCode.toDataURL(r.url));const timer=setInterval(async()=>{try{const x=await api(`/api/commerce/mobile-invoice-upload-sessions/${r.id}`);if(x?.dataUrl){clearInterval(timer);const b=await fetch(x.dataUrl).then(v=>v.blob());selectFiles([new File([b],x.filename,{type:x.mimeType})]);setQr("");setQrUrl("")}}catch{}},2000)}catch(e){setMessage?.(`❌ ${e?.message||"Δεν δημιουργήθηκε QR."}`)}};
  const ready=Boolean(pages.length&&pages.every(page=>page.dataUrl)&&supplierId&&documentNumber.trim()&&documentDate&&num(amount)>0&&documentType&&(documentType==="CREDIT_NOTE"||mode)&&!busy&&!reading&&!savingSupplier);
  const submit=async()=>{
    if(!ready)return;
    setBusy(true);
    let stage="DUPLICATE CHECK";
    try{
      setStatus("Έλεγχος duplicate τιμολογίου…");
      const duplicateCheck=documentType==="CREDIT_NOTE"?null:await api("/api/commerce/ai-reader/fast-duplicate-check",{method:"POST",body:JSON.stringify({storeId:store.id,supplierId,documentNumber:documentNumber.trim(),documentDate,totalGross:num(amount),dataUrl:fileDataUrl})});
      if(duplicateCheck?.paymentReused&&!window.confirm(`Το τιμολόγιο ${documentNumber.trim()} έχει ήδη πληρωθεί (${num(amount).toFixed(2)} €). Δεν θα καταχωριστεί ξανά πληρωμή ή πίστωση.\n\nΝα συνεχίσουμε μόνο με νέα ανάγνωση και καταχώριση του τιμολογίου στο BackOffice;`)){
        setStatus("Η επανεισαγωγή ακυρώθηκε. Η υπάρχουσα πληρωμή διατηρείται.");setBusy(false);return;
      }
      const key=paymentKey(),totalGross=num(amount);
      let paymentTransactionId=duplicateCheck?.paymentTransactionId||null;
      const effectiveMode=documentType==="CREDIT_NOTE"?"CREDIT":paymentTransactionId?"PAID":mode;
      if(effectiveMode==="PAID"){
        if(!paymentTransactionId){
          stage="ΠΛΗΡΩΜΗ ΒΑΡΔΙΑΣ";
          setStatus("Καταχώριση πληρωμής στη βάρδια…");
          const payment=await api(`/api/transactions/stores/${encodeURIComponent(store.id)}`,{method:"POST",body:JSON.stringify({type:"SUPPLIER_PAYMENT",amount:totalGross,supplierId,supplierName:supplier?.name||null,invoiceDocumentNumber:documentNumber.trim(),description:`Τιμολόγιο ${documentNumber.trim()} — Γρήγορη καταχώριση POS`,evidenceMode:"NO_DOCUMENT",paymentSource,paymentMethod,idempotencyKey:key,attachment:{dataUrl:fileDataUrl,filename:file.name||"timologio.jpg"}})});
          paymentTransactionId=payment?.id||null;if(!paymentTransactionId)throw new Error("Η πληρωμή γράφτηκε χωρίς αναγνωριστικό συναλλαγής.");
          if(paymentSource==="CASH_SHIFT")try{window.dispatchEvent(new CustomEvent("myworkstation:cash-drawer-request",{detail:{reason:"SUPPLIER_PAYMENT",amount:totalGross,storeId:store.id,transactionId:paymentTransactionId}}))}catch{}
        }
      }
      stage="ΑΣΦΑΛΗΣ ΠΑΡΑΛΑΒΗ SERVER";
      setStatus("Ασφαλής αποθήκευση τιμολογίου στον server…");
      const handoff=await api("/api/commerce/ai-reader/fast-handoff",{method:"POST",body:JSON.stringify({storeId:store.id,supplierId,documentNumber:documentNumber.trim(),documentDate,totalGross,documentType,settlementMode:effectiveMode,paymentTransactionId:effectiveMode==="PAID"?paymentTransactionId:null,pages:pages.map(page=>({filename:page.file.name||"timologio.jpg",mimeType:page.file.type||"image/jpeg",dataUrl:page.dataUrl,documentType:page.fastDocumentType,productLines:Array.isArray(page.fastProductLines)?page.fastProductLines:[]}))})});
      try{window.dispatchEvent(new CustomEvent("mws:invoice-handoff",{detail:{jobId:handoff?.jobId||null,documentNumber:documentNumber.trim()}}))}catch{}
      setStatus(documentType==="CREDIT_NOTE"?"Το πιστωτικό αποθηκεύτηκε ως πρόχειρο. Οι γραμμές ελέγχονται στο BackOffice πριν από κίνηση αποθήκης και συμψηφισμό.":handoff?.myDataMatched?"Το τιμολόγιο συνδέθηκε με υπάρχον παραστατικό myDATA. Η πλήρης ανάγνωση συνεχίζεται στο BackOffice…":"Το τιμολόγιο αποθηκεύτηκε ως πρόχειρο. Η πλήρης ανάγνωση συνεχίζεται στο BackOffice…");
      const accepted=documentType==="CREDIT_NOTE"?`⏳ Το πιστωτικό ${documentNumber.trim()} παραλήφθηκε για έλεγχο στο BackOffice. Δεν έγινε πληρωμή ή αλλαγή αποθήκης.`:duplicateCheck?.paymentReused?`⏳ Η υπάρχουσα πληρωμή διατηρήθηκε. Το τιμολόγιο ${documentNumber.trim()} επανελέγχεται χωρίς νέα χρέωση· αναμονή τελικού αποτελέσματος.`:effectiveMode==="PAID"?`⏳ Η πληρωμή ${totalGross.toFixed(2)} € με ${paymentMethodLabel} καταχωρίστηκε. Η OCR ανάγνωση συνεχίζεται· δεν έχει δηλωθεί ακόμη επιτυχία.`:`⏳ Το τιμολόγιο ${documentNumber.trim()} παραλήφθηκε μία φορά. Η OCR ανάγνωση συνεχίζεται· δεν έχει δηλωθεί ακόμη επιτυχία.`;
      setMessage?.(accepted);onChanged?.();
      monitorBackgroundV244({api,jobId:handoff.jobId,documentNumber:documentNumber.trim(),setMessage,onChanged});
    }catch(error){
      const detail=error?.message||"Η καταχώριση απέτυχε.";
      setStatus(`❌ ΑΠΟΤΥΧΙΑ ΣΤΟ: ${stage}. ${detail}`);
      setMessage?.(`❌ ΑΠΟΤΥΧΙΑ ΣΤΟ ${stage}: ${detail}`);
      setBusy(false);
    }
  };
  return <div className="pos-payment-form-v3-root">
    <div style={{padding:"10px 12px",borderRadius:10,background:"#e9f8f1",fontWeight:900,color:"#0b6249",marginBottom:10}}>Γρήγορη καταχώριση — AI μόνο για τα 4 βασικά στοιχεία. Η πλήρης V2.4.4 ανάγνωση προϊόντων συνεχίζεται μετά στην Κεντρική Διαχείριση.</div>
    <div style={{padding:"9px 11px",borderRadius:9,background:"#fff",fontWeight:800,marginBottom:10}}>{status}</div>
    <div className="pos-photo-actions"><button type="button" onClick={startCamera} disabled={busy||reading||pages.length>=5}><Camera/> Λήψη σελίδας από κάμερα</button><label><FileUp/> Επιλογή έως 5 σελίδων / PDF<input type="file" multiple accept="image/*,application/pdf" disabled={busy||reading||pages.length>=5} onChange={e=>{const selected=Array.from(e.target.files||[]);e.target.value="";selectFiles(selected)}}/></label><button type="button" onClick={createQr} disabled={busy||reading||pages.length>=5}>QR από κινητό</button><b>{pages.length?`${pages.length}/5 ${pages.length===1?"σελίδα":"σελίδες"}`:"Δεν επιλέχθηκε τιμολόγιο"}</b></div>{pages.length>0&&<div style={{display:"grid",gap:6,margin:"8px 0 10px"}}>{pages.map((page,index)=><div key={`${page.file.name}-${page.file.lastModified}-${index}`} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 9px",border:"1px solid #b7d8cc",borderRadius:8,background:"#f5fbf8"}}><b style={{minWidth:72}}>Σελίδα {index+1}</b><span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{page.file.name}</span><button type="button" title="Μετακίνηση πάνω" disabled={busy||reading||index===0} onClick={()=>movePage(index,-1)}>↑</button><button type="button" title="Μετακίνηση κάτω" disabled={busy||reading||index===pages.length-1} onClick={()=>movePage(index,1)}>↓</button><button type="button" title="Αφαίρεση σελίδας" disabled={busy||reading} onClick={()=>removePage(index)}>×</button></div>)}</div>}{qr&&<div style={{textAlign:"center",padding:10}}><img src={qr} alt="QR upload τιμολογίου" style={{width:180}}/><div>Σκάναρε και ανέβασε μία σελίδα. Επανάλαβε μέχρι 5 φορές για το ίδιο τιμολόγιο.</div></div>}
    {cameraOpen&&<div className="pos-camera-live"><video ref={videoRef} autoPlay playsInline/><canvas ref={canvasRef} hidden/><div><button type="button" onClick={capture}><Camera/> Φωτογράφιση</button><button type="button" onClick={stopCamera}>Κλείσιμο</button></div></div>}
    <label>Προμηθευτής<select value={supplierId} disabled={busy||savingSupplier} onChange={e=>setSupplierId(e.target.value)}><option value="">Επίλεξε προμηθευτή</option>{supplierOptions.map(s=><option key={s.id} value={s.id}>{s.name}{s.taxId?` · ${s.taxId}`:""}</option>)}</select></label>
    {!supplierId&&fileDataUrl&&<div style={{padding:"10px 12px",border:"1px solid #c9a227",borderRadius:10,background:"#fff8dc",margin:"8px 0"}}>
      <div style={{fontWeight:900,marginBottom:6}}>Νέος προμηθευτής</div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:8}}>
        <label>Επωνυμία<input value={supplierCandidate.name} disabled={savingSupplier||busy} onChange={e=>setSupplierCandidate(c=>({...c,name:e.target.value}))} placeholder="Επωνυμία προμηθευτή"/></label>
        <label>ΑΦΜ<input value={supplierCandidate.taxId} disabled={savingSupplier||busy} onChange={e=>setSupplierCandidate(c=>({...c,taxId:e.target.value}))} placeholder="ΑΦΜ"/></label>
      </div>
      <button type="button" onClick={lookupVat} disabled={savingSupplier||busy||vatLookup.busy||String(supplierCandidate.taxId||"").replace(/\D/g,"").length!==9} style={{marginTop:8,fontWeight:900}}>{vatLookup.busy?"ΕΛΕΓΧΟΣ ΑΦΜ…":"ΕΛΕΓΧΟΣ ΕΠΙΣΗΜΗΣ ΕΠΩΝΥΜΙΑΣ ΑΠΟ ΑΦΜ"}</button>
      {vatLookup.message&&<div style={{marginTop:7,padding:8,borderRadius:7,background:vatLookup.verified?"#dcfce7":"#fee2e2",fontWeight:900}}>{vatLookup.message}</div>}
      <button type="button" onClick={saveNewSupplier} disabled={savingSupplier||busy||supplierCandidate.name.trim().length<2} style={{marginTop:8,fontWeight:900}}>{savingSupplier?"Καταχώριση…":"ΚΑΤΑΧΩΡΙΣΗ ΝΕΟΥ ΠΡΟΜΗΘΕΥΤΗ"}</button>
    </div>}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}><label>Συνολικό ποσό<input inputMode="decimal" value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/></label><label>Αριθμός τιμολογίου<input value={documentNumber} disabled={busy} onChange={e=>setDocumentNumber(e.target.value)}/></label><label>Ημερομηνία<input type="date" value={documentDate} disabled={busy} onChange={e=>setDocumentDate(e.target.value)}/></label></div>
    <label>Τύπος παραστατικού<select value={documentType} disabled={busy||creditDetected} onChange={e=>setDocumentType(e.target.value)}><option value="">Έλεγξε το έντυπο και επίλεξε</option><option value="INVOICE">Τιμολόγιο αγοράς</option><option value="CREDIT_NOTE">Πιστωτικό / επιστροφή</option></select></label>
    {documentType==="CREDIT_NOTE"&&<div role="alert" style={{padding:10,border:"1px solid #b45309",background:"#fffbeb",fontWeight:800}}>Πιστωτικό επιστροφής: αποθήκευση ως πρόχειρο για έλεγχο στο BackOffice. Μετά την έγκριση αφαιρείται stock και μειώνεται το υπόλοιπο προμηθευτή. Δεν γίνεται κίνηση ταμείου.</div>}
    {documentType!=="CREDIT_NOTE"&&<div className="pos-payment-types"><button type="button" aria-pressed={mode==="PAID"} className={mode==="PAID"?"active":""} disabled={busy||reading||savingSupplier} onClick={()=>setMode("PAID")}>ΠΛΗΡΩΜΕΝΟ</button><button type="button" aria-pressed={mode==="CREDIT"} className={mode==="CREDIT"?"active":""} disabled={busy||reading||savingSupplier} onClick={()=>setMode("CREDIT")}>ΜΕ ΠΙΣΤΩΣΗ</button></div>}
    {mode==="PAID"&&documentType!=="CREDIT_NOTE"&&<div className="pos-expense-payment-sources"><b>Τρόπος πληρωμής προμηθευτή</b><div>{[["CASH_SHIFT","Μετρητά από ενεργή βάρδια"],["CORPORATE_CARD","Εταιρική κάρτα"],["BANK_TRANSFER","Τραπεζική μεταφορά"],["EMPLOYEE_REIMBURSEMENT","Πληρωμή υπαλλήλου προς επιστροφή"]].map(([value,label])=><button key={value} type="button" className={paymentMethod===value?"active":""} disabled={busy||reading||savingSupplier} onClick={()=>setPaymentMethod(value)}>{label}</button>)}</div><small>{paymentSource==="CASH_SHIFT"?"Το ποσό αφαιρείται από το ταμείο της ενεργής βάρδιας.":"Η πληρωμή καταχωρίζεται εξωτερικά και δεν αφαιρείται από τη βάρδια."}</small></div>}
    <button className="pos-primary-action" disabled={!ready} onClick={submit}><Wallet/> {reading?"FAST AI ανάγνωση…":savingSupplier?"Καταχώριση προμηθευτή…":busy?"Καταχώριση…":documentType==="CREDIT_NOTE"?"ΚΑΤΑΧΩΡΙΣΗ ΠΙΣΤΩΤΙΚΟΥ ΓΙΑ ΕΛΕΓΧΟ":mode==="PAID"?"ΠΛΗΡΩΜΗ & ΕΠΙΣΤΡΟΦΗ ΣΤΟ POS":"ΚΑΤΑΧΩΡΙΣΗ ΜΕ ΠΙΣΤΩΣΗ"}</button>
  </div>;
}
