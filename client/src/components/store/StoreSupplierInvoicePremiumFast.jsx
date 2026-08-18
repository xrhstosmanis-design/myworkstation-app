import React,{useMemo,useRef,useState} from "react";
import {Camera,FileUp,Wallet} from "lucide-react";
import {finalizeV244ProductLines} from "../../lib/invoice-v244.js";

const today=()=>new Date().toISOString().slice(0,10);
const num=v=>Number(String(v??"0").replace(/\s/g,"").replace(/\.(?=\d{3}(?:\D|$))/g,"").replace(",",".").replace(/[^0-9.-]/g,""))||0;
const normalize=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleUpperCase("el-GR").replace(/[^A-ZΑ-Ω0-9]/g,"");
const readFile=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error("Δεν διαβάστηκε το παραστατικό."));r.readAsDataURL(file)});
const paymentKey=()=>`pos-invoice-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;

async function previewBitmap(file){
  if(file.type==="application/pdf"){
    const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc=new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs",import.meta.url).toString();
    const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
    const page=await pdf.getPage(1),viewport=page.getViewport({scale:1.25}),canvas=document.createElement("canvas");
    canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    await page.render({canvasContext:canvas.getContext("2d"),viewport}).promise;
    return createImageBitmap(canvas);
  }
  return createImageBitmap(file);
}

async function fastHeaderOcr(file){
  const bitmap=await previewBitmap(file);
  const targetW=Math.min(1200,bitmap.width),scale=targetW/bitmap.width;
  const topH=Math.max(1,Math.floor(bitmap.height*.43)),bottomY=Math.floor(bitmap.height*.66),bottomH=Math.max(1,bitmap.height-bottomY);
  const gap=14,out=document.createElement("canvas");out.width=Math.max(1,Math.round(targetW));out.height=Math.max(1,Math.round((topH+bottomH)*scale)+gap);
  const ctx=out.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(bitmap,0,0,bitmap.width,topH,0,0,out.width,Math.round(topH*scale));ctx.drawImage(bitmap,0,bottomY,bitmap.width,bottomH,0,Math.round(topH*scale)+gap,out.width,Math.round(bottomH*scale));bitmap.close?.();
  const {createWorker}=await import("tesseract.js"),worker=await createWorker("ell+eng");
  let result;try{await worker.setParameters({tessedit_pageseg_mode:"6"});result=await worker.recognize(out)}finally{await worker.terminate()}
  return String(result?.data?.text||"");
}

function headerMeta(rawText,suppliers=[]){
  const raw=String(rawText||""),lines=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),joined=normalize(raw);
  let supplier=null,best=0;
  for(const item of suppliers){for(const name of [String(item.name||""),String(item.name||"").replace(/\s*\([^)]*\)\s*$/g,"")]){const key=normalize(name);if(key.length>=4&&joined.includes(key)&&key.length>best){supplier=item;best=key.length}}}
  let documentNumber="";
  for(const line of lines){const m=line.match(/(?:ΤΙΜΟΛΟΓΙΟ|ΤΙΜ|INVOICE|ΠΑΡΑΣΤΑΤΙΚΟ).{0,35}?(?:ΑΡ\.?|ΑΡΙΘΜ(?:ΟΣ)?|NO\.?|#)?\s*[:\-]?\s*([A-ZΑ-Ω0-9][A-ZΑ-Ω0-9\-/]{2,})/i)||line.match(/(?:ΑΡ\.?\s*(?:ΤΙΜΟΛΟΓΙΟΥ)?|ΑΡΙΘΜΟΣ\s*(?:ΤΙΜΟΛΟΓΙΟΥ)?|INVOICE\s*NO\.?)\s*[:\-]?\s*([A-ZΑ-Ω0-9\-/]{3,})/i);if(m){documentNumber=m[1].trim();break}}
  let documentDate=today();
  for(const line of lines){const m=line.match(/(?:ΗΜΕΡΟΜΗΝΙΑ|DATE)?\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.](?:20)?\d{2})/i);if(m){let[d,mo,y]=m[1].split(/[\/\-.]/).map(Number);if(y<100)y+=2000;documentDate=`${String(y).padStart(4,"0")}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`;break}}
  let totalGross=0;const totalWords=/(ΓΕΝΙΚΟ\s*ΣΥΝΟΛΟ|ΠΛΗΡΩΤΕΟ|ΤΕΛΙΚΟ\s*ΣΥΝΟΛΟ|ΣΥΝΟΛΟ\s*ΜΕ\s*ΦΠΑ|TOTAL\s*DUE|GRAND\s*TOTAL|TOTAL)/i;
  for(const line of lines.filter(x=>totalWords.test(x)).reverse()){const vals=(line.match(/\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:[.,]\d{2})/g)||[]).map(num).filter(v=>v>0);if(vals.length){totalGross=vals.at(-1);break}}
  return {supplierId:supplier?.id||"",documentNumber,documentDate,totalGross};
}

async function backgroundV244({api,store,fileDataUrl,filename,mimeType,supplierId,documentNumber,documentDate,totalGross,inboxId,mode,paymentTransactionId}){
  const patch=async(status,note)=>{try{await api(`/api/commerce/documents/inbox/${encodeURIComponent(inboxId)}`,{method:"PATCH",body:JSON.stringify({status,note})})}catch{}};
  try{
    const job=await api("/api/commerce/ai-reader/jobs",{method:"POST",body:JSON.stringify({storeId:store.id,filename,mimeType,dataUrl:fileDataUrl,localConfidence:0,result:{rawText:"",lines:[],pageCount:null,pdfNote:"POS PREMIUM FAST — background V2.4.4"}})});
    if(!job?.id)throw new Error("Δεν δημιουργήθηκε εργασία V2.4.4.");
    const ai=await api(`/api/commerce/ai-reader/jobs/${encodeURIComponent(job.id)}/ai-recheck`,{method:"POST",body:JSON.stringify({force:true})});
    const productLines=finalizeV244ProductLines(Array.isArray(ai?.result?.productLines)?ai.result.productLines:[]);
    if(!productLines.length)throw new Error("Δεν βρέθηκαν ασφαλείς γραμμές προϊόντων.");
    await api(`/api/commerce/ai-reader/jobs/${encodeURIComponent(job.id)}/product-lines`,{method:"PUT",body:JSON.stringify({source:"V2.4.4",productLines})});
    const created=await api(`/api/commerce/ai-reader/jobs/${encodeURIComponent(job.id)}/pos-intake`,{method:"POST",body:JSON.stringify({storeId:store.id,supplierId,documentNumber,documentDate,totalGross,settlementMode:mode,paymentTransactionId:mode==="PAID"?paymentTransactionId:null,note:`POS PREMIUM FAST • Inbox ${inboxId} • ${mode==="PAID"?"ΠΛΗΡΩΜΕΝΟ":"ΜΕ ΠΙΣΤΩΣΗ"}`})});
    await patch("IN_REVIEW",`✅ Background V2.4.4 ολοκληρώθηκε • ${productLines.length} γραμμές • ${created?.purchaseOrderId||created?.id||"προς έλεγχο"}`);
  }catch(error){await patch("IN_REVIEW",`⚠️ Χρειάζεται έλεγχο BackOffice • ${String(error?.message||error).slice(0,700)}`)}
}

export default function StoreSupplierInvoicePremiumFast({api,store,suppliers=[],onChanged,setMessage}){
  const [file,setFile]=useState(null),[supplierId,setSupplierId]=useState(""),[amount,setAmount]=useState(""),[documentNumber,setDocumentNumber]=useState(""),[documentDate,setDocumentDate]=useState(today()),[mode,setMode]=useState(""),[busy,setBusy]=useState(false),[reading,setReading]=useState(false),[status,setStatus]=useState("Επίλεξε ή φωτογράφισε το τιμολόγιο."),[cameraOpen,setCameraOpen]=useState(false),[stream,setStream]=useState(null);
  const videoRef=useRef(null),canvasRef=useRef(null),supplier=useMemo(()=>suppliers.find(x=>String(x.id)===String(supplierId))||null,[suppliers,supplierId]);
  const stopCamera=()=>{stream?.getTracks?.().forEach(t=>t.stop());setStream(null);setCameraOpen(false)};
  const selectFile=async next=>{if(!next)return;setFile(next);setReading(true);setStatus("FAST ανάγνωση βασικών στοιχείων…");try{const text=await fastHeaderOcr(next),meta=headerMeta(text,suppliers);if(meta.supplierId)setSupplierId(meta.supplierId);if(meta.documentNumber)setDocumentNumber(meta.documentNumber);if(meta.documentDate)setDocumentDate(meta.documentDate);if(meta.totalGross>0)setAmount(meta.totalGross.toFixed(2).replace(".",","));setStatus("Έτοιμα τα βασικά στοιχεία. Έλεγξέ τα και ολοκλήρωσε την πληρωμή — τα προϊόντα θα διαβαστούν στο background.")}catch(error){setStatus(`Δεν διαβάστηκαν αυτόματα όλα τα βασικά στοιχεία. Συμπλήρωσέ τα χειροκίνητα και συνέχισε. ${error?.message||""}`)}finally{setReading(false)}};
  const startCamera=async()=>{try{stopCamera();const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false});setStream(s);setCameraOpen(true);setTimeout(()=>{if(videoRef.current)videoRef.current.srcObject=s},0)}catch{setMessage?.("❌ Δεν μπόρεσε να ανοίξει η κάμερα.")}};
  const capture=()=>{const v=videoRef.current,c=canvasRef.current;if(!v||!c)return;c.width=v.videoWidth||1280;c.height=v.videoHeight||720;c.getContext("2d").drawImage(v,0,0,c.width,c.height);c.toBlob(blob=>{stopCamera();if(blob)selectFile(new File([blob],`timologio-${Date.now()}.jpg`,{type:"image/jpeg"}))},"image/jpeg",.9)};
  const ready=Boolean(file&&supplierId&&documentNumber.trim()&&num(amount)>0&&mode&&!busy&&!reading);
  const submit=async()=>{if(!ready)return;setBusy(true);try{
    await api("/api/commerce/ai-reader/fast-duplicate-check",{method:"POST",body:JSON.stringify({storeId:store.id,supplierId,documentNumber:documentNumber.trim(),documentDate})});
    const dataUrl=await readFile(file),key=paymentKey(),totalGross=num(amount),responsibleName="POS";
    const note=`POS PREMIUM FAST • ${mode==="PAID"?"ΠΛΗΡΩΜΕΝΟ":"ΜΕ ΠΙΣΤΩΣΗ"} • ${totalGross.toFixed(2)} € • Τιμολόγιο ${documentNumber.trim()} • Background V2.4.4`;
    const inbox=await api("/api/commerce/documents/inbox",{method:"POST",body:JSON.stringify({storeId:store.id,supplierId,responsibleName,note,file:{dataUrl,filename:file.name||"timologio.jpg"}})});
    let paymentTransactionId=null;
    if(mode==="PAID"){
      const payment=await api(`/api/transactions/stores/${encodeURIComponent(store.id)}`,{method:"POST",body:JSON.stringify({type:"SUPPLIER_PAYMENT",amount:totalGross,supplierId,supplierName:supplier?.name||null,description:`Τιμολόγιο ${documentNumber.trim()} — PREMIUM FAST POS`,evidenceMode:"NO_DOCUMENT",paymentSource:"CASH_SHIFT",idempotencyKey:key})});
      paymentTransactionId=payment?.id||null;if(!paymentTransactionId)throw new Error("Η πληρωμή γράφτηκε χωρίς αναγνωριστικό συναλλαγής.");
      try{window.dispatchEvent(new CustomEvent("myworkstation:cash-drawer-request",{detail:{reason:"SUPPLIER_PAYMENT",amount:totalGross,storeId:store.id,transactionId:paymentTransactionId}}))}catch{}
    }
    const success=mode==="PAID"?`✅ Πληρωμή ${totalGross.toFixed(2)} € καταχωρίστηκε. Επιστροφή στο POS — τα προϊόντα διαβάζονται στο background.`:`✅ Τιμολόγιο με πίστωση καταχωρίστηκε. Επιστροφή στο POS — τα προϊόντα διαβάζονται στο background.`;
    setMessage?.(success);onChanged?.();
    backgroundV244({api,store,fileDataUrl:dataUrl,filename:file.name||"timologio.jpg",mimeType:file.type||"image/jpeg",supplierId,documentNumber:documentNumber.trim(),documentDate,totalGross,inboxId:inbox.id,mode,paymentTransactionId});
  }catch(error){setMessage?.(`❌ ${error?.message||"Η καταχώριση απέτυχε."}`);setBusy(false)}};
  return <div className="pos-payment-form-v3-root">
    <div style={{padding:"10px 12px",borderRadius:10,background:"#e9f8f1",fontWeight:900,color:"#0b6249",marginBottom:10}}>PREMIUM FAST — πρώτα βασικά στοιχεία και πληρωμή. Η πλήρης ανάγνωση προϊόντων V2.4.4 συνεχίζεται στο BackOffice.</div>
    <div style={{padding:"9px 11px",borderRadius:9,background:"#fff",fontWeight:800,marginBottom:10}}>{status}</div>
    <div className="pos-photo-actions"><button type="button" onClick={startCamera} disabled={busy||reading}><Camera/> Λήψη από κάμερα</button><label><FileUp/> Επιλογή αρχείου / PDF<input type="file" accept="image/*,application/pdf" disabled={busy||reading} onChange={e=>selectFile(e.target.files?.[0]||null)}/></label><b>{file?.name||"Δεν επιλέχθηκε τιμολόγιο"}</b></div>
    {cameraOpen&&<div className="pos-camera-live"><video ref={videoRef} autoPlay playsInline/><canvas ref={canvasRef} hidden/><div><button type="button" onClick={capture}><Camera/> Φωτογράφιση</button><button type="button" onClick={stopCamera}>Κλείσιμο</button></div></div>}
    <label>Προμηθευτής<select value={supplierId} disabled={busy} onChange={e=>setSupplierId(e.target.value)}><option value="">Επίλεξε προμηθευτή</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}{s.taxId?` · ${s.taxId}`:""}</option>)}</select></label>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}><label>Συνολικό ποσό<input inputMode="decimal" value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/></label><label>Αριθμός τιμολογίου<input value={documentNumber} disabled={busy} onChange={e=>setDocumentNumber(e.target.value)}/></label><label>Ημερομηνία<input type="date" value={documentDate} disabled={busy} onChange={e=>setDocumentDate(e.target.value)}/></label></div>
    <div className="pos-payment-types"><button type="button" aria-pressed={mode==="PAID"} className={mode==="PAID"?"active":""} disabled={busy||reading} onClick={()=>setMode("PAID")}>ΠΛΗΡΩΜΕΝΟ — από ταμείο</button><button type="button" aria-pressed={mode==="CREDIT"} className={mode==="CREDIT"?"active":""} disabled={busy||reading} onClick={()=>setMode("CREDIT")}>ΜΕ ΠΙΣΤΩΣΗ</button></div>
    <button className="pos-primary-action" disabled={!ready} onClick={submit}><Wallet/> {reading?"FAST ανάγνωση…":busy?"Καταχώριση…":mode==="PAID"?"ΠΛΗΡΩΜΗ & ΕΠΙΣΤΡΟΦΗ ΣΤΟ POS":"ΚΑΤΑΧΩΡΙΣΗ ΜΕ ΠΙΣΤΩΣΗ"}</button>
  </div>;
}
