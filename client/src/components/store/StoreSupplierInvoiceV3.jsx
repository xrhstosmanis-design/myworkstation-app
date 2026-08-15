import React,{useEffect,useMemo,useRef,useState} from "react";
import {Camera,FileUp,Wallet} from "lucide-react";

const AI_THRESHOLD=65;
const today=()=>new Date().toISOString().slice(0,10);
const euro=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const parseMoney=value=>{const n=Number(String(value??"").replace(/\s/g,"").replace(/\.(?=\d{3}(?:\D|$))/g,"").replace(",",".").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0};
const normalize=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleUpperCase("el-GR").replace(/[^A-ZΑ-Ω0-9]/g,"");
const readFile=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error("Δεν ήταν δυνατή η ανάγνωση του τιμολογίου."));reader.readAsDataURL(file)});

function collectLines(data){
  const found=[];
  const visit=node=>{
    if(!node)return;
    if(Array.isArray(node)){node.forEach(visit);return;}
    if(node.text&&node.words&&String(node.text).trim())found.push({text:String(node.text).trim(),confidence:Math.max(0,Math.min(100,Math.round(Number(node.confidence)||0)))});
    for(const key of ["blocks","paragraphs","lines"])visit(node[key]);
  };
  visit(data?.blocks);
  if(found.length)return found;
  return String(data?.text||"").split(/\r?\n/).map(text=>text.trim()).filter(Boolean).map(text=>({text,confidence:Math.round(Number(data?.confidence)||0)}));
}

async function pdfPreview(file){
  const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc=new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs",import.meta.url).toString();
  const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
  const page=await pdf.getPage(1),viewport=page.getViewport({scale:2}),canvas=document.createElement("canvas");
  canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  await page.render({canvasContext:canvas.getContext("2d"),viewport}).promise;
  return {source:canvas.toDataURL("image/jpeg",.92),pageCount:pdf.numPages,pdfNote:pdf.numPages>1?`Το OCR διάβασε την πρώτη σελίδα από ${pdf.numPages}. Αν χρειαστεί AI, ελέγχεται το αρχικό PDF.`:"Αναγνώστηκε η πρώτη σελίδα του PDF."};
}

async function localOcr(file){
  const dataUrl=await readFile(file);
  let source=file,pageCount=null,pdfNote=null;
  if(file.type==="application/pdf"){
    const preview=await pdfPreview(file);source=preview.source;pageCount=preview.pageCount;pdfNote=preview.pdfNote;
  }
  const {createWorker}=await import("tesseract.js"),worker=await createWorker("ell+eng");let result;
  try{result=await worker.recognize(source)}finally{await worker.terminate()}
  return {dataUrl,filename:file.name||"timologio.jpg",mimeType:file.type||"image/jpeg",confidence:Math.max(0,Math.min(100,Math.round(Number(result?.data?.confidence)||0))),rawText:result?.data?.text||"",lines:collectLines(result?.data||{}),pageCount,pdfNote};
}

