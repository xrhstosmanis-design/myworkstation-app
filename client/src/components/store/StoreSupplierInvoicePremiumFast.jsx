import React,{useMemo,useRef,useState} from "react";
import {Camera,FileUp,Wallet} from "lucide-react";
import QRCode from "qrcode";
import {finalizeV244ProductLines} from "../../lib/invoice-v244.js";

const num=v=>Number(String(v??"0").replace(/\s/g,"").replace(/\.(?=\d{3}(?:\D|$))/g,"").replace(",",".").replace(/[^0-9.-]/g,""))||0;
const readFile=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error("Δεν διαβάστηκε το παραστατικό."));r.readAsDataURL(file)});
const paymentKey=()=>`pos-invoice-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
const optimizeImage=async file=>{
  if(!file?.type?.startsWith("image/")||file.size<=4500000)return file;
  try{
    const dataUrl=await readFile(file);
    const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=dataUrl});
    const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height,scale=Math.min(1,2200/Math.max(width,height));
    const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",0.82));
    return blob?new File([blob],file.name.replace(/\\.[^.]+$/,"")+".jpg",{type:"image/jpeg"}):file;
  }catch{return file}
};
const checkPhoto=async file=>{if(!file.type.startsWith("image/"))return null;if(file.size<70000)return "Η φωτογραφία είναι πολύ μικρή· βγάλε καθαρότερη φωτογραφία του παραστατικού.";const u=URL.createObjectURL(file);try{return await new Promise(resolve=>{const i=new Image();i.onload=()=>{const ok=Math.max(i.width,i.height)>=1000&&Math.min(i.width,i.height)>=600;URL.revokeObjectURL(u);resolve(ok?null:"Η ανάλυση είναι χαμηλή. Φωτογράφισε το παραστατικό από πιο κοντά και με καλό φωτισμό.")};i.onerror=()=>resolve(null);i.src=u})}catch{return null}};

async function backgroundV244({api,store,pages,supplierId,documentNumber,documentDate,totalGross,mode,paymentTransactionId,resumeJobId=null,onProgress}){
  let jobId=resumeJobId||null;
  let stage="Δημιουργία εργασίας AI Reader";
  try{
    const existingJobs=resumeJobId?await api(`/api/commerce/ai-reader/jobs?storeId=${encodeURIComponent(store.id)}`):[];
    const existing=Array.isArray(existingJobs)?existingJobs.find(row=>row.id===resumeJobId):null;
    const pageJobs=[];
    for(const [pageIndex,page] of pages.entries()){
      onProgress?.(`Προετοιμασία σελίδας ${pageIndex+1}/${pages.length}…`);
      const resumed=pageIndex===0?existing:null;
      const job=resumed||await api("/api/commerce/ai-reader/jobs",{method:"POST",body:JSON.stringify({storeId:store.id,filename:page.file.name||`timologio-selida-${pageIndex+1}.jpg`,mimeType:page.file.type||"image/jpeg",dataUrl:page.dataUrl,localConfidence:0,result:{rawText:"",lines:[],pageCount:pages.length,pdfNote:`Γρήγορη καταχώριση με AI — σελίδα ${pageIndex+1}/${pages.length} στο παρασκήνιο V2.4.4`}})});
      if(!job?.id)throw new Error(`Δεν δημιουργήθηκε εργασία V2.4.4 για τη σελίδα ${pageIndex+1}.`);
      if(pageIndex===0)jobId=job.id;
      pageJobs.push(job);
    }
    stage=`Ενιαία αναγνώριση τιμολογίου ${pages.length} ${pages.length===1?"σελίδας":"σελίδων"}`;
    onProgress?.(`Ενιαία αναγνώριση όλων των ${pages.length} ${pages.length===1?"σελίδων":"σελίδων"} με τη σειρά…`);
    const completedLines=Array.isArray(existing?.result?.productLines)?existing.result.productLines:[];
    const existingTotalMismatch=Array.isArray(existing?.result?.reconciliation?.headerReview)&&existing.result.reconciliation.headerReview.includes("INVOICE_TOTAL_DIFFERS_FROM_LINE_SUM");
    const ai=pages.length===1&&completedLines.length&&!existingTotalMismatch?{result:existing.result}:await api(`/api/commerce/ai-reader/jobs/${encodeURIComponent(pageJobs[0].id)}/ai-recheck`,{method:"POST",body:JSON.stringify({force:true,additionalPageJobIds:pageJobs.slice(1).map(pageJob=>pageJob.id)}),signal:new AbortController().signal});
    const combinedLines=finalizeV244ProductLines(Array.isArray(ai?.result?.productLines)?ai.result.productLines:[]);
    stage="Επικύρωση γραμμών προϊόντων";
    if(!combinedLines.length)throw new Error(`Δεν βρέθηκαν ασφαλείς γραμμές προϊόντων στο ενιαίο τιμολόγιο ${pages.length} ${pages.length===1?"σελίδας":"σελίδων"}.`);
    stage="Προετοιμασία πλήρους ελέγχου γραμμών";
    return {jobId:pageJobs[0].id,additionalPageJobIds:pageJobs.slice(1).map(pageJob=>pageJob.id),productLines:combinedLines};
  }catch(error){throw new Error(`${stage}${jobId?` • AI job ${jobId}`:""}: ${String(error?.message||error).slice(0,520)}`)}
}

export default function StoreSupplierInvoicePremiumFast({api,store,suppliers=[],onChanged,setMessage}){
  const [pages,setPages]=useState([]),[supplierId,setSupplierId]=useState(""),[amount,setAmount]=useState(""),[documentNumber,setDocumentNumber]=useState(""),[documentDate,setDocumentDate]=useState(""),[mode,setMode]=useState(""),[paymentMethod,setPaymentMethod]=useState("CASH_SHIFT"),[busy,setBusy]=useState(false),[reading,setReading]=useState(false),[status,setStatus]=useState("Επίλεξε ή φωτογράφισε έως 5 σελίδες του ίδιου τιμολογίου."),[cameraOpen,setCameraOpen]=useState(false),[stream,setStream]=useState(null),[supplierCandidate,setSupplierCandidate]=useState({name:"",taxId:""}),[createdSupplier,setCreatedSupplier]=useState(null),[savingSupplier,setSavingSupplier]=useState(false);
  const videoRef=useRef(null),canvasRef=useRef(null);
  const [qr,setQr]=useState("");
  const [qrUrl,setQrUrl]=useState("");
  const [review,setReview]=useState(null);
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
      for(const next of incoming){const qualityError=await checkPhoto(next);if(qualityError)throw new Error(qualityError)}
      const prepared=[];
      for(const next of incoming){const optimized=await optimizeImage(next);prepared.push({file:optimized,dataUrl:await readFile(optimized)})}
      const nextPages=[...pages,...prepared];setPages(nextPages);
      if(initial){setSupplierId("");setAmount("");setDocumentNumber("");setDocumentDate("");setMode("");setCreatedSupplier(null);setSupplierCandidate({name:"",taxId:""})}
      const headerPages=initial&&nextPages.length>1?[nextPages[0],nextPages[nextPages.length-1]]:[nextPages[nextPages.length-1]];
      let supplierMeta=null,documentMeta=null,totalMeta=null,confidence=0;
      for(const page of headerPages){
        const meta=await api("/api/commerce/ai-reader/fast-header",{method:"POST",body:JSON.stringify({storeId:store.id,filename:page.file.name||"timologio.jpg",mimeType:page.file.type||"image/jpeg",dataUrl:page.dataUrl})});
        if(!supplierMeta&&(meta?.supplierId||meta?.supplierName))supplierMeta=meta;
        if(!documentMeta&&(meta?.documentNumber||meta?.documentDate))documentMeta=meta;
        if(Number(meta?.totalGross||0)>0)totalMeta=meta;
        confidence=Math.max(confidence,Number(meta?.confidence||0));
      }
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
  const removePage=index=>{if(busy||reading)return;const next=pages.filter((_,i)=>i!==index);setPages(next);if(!next.length){setSupplierId("");setAmount("");setDocumentNumber("");setDocumentDate("");setMode("");setStatus("Επίλεξε ή φωτογράφισε έως 5 σελίδες του ίδιου τιμολογίου.")}};
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
  const startCamera=async()=>{try{stopCamera();const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false});setStream(s);setCameraOpen(true);setTimeout(()=>{if(videoRef.current)videoRef.current.srcObject=s},0)}catch{setMessage?.("❌ Δεν μπόρεσε να ανοίξει η κάμερα.")}};
  const capture=()=>{const v=videoRef.current,c=canvasRef.current;if(!v||!c)return;c.width=v.videoWidth||1280;c.height=v.videoHeight||720;c.getContext("2d").drawImage(v,0,0,c.width,c.height);c.toBlob(blob=>{stopCamera();if(blob)selectFiles([new File([blob],`timologio-selida-${pages.length+1}-${Date.now()}.jpg`,{type:"image/jpeg"})])},"image/jpeg",.9)};
  const createQr=async()=>{if(pages.length>=5)return setMessage?.("⚠️ Έχουν ήδη επιλεγεί 5 σελίδες.");try{const r=await api("/api/commerce/mobile-invoice-upload-sessions",{method:"POST",body:JSON.stringify({storeId:store.id})});setQrUrl(r.url);setQr(await QRCode.toDataURL(r.url));const timer=setInterval(async()=>{try{const x=await api(`/api/commerce/mobile-invoice-upload-sessions/${r.id}`);if(x?.dataUrl){clearInterval(timer);const b=await fetch(x.dataUrl).then(v=>v.blob());selectFiles([new File([b],x.filename,{type:x.mimeType})]);setQr("");setQrUrl("")}}catch{}},2000)}catch(e){setMessage?.(`❌ ${e?.message||"Δεν δημιουργήθηκε QR."}`)}};
  const ready=Boolean(pages.length&&pages.every(page=>page.dataUrl)&&supplierId&&documentNumber.trim()&&documentDate&&num(amount)>0&&mode&&!busy&&!reading&&!savingSupplier);
  const updateReviewLine=(index,field,value)=>setReview(current=>{if(!current)return current;const numeric=["quantity","unitCost","netAmount","vatRate","grossAmount"].includes(field);return {...current,productLines:current.productLines.map((line,rowIndex)=>{if(rowIndex!==index)return line;const next={...line,[field]:numeric?num(value):value};if(field==="netAmount"||field==="vatRate")next.grossAmount=Math.round((Number(next.netAmount||0)*(1+Number(next.vatRate||0)/100)+Number.EPSILON)*100)/100;return next})}});
  const removeReviewLine=index=>setReview(current=>current?{...current,productLines:current.productLines.filter((_,rowIndex)=>rowIndex!==index)}:current);
  const addReviewLine=()=>setReview(current=>current?{...current,productLines:[...current.productLines,{rawText:"Χειροκίνητη γραμμή",code:"",barcode:"",description:"",quantity:1,unit:"ΤΜΧ",unitsPerPackage:0,unitCost:0,netAmount:0,vatRate:24,grossAmount:0,confidence:100}]}:current);
  const confirmReview=async()=>{
    if(!review||busy)return;
    const totalGross=num(amount),lines=review.productLines||[],linesGross=Math.round((lines.reduce((sum,line)=>sum+Number(line.grossAmount||0),0)+Number.EPSILON)*100)/100,difference=Math.round((linesGross-totalGross+Number.EPSILON)*100)/100;
    if(!lines.length||lines.some(line=>!String(line.description||"").trim()||Number(line.quantity||0)<=0||Number(line.unitCost||0)<=0))return setStatus("Συμπλήρωσε περιγραφή, ποσότητα και τιμή σε κάθε γραμμή πριν την καταχώριση.");
    if(Math.abs(difference)>0.05)return setStatus(`Η διαφορά είναι ${difference.toFixed(2)} €. Διόρθωσε τις γραμμές μέχρι το σύνολό τους να συμφωνεί με το τιμολόγιο.`);
    setBusy(true);let stage="Αποθήκευση τελικών γραμμών";
    try{
      let paymentTransactionId=review.paymentTransactionId||null;
      if(mode==="PAID"&&!paymentTransactionId){
        stage="ΠΛΗΡΩΜΗ ΒΑΡΔΙΑΣ";const key=paymentKey();
        const payment=await api(`/api/transactions/stores/${encodeURIComponent(store.id)}`,{method:"POST",body:JSON.stringify({type:"SUPPLIER_PAYMENT",amount:totalGross,supplierId,supplierName:supplier?.name||null,description:`Τιμολόγιο ${documentNumber.trim()} — έλεγχος γραμμών POS`,evidenceMode:"NO_DOCUMENT",paymentSource,paymentMethod,idempotencyKey:key,attachment:{dataUrl:fileDataUrl,filename:file.name||"timologio.jpg"}})});
        paymentTransactionId=payment?.id||null;if(!paymentTransactionId)throw new Error("Η πληρωμή γράφτηκε χωρίς αναγνωριστικό συναλλαγής.");
        if(paymentSource==="CASH_SHIFT")try{window.dispatchEvent(new CustomEvent("myworkstation:cash-drawer-request",{detail:{reason:"SUPPLIER_PAYMENT",amount:totalGross,storeId:store.id,transactionId:paymentTransactionId}}))}catch{}
      }
      await api(`/api/commerce/ai-reader/jobs/${encodeURIComponent(review.jobId)}/product-lines`,{method:"PUT",body:JSON.stringify({source:"V2.4.4",productLines:lines})});
      stage="Καταχώριση τιμολογίου";
      const created=await api(`/api/commerce/ai-reader/jobs/${encodeURIComponent(review.jobId)}/pos-intake`,{method:"POST",body:JSON.stringify({storeId:store.id,supplierId,documentNumber:documentNumber.trim(),documentDate,totalGross,settlementMode:mode,paymentTransactionId:mode==="PAID"?paymentTransactionId:null,additionalPageJobIds:review.additionalPageJobIds||[],note:`Ελεγμένες γραμμές POS • ${lines.length} προϊόντα • ${mode==="PAID"?"ΠΛΗΡΩΜΕΝΟ":"ΜΕ ΠΙΣΤΩΣΗ"}`})});
      setReview(null);setStatus(`✅ Το τιμολόγιο καταχωρίστηκε με ${created?.lineCount||lines.length} ελεγμένες γραμμές και αρχειοθετήθηκε στη Θυρίδα.`);setMessage?.(`✅ Το τιμολόγιο ${documentNumber.trim()} καταχωρίστηκε για έλεγχο BackOffice.`);onChanged?.();
    }catch(error){setStatus(`⚠️ Δεν ολοκληρώθηκε η καταχώριση στο στάδιο ${stage}. ${error?.message||error}`);setMessage?.(`⚠️ Η πληρωμή διατηρήθηκε και δεν πρέπει να επαναληφθεί: ${error?.message||error}`)}finally{setBusy(false)}
  };
  const submit=async()=>{
    if(!ready)return;
    setBusy(true);let stage="DUPLICATE CHECK";
    try{
      setStatus("Έλεγχος duplicate τιμολογίου…");
      const duplicateCheck=await api("/api/commerce/ai-reader/fast-duplicate-check",{method:"POST",body:JSON.stringify({storeId:store.id,supplierId,documentNumber:documentNumber.trim(),documentDate,dataUrl:fileDataUrl})});
      const prepared=await backgroundV244({api,store,pages,supplierId,documentNumber:documentNumber.trim(),documentDate,totalGross:num(amount),mode,paymentTransactionId:duplicateCheck?.paymentTransactionId||null,resumeJobId:duplicateCheck?.resumeJobId||null,onProgress:setStatus});
      setReview({...prepared,paymentTransactionId:duplicateCheck?.paymentTransactionId||null});setStatus(`Έλεγχος ${prepared.productLines.length} γραμμών. Διόρθωσε ό,τι χρειάζεται πριν την καταχώριση.`);
    }catch(error){const detail=error?.message||"Η καταχώριση απέτυχε.";setStatus(`❌ ΑΠΟΤΥΧΙΑ ΣΤΟ: ${stage}. ${detail}`);setMessage?.(`❌ ΑΠΟΤΥΧΙΑ ΣΤΟ ${stage}: ${detail}`)}finally{setBusy(false)}
  };
  if(review){const lines=review.productLines||[],invoiceGross=num(amount),linesGross=Math.round((lines.reduce((sum,line)=>sum+Number(line.grossAmount||0),0)+Number.EPSILON)*100)/100,difference=Math.round((linesGross-invoiceGross+Number.EPSILON)*100)/100,balanced=Math.abs(difference)<=0.05;return <div className="pos-payment-form-v3-root" data-pos-invoice-full-review="true">
    <div style={{padding:"10px 12px",borderRadius:10,background:"#e9f8f1",fontWeight:900,color:"#0b6249",marginBottom:10}}>Πλήρης έλεγχος τιμολογίου — διόρθωσε τις γραμμές όπως στην κανονική καταχώριση. Η αποθήκη δεν ενημερώνεται τώρα.</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8,marginBottom:10}}><label>Προμηθευτής<input value={supplier?.name||""} readOnly/></label><label>Αρ. τιμολογίου<input value={documentNumber} readOnly/></label><label>Ημερομηνία<input value={documentDate} readOnly/></label></div>
    <div style={{padding:"10px 12px",borderRadius:9,background:balanced?"#dcfce7":"#fff4e5",fontWeight:900,marginBottom:10}}>Σύνολο τιμολογίου: {invoiceGross.toFixed(2)} € · Σύνολο γραμμών: {linesGross.toFixed(2)} € · Διαφορά: {difference.toFixed(2)} € {balanced?"✓":"— χρειάζεται διόρθωση"}</div>
    <div style={{overflow:"auto",maxHeight:430,border:"1px solid #cbdbe6",borderRadius:10}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:1180,fontSize:12}}><thead style={{position:"sticky",top:0,background:"#143f61",color:"#fff"}}><tr><th>#</th><th>Κωδ.</th><th>Περιγραφή</th><th>Ποσ.</th><th>Μον.</th><th>Τιμή</th><th>Καθ. αξία</th><th>ΦΠΑ</th><th>Σύνολο</th><th/></tr></thead><tbody>{lines.map((line,index)=><tr key={index}><td>{index+1}</td><td><input value={line.code||""} onChange={e=>updateReviewLine(index,"code",e.target.value)}/></td><td><input value={line.description||""} onChange={e=>updateReviewLine(index,"description",e.target.value)} style={{minWidth:230}}/></td><td><input inputMode="decimal" value={line.quantity||""} onChange={e=>updateReviewLine(index,"quantity",e.target.value)}/></td><td><input value={line.unit||"ΤΜΧ"} onChange={e=>updateReviewLine(index,"unit",e.target.value)}/></td><td><input inputMode="decimal" value={line.unitCost||""} onChange={e=>updateReviewLine(index,"unitCost",e.target.value)}/></td><td><input inputMode="decimal" value={line.netAmount||""} onChange={e=>updateReviewLine(index,"netAmount",e.target.value)}/></td><td><input inputMode="decimal" value={line.vatRate||0} onChange={e=>updateReviewLine(index,"vatRate",e.target.value)}/></td><td><input inputMode="decimal" value={line.grossAmount||""} onChange={e=>updateReviewLine(index,"grossAmount",e.target.value)}/></td><td><button type="button" onClick={()=>removeReviewLine(index)} disabled={busy}>×</button></td></tr>)}</tbody></table></div>
    <div style={{display:"flex",gap:8,marginTop:10}}><button type="button" onClick={addReviewLine} disabled={busy}>+ Προσθήκη γραμμής</button><button type="button" className="pos-primary-action" onClick={confirmReview} disabled={busy||!balanced}>{busy?"Καταχώριση…":mode==="PAID"?"ΕΠΙΒΕΒΑΙΩΣΗ & ΠΛΗΡΩΜΗ":"ΕΠΙΒΕΒΑΙΩΣΗ ΤΙΜΟΛΟΓΙΟΥ"}</button></div>
  </div>};
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
      <button type="button" onClick={saveNewSupplier} disabled={savingSupplier||busy||supplierCandidate.name.trim().length<2} style={{marginTop:8,fontWeight:900}}>{savingSupplier?"Καταχώριση…":"ΚΑΤΑΧΩΡΙΣΗ ΝΕΟΥ ΠΡΟΜΗΘΕΥΤΗ"}</button>
    </div>}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}><label>Συνολικό ποσό<input inputMode="decimal" value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/></label><label>Αριθμός τιμολογίου<input value={documentNumber} disabled={busy} onChange={e=>setDocumentNumber(e.target.value)}/></label><label>Ημερομηνία<input type="date" value={documentDate} disabled={busy} onChange={e=>setDocumentDate(e.target.value)}/></label></div>
    <div className="pos-payment-types"><button type="button" aria-pressed={mode==="PAID"} className={mode==="PAID"?"active":""} disabled={busy||reading||savingSupplier} onClick={()=>setMode("PAID")}>ΠΛΗΡΩΜΕΝΟ</button><button type="button" aria-pressed={mode==="CREDIT"} className={mode==="CREDIT"?"active":""} disabled={busy||reading||savingSupplier} onClick={()=>setMode("CREDIT")}>ΜΕ ΠΙΣΤΩΣΗ</button></div>
    {mode==="PAID"&&<div className="pos-expense-payment-sources"><b>Τρόπος πληρωμής προμηθευτή</b><div>{[["CASH_SHIFT","Μετρητά από ενεργή βάρδια"],["CORPORATE_CARD","Εταιρική κάρτα"],["BANK_TRANSFER","Τραπεζική μεταφορά"],["EMPLOYEE_REIMBURSEMENT","Πληρωμή υπαλλήλου προς επιστροφή"]].map(([value,label])=><button key={value} type="button" className={paymentMethod===value?"active":""} disabled={busy||reading||savingSupplier} onClick={()=>setPaymentMethod(value)}>{label}</button>)}</div><small>{paymentSource==="CASH_SHIFT"?"Το ποσό αφαιρείται από το ταμείο της ενεργής βάρδιας.":"Η πληρωμή καταχωρίζεται εξωτερικά και δεν αφαιρείται από τη βάρδια."}</small></div>}
    <button className="pos-primary-action" disabled={!ready} onClick={submit}><Wallet/> {reading?"FAST AI ανάγνωση…":savingSupplier?"Καταχώριση προμηθευτή…":busy?"Καταχώριση…":mode==="PAID"?"ΠΛΗΡΩΜΗ & ΕΠΙΣΤΡΟΦΗ ΣΤΟ POS":"ΚΑΤΑΧΩΡΙΣΗ ΜΕ ΠΙΣΤΩΣΗ"}</button>
  </div>;
}