function localMeta(rawText,suppliers=[]){
  const raw=String(rawText||""),lines=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),joined=normalize(raw);
  let supplier=null,best=0;
  for(const item of suppliers){
    const names=[String(item.name||""),String(item.name||"").replace(/\s*\([^)]*\)\s*$/g,"")];
    for(const name of names){const key=normalize(name);if(key.length>=4&&joined.includes(key)&&key.length>best){supplier=item;best=key.length;}}
  }
  let documentNumber="";
  for(const line of lines){
    const match=line.match(/(?:ΤΙΜΟΛΟΓΙΟ|ΤΙΜ|INVOICE|ΠΑΡΑΣΤΑΤΙΚΟ).{0,30}?(?:ΑΡ\.?|ΑΡΙΘΜ(?:ΟΣ)?|NO\.?|#)?\s*[:\-]?\s*([A-ZΑ-Ω0-9][A-ZΑ-Ω0-9\-/]{2,})/i)||line.match(/(?:ΑΡ\.?\s*(?:ΤΙΜΟΛΟΓΙΟΥ)?|ΑΡΙΘΜΟΣ\s*(?:ΤΙΜΟΛΟΓΙΟΥ)?|INVOICE\s*NO\.?)\s*[:\-]?\s*([A-ZΑ-Ω0-9\-/]{3,})/i);
    if(match){documentNumber=match[1].trim();break;}
  }
  let documentDate="";
  for(const line of lines){
    const match=line.match(/(?:ΗΜΕΡΟΜΗΝΙΑ|DATE)?\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.](?:20)?\d{2})/i);
    if(match){let[d,m,y]=match[1].split(/[\/\-.]/).map(Number);if(y<100)y+=2000;documentDate=`${String(y).padStart(4,"0")}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;break;}
  }
  let totalGross=0;
  const totalWords=/(ΓΕΝΙΚΟ\s*ΣΥΝΟΛΟ|ΠΛΗΡΩΤΕΟ|ΤΕΛΙΚΟ\s*ΣΥΝΟΛΟ|ΣΥΝΟΛΟ\s*ΜΕ\s*ΦΠΑ|TOTAL\s*DUE|GRAND\s*TOTAL|TOTAL)/i;
  for(const line of lines.filter(x=>totalWords.test(x)).reverse()){
    const values=(line.match(/\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:[.,]\d{2})/g)||[]).map(parseMoney).filter(v=>v>0);
    if(values.length){totalGross=values.at(-1);break;}
  }
  const taxId=(raw.match(/(?:ΑΦΜ|VAT)\s*[:\-]?\s*([0-9]{9,12})/i)||[])[1]||"";
  return {supplierId:supplier?.id||"",supplierName:supplier?.name||"",documentNumber,documentDate:documentDate||today(),totalGross,supplierCandidate:{name:supplier?.name||"",taxId,email:"",phone:"",address:"",city:""}};
}

const emptyInvoice=()=>({file:null,jobId:"",stage:"IDLE",confidence:null,aiCalled:false,supplierId:"",documentNumber:"",documentDate:today(),totalGross:"",settlementMode:"",note:"",status:"Περιμένει τιμολόγιο.",working:false,done:false});

export default function StoreSupplierInvoiceV3({api,store,suppliers=[],onChanged,setMessage}){
  const [invoice,setInvoice]=useState(emptyInvoice),[candidate,setCandidate]=useState({name:"",taxId:"",phone:"",email:"",address:"",city:""});
  const [cameraOpen,setCameraOpen]=useState(false),[stream,setStream]=useState(null);const videoRef=useRef(null),canvasRef=useRef(null);
  const selectedSupplier=useMemo(()=>suppliers.find(row=>String(row.id)===String(invoice.supplierId))||null,[suppliers,invoice.supplierId]);
  const stopCamera=()=>{stream?.getTracks?.().forEach(track=>track.stop());setStream(null);setCameraOpen(false)};
  useEffect(()=>()=>stream?.getTracks?.().forEach(track=>track.stop()),[stream]);

  const setFailure=message=>setInvoice(current=>({...current,stage:"ERROR",working:false,status:`❌ ${message}`}));
  const startCamera=async()=>{try{stopCamera();const next=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false});setStream(next);setCameraOpen(true);setTimeout(()=>{if(videoRef.current)videoRef.current.srcObject=next},0)}catch{setFailure("Δεν μπόρεσε να ανοίξει η κάμερα. Έλεγξε την άδεια κάμερας του browser.")}};

  const applyReady=(base,result={},supplierMatch=null,aiCalled=false,confidence=null)=>{
    const supplierCandidate=result?.supplier||base.supplierCandidate||{};
    setCandidate({name:supplierCandidate.name||"",taxId:supplierCandidate.taxId||"",phone:supplierCandidate.phone||"",email:supplierCandidate.email||"",address:supplierCandidate.address||"",city:supplierCandidate.city||""});
    setInvoice(current=>({...current,stage:"READY",working:false,aiCalled,confidence:Number(confidence??current.confidence??0),supplierId:supplierMatch?.id||base.supplierId||current.supplierId||"",documentNumber:String(result?.documentNumber||base.documentNumber||current.documentNumber||""),documentDate:String(result?.documentDate||base.documentDate||current.documentDate||today()).slice(0,10),totalGross:Number(result?.totalGross||base.totalGross||0)>0?String(Number(result?.totalGross||base.totalGross).toFixed(2)).replace(".",","):current.totalGross,status:"Έτοιμο για καταχώριση"}));
  };

  const processFile=async file=>{
    if(!file)return;
    setCandidate({name:"",taxId:"",phone:"",email:"",address:"",city:""});
    setInvoice({...emptyInvoice(),file,stage:"OCR",working:true,status:"Διαβάζω τιμολόγιο…"});
    try{
      const ocr=await localOcr(file),base=localMeta(ocr.rawText,suppliers);
      const job=await api("/api/commerce/ai-reader/jobs",{method:"POST",body:JSON.stringify({storeId:store.id,filename:ocr.filename,mimeType:ocr.mimeType,dataUrl:ocr.dataUrl,localConfidence:ocr.confidence,result:{rawText:ocr.rawText,lines:ocr.lines,pageCount:ocr.pageCount,pdfNote:ocr.pdfNote}})});
      if(!job?.id)throw new Error("Ο server δεν επέστρεψε κωδικό ανάγνωσης τιμολογίου.");
      setInvoice(current=>({...current,jobId:job.id,confidence:ocr.confidence}));
      if(ocr.confidence<AI_THRESHOLD){
        setInvoice(current=>({...current,stage:"AI",status:`OCR ${ocr.confidence}% — γίνεται αυτόματος επανέλεγχος AI…`}));
        const ai=await api(`/api/commerce/ai-reader/jobs/${encodeURIComponent(job.id)}/ai-recheck`,{method:"POST",body:"{}"});
        applyReady(base,ai?.result||{},ai?.supplierMatch||null,Boolean(ai?.aiCalled),Number(ai?.confidence??ocr.confidence));
      }else applyReady(base,{},base.supplierId?{id:base.supplierId,name:base.supplierName}:null,false,ocr.confidence);
    }catch(error){setFailure(error.message||"Η ανάγνωση του τιμολογίου απέτυχε.")}
  };

  const manualAiRecheck=async()=>{
    if(!invoice.jobId||invoice.working||invoice.done)return;
    const base={supplierId:invoice.supplierId,supplierName:selectedSupplier?.name||"",documentNumber:invoice.documentNumber,documentDate:invoice.documentDate,totalGross:parseMoney(invoice.totalGross),supplierCandidate:candidate};
    setInvoice(current=>({...current,stage:"AI",working:true,status:"Γίνεται επανέλεγχος με AI μετά από δική σου επιλογή…"}));
    try{
      const ai=await api(`/api/commerce/ai-reader/jobs/${encodeURIComponent(invoice.jobId)}/ai-recheck`,{method:"POST",body:JSON.stringify({force:true})});
      applyReady(base,ai?.result||{},ai?.supplierMatch||null,true,Number(ai?.confidence??invoice.confidence??0));
    }catch(error){setFailure(error.message||"Ο επανέλεγχος με AI απέτυχε.")}
  };

  const capture=()=>{const video=videoRef.current,canvas=canvasRef.current;if(!video||!canvas)return;canvas.width=video.videoWidth||1280;canvas.height=video.videoHeight||720;canvas.getContext("2d").drawImage(video,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>{if(!blob)return;stopCamera();processFile(new File([blob],`timologio-${Date.now()}.jpg`,{type:"image/jpeg"}))},"image/jpeg",.92)};

  const saveSupplier=async()=>{
    if(!invoice.jobId)return setFailure("Η ενεργή ανάγνωση τιμολογίου χάθηκε. Επίλεξε ξανά το αρχείο.");
    if(candidate.name.trim().length<2)return setFailure("Συμπλήρωσε την επωνυμία του νέου προμηθευτή.");
    setInvoice(current=>({...current,working:true,status:"Καταχωρίζω τον νέο προμηθευτή…"}));
    try{
      const data=await api(`/api/commerce/ai-reader/jobs/${encodeURIComponent(invoice.jobId)}/supplier`,{method:"POST",body:JSON.stringify(candidate)});
      setInvoice(current=>({...current,supplierId:data.supplier.id,working:false,stage:"READY",status:"Έτοιμο για καταχώριση"}));onChanged?.();
    }catch(error){setFailure(error.message||"Δεν αποθηκεύτηκε ο προμηθευτής.")}
  };

  const ready=Boolean(invoice.stage==="READY"&&invoice.jobId&&invoice.supplierId&&invoice.documentNumber.trim()&&invoice.documentDate&&parseMoney(invoice.totalGross)>0&&["PAID","CREDIT"].includes(invoice.settlementMode)&&!invoice.working&&!invoice.done);
  const submit=async()=>{
    if(!ready)return;
    const totalGross=parseMoney(invoice.totalGross),documentNumber=invoice.documentNumber.trim();
    setInvoice(current=>({...current,stage:"SUBMITTING",working:true,status:"Καταχώριση σε εξέλιξη…"}));
    try{
      const data=await api(`/api/commerce/ai-reader/jobs/${encodeURIComponent(invoice.jobId)}/pos-intake`,{method:"POST",body:JSON.stringify({supplierId:invoice.supplierId,documentNumber,documentDate:invoice.documentDate,totalGross,settlementMode:invoice.settlementMode,note:invoice.note.trim()||null})});
      if(data?.stockUpdated===true)throw new Error("Η αποθήκη ενημερώθηκε πριν την Οριστικοποίηση. Η καταχώριση σταμάτησε για έλεγχο.");
      const success=invoice.settlementMode==="PAID"?`✅ Πληρωμή ${euro(totalGross)} καταγράφηκε και τιμολόγιο ${documentNumber} στάλθηκε για έλεγχο`:`✅ Τιμολόγιο ${documentNumber} καταχωρίστηκε ΜΕ ΠΙΣΤΩΣΗ και στάλθηκε για έλεγχο`;
      setInvoice(current=>({...current,stage:"DONE",working:false,done:true,status:success}));setMessage?.(success);onChanged?.();
    }catch(error){setFailure(error.message||"Η καταχώριση απέτυχε.")}
  };

  return <div className="pos-invoice-v3" data-pos-supplier-invoice-v3="true" style={{border:"2px solid #d8b45b",borderRadius:12,padding:14,marginTop:12,background:"#fffaf0"}}>
    <div style={{fontWeight:900,fontSize:18}}>Αυτόματη καταχώριση τιμολογίου <small style={{fontSize:12,background:"#dcfce7",padding:"4px 7px",borderRadius:12}}>V3 · React</small></div>
    <div style={{padding:"10px 12px",borderRadius:9,background:invoice.stage==="ERROR"?"#fff1f2":invoice.stage==="DONE"?"#ecfdf5":"#fff",fontWeight:800,margin:"10px 0"}}>{invoice.status}</div>
    <div className="pos-photo-actions"><button type="button" onClick={startCamera} disabled={invoice.working||invoice.done}><Camera/> Λήψη από κάμερα</button><label><FileUp/> Επιλογή αρχείου / PDF<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" disabled={invoice.working||invoice.done} onChange={event=>processFile(event.target.files?.[0]||null)}/></label><b>{invoice.file?.name||"Δεν επιλέχθηκε τιμολόγιο"}</b></div>
    {cameraOpen&&<div className="pos-camera-live"><video ref={videoRef} autoPlay playsInline/><canvas ref={canvasRef} hidden/><div><button type="button" onClick={capture}><Camera/> Φωτογράφιση</button><button type="button" onClick={stopCamera}>Κλείσιμο κάμερας</button></div></div>}
    {invoice.confidence!==null&&<small style={{display:"block",margin:"8px 0",fontWeight:700}}>Ανάγνωση {Math.round(Number(invoice.confidence)||0)}%{invoice.aiCalled?" · AI επανέλεγχος":" · τοπικό OCR"}</small>}
    {invoice.jobId&&invoice.stage==="READY"&&!invoice.aiCalled&&!invoice.done&&<button type="button" onClick={manualAiRecheck} disabled={invoice.working} style={{margin:"0 0 10px",fontWeight:800}}>Επανέλεγχος με AI</button>}

    <label>Προμηθευτής<select value={invoice.supplierId} disabled={invoice.working||invoice.done} onChange={event=>setInvoice(current=>({...current,supplierId:event.target.value}))}><option value="">Επίλεξε προμηθευτή</option>{suppliers.map(row=><option key={row.id} value={row.id}>{row.name}{row.taxId?` · ${row.taxId}`:""}</option>)}</select></label>
    {!invoice.supplierId&&invoice.jobId&&candidate.name&&<div style={{border:"1px solid #f59e0b",borderRadius:9,padding:10,margin:"8px 0",background:"#fff7ed"}}><b>Νέος προμηθευτής — δεν βρέθηκε στο BackOffice</b><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:8}}><input placeholder="Επωνυμία" value={candidate.name} onChange={e=>setCandidate(x=>({...x,name:e.target.value}))}/><input placeholder="ΑΦΜ" value={candidate.taxId} onChange={e=>setCandidate(x=>({...x,taxId:e.target.value}))}/><input placeholder="Τηλέφωνο" value={candidate.phone} onChange={e=>setCandidate(x=>({...x,phone:e.target.value}))}/><input placeholder="Email" value={candidate.email} onChange={e=>setCandidate(x=>({...x,email:e.target.value}))}/><input placeholder="Διεύθυνση" value={candidate.address} onChange={e=>setCandidate(x=>({...x,address:e.target.value}))}/><input placeholder="Πόλη" value={candidate.city} onChange={e=>setCandidate(x=>({...x,city:e.target.value}))}/></div><button type="button" style={{width:"100%",marginTop:8,fontWeight:800}} disabled={invoice.working} onClick={saveSupplier}>Καταχώριση στους Προμηθευτές</button></div>}
    <label>Αριθμός τιμολογίου<input value={invoice.documentNumber} disabled={invoice.working||invoice.done} onChange={event=>setInvoice(current=>({...current,documentNumber:event.target.value}))}/></label>
    <label>Ημερομηνία<input type="date" value={invoice.documentDate} disabled={invoice.working||invoice.done} onChange={event=>setInvoice(current=>({...current,documentDate:event.target.value}))}/></label>
    <label>Συνολικό ποσό<input inputMode="decimal" value={invoice.totalGross} disabled={invoice.working||invoice.done} onChange={event=>setInvoice(current=>({...current,totalGross:event.target.value}))}/></label>
    <label>Παρατηρήσεις<input value={invoice.note} disabled={invoice.working||invoice.done} onChange={event=>setInvoice(current=>({...current,note:event.target.value}))}/></label>
    <div style={{display:"flex",gap:8,margin:"12px 0"}}><button type="button" style={{flex:1,fontWeight:invoice.settlementMode==="PAID"?900:600}} disabled={invoice.working||invoice.done} aria-pressed={invoice.settlementMode==="PAID"} onClick={()=>setInvoice(current=>({...current,settlementMode:"PAID"}))}>ΠΛΗΡΩΜΕΝΟ</button><button type="button" style={{flex:1,fontWeight:invoice.settlementMode==="CREDIT"?900:600}} disabled={invoice.working||invoice.done} aria-pressed={invoice.settlementMode==="CREDIT"} onClick={()=>setInvoice(current=>({...current,settlementMode:"CREDIT"}))}>ΜΕ ΠΙΣΤΩΣΗ</button></div>
    <small style={{display:"block",marginBottom:10}}><b>ΠΛΗΡΩΜΕΝΟ:</b> δημιουργεί το τιμολόγιο προς έλεγχο και αφαιρεί το ποσό από την ενεργή βάρδια. <b>ΜΕ ΠΙΣΤΩΣΗ:</b> δημιουργεί το τιμολόγιο προς έλεγχο χωρίς αφαίρεση χρημάτων. Το stock παραμένει ανέγγιχτο μέχρι την Οριστικοποίηση.</small>
    {!selectedSupplier&&invoice.supplierId&&<small style={{display:"block",marginBottom:8}}>Ο επιλεγμένος προμηθευτής θα επιβεβαιωθεί από τον server.</small>}
    <button className="pos-primary-action" type="button" disabled={!ready} onClick={submit}><Wallet/> {invoice.stage==="SUBMITTING"?"Καταχώριση σε εξέλίξη…":"Καταχώριση τιμολογίου για έλεγχο"}</button>
  </div>;
}