import React,{useEffect,useRef,useState} from "react";
const money=value=>Number(value||0).toLocaleString("el-GR",{minimumFractionDigits:2,maximumFractionDigits:2})+" €";
const date=value=>value?new Date(value).toLocaleDateString("el-GR",{timeZone:"Europe/Athens"}):"—";

export default function InvoiceCommonDraftReview({api,storeId,item,onClose,onComplete}){
 const apiRef=useRef(api);apiRef.current=api;const alive=useRef(true);
 const [preview,setPreview]=useState(null),[selected,setSelected]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const [confirmed,setConfirmed]=useState(false),[paymentConfirmed,setPaymentConfirmed]=useState(false),[reason,setReason]=useState("");
 useEffect(()=>{let active=true;alive.current=true;apiRef.current(`/api/commerce/documents/inbox/${encodeURIComponent(item.id)}/reconcile-pos?${new URLSearchParams({storeId})}`).then(data=>{if(active){setPreview(data);const candidates=data.orders.filter(o=>!o.isMyData);if(candidates.length===1)setSelected(candidates[0].orderId)}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false;alive.current=false}},[storeId,item.id]);
 const candidate=preview?.orders.find(o=>o.orderId===selected);
 const payment=candidate?.paymentAmount??preview?.orders.find(o=>o.paymentAmount!=null)?.paymentAmount;
 const difference=payment==null?0:Math.round((Number(payment)-Number(preview.totalGross))*100)/100;
 const showFile=async file=>{
  const popup=window.open("","_blank");if(!popup){setError("Επίτρεψε άνοιγμα πρωτοτύπου σε νέα καρτέλα.");return}popup.document.body.textContent="Φόρτωση πρωτοτύπου…";
  try{const data=await apiRef.current(`/api/commerce/documents/inbox/${encodeURIComponent(item.id)}/reconcile-pos/file/${encodeURIComponent(file.id)}?${new URLSearchParams({storeId})}`);
   if(!alive.current){popup.close();return}
   if(!/^data:(?:application\/pdf|image\/(?:jpeg|png|webp));base64,/.test(data.dataUrl||""))throw Error("Το αρχείο δεν είναι πρωτότυπη εικόνα ή PDF.");
   popup.document.title=data.filename||"Πρωτότυπο";const node=popup.document.createElement(data.mimeType==="application/pdf"?"iframe":"img");node.src=data.dataUrl;node.style.cssText=data.mimeType==="application/pdf"?"width:100vw;height:100vh;border:0":"max-width:100%;height:auto";popup.document.body.replaceChildren(node);
  }catch(e){popup.close();setError(e.message)}
 };
 const merge=async()=>{if(busy)return;setBusy(true);setError("");try{
  const result=await apiRef.current(`/api/commerce/documents/inbox/${encodeURIComponent(item.id)}/reconcile-pos`,{method:"POST",body:JSON.stringify({storeId,posOrderId:selected,expectedVersion:preview.version,confirmSameInvoice:confirmed,confirmMark:preview.mark,confirmPaymentDiscrepancy:paymentConfirmed,reason})});if(alive.current)onComplete(result);
 }catch(e){setError(e.message)}finally{setBusy(false)}};
 return <div className="invoice-common-overlay"><section role="dialog" aria-modal="true" aria-label="Αντιστοίχιση POS και myDATA" className="invoice-common-review">
  <header><div><h2>Ένα κοινό πρόχειρο POS ↔ myDATA</h2><p>Έλεγχος πρωτοτύπων και διατήρηση φωτογραφιών, PDF και υπάρχουσας πληρωμής.</p></div><button onClick={onClose} disabled={busy} aria-label="Κλείσιμο αντιστοίχισης">×</button></header>
  <main>{error&&<div role="alert" className="commerce-error">{error}</div>}{!preview&&!error?<p>Φόρτωση αντιστοίχισης…</p>:preview&&<>
   <div className="invoice-common-original"><b>myDATA: {preview.documentNumber}</b><span>{preview.issuerVat} · {date(preview.issueDate)} · {money(preview.totalGross)}</span><strong>MARK {preview.mark}</strong></div>
   <div className="invoice-common-files">{preview.files.map(file=><button key={`${file.id}:${file.purchaseDocumentId}`} type="button" onClick={()=>showFile(file)}>{file.mimeType==="application/pdf"?"PDF myDATA":"Φωτογραφία POS"} · {file.filename}</button>)}</div>
   {preview.commonDraft?.completed?<p role="status">Υπάρχει ήδη ένα κοινό πρόχειρο. Οι παλιές εγγραφές διατηρούνται ως ιστορικές αναφορές.</p>:<>
    <label>Πρόχειρο POS για αντιστοίχιση<select value={selected} onChange={e=>{setSelected(e.target.value);setConfirmed(false);setPaymentConfirmed(false)}} disabled={busy}><option value="">Επιλογή υπάρχοντος προχείρου</option>{preview.orders.filter(o=>!o.isMyData).map(o=><option key={o.orderId} value={o.orderId}>{o.invoiceNumber} · {date(o.documentDate)} · {money(o.totalGross)} · {o.lineCount} γραμμές</option>)}</select></label>
    {!preview.orders.some(o=>!o.isMyData)&&<p>Δεν βρέθηκε άλλο πρόχειρο POS για αντιστοίχιση με αυτά τα στοιχεία.</p>}
    {candidate&&<div className="invoice-common-comparison">{candidate.supplierReviewRequired&&<p role="alert"><b>Πιθανό διπλό με διαφορετικό ή κενό ΑΦΜ.</b> POS: {candidate.supplierName||"Χωρίς προμηθευτή"} · ΑΦΜ {candidate.taxId||"λείπει"}. myDATA: ΑΦΜ {preview.issuerVat}. Πρέπει να ελεγχθεί και να διορθωθεί ο προμηθευτής στο ίδιο πρόχειρο πριν από ενοποίηση ή καταχώρηση. Η υπάρχουσα πληρωμή διατηρείται· μην πληρώσεις ή ανεβάσεις ξανά το τιμολόγιο.</p>}<p><b>POS:</b> {candidate.invoiceNumber} · {date(candidate.documentDate)} · {money(candidate.totalGross)} · {candidate.lineCount} γραμμές</p><p><b>myDATA:</b> {preview.documentNumber} · {date(preview.issueDate)} · {money(preview.totalGross)}</p>{!candidate.exact&&<p>Υπάρχουν διαφορετικά αποθηκευμένα στοιχεία. Επιβεβαίωσε από τα δύο πρωτότυπα ότι πρόκειται για το ίδιο τιμολόγιο.</p>}{preview.orders.filter(o=>o.lineCount>0).length>1&&<p>Και τα δύο πρόχειρα έχουν γραμμές. Χρειάζεται έλεγχος πινάκων πριν από ενοποίηση.</p>}</div>}
    {payment!=null&&<p><b>Υπάρχουσα πληρωμή:</b> {money(payment)}. Παραμένει στην αρχική βάρδια και στον αρχικό χειριστή.</p>}
    {Math.abs(difference)>.05&&<div className="invoice-common-payment"><strong>Διαφορά πληρωμής: {money(difference)}</strong><label><input type="checkbox" checked={paymentConfirmed} onChange={e=>setPaymentConfirmed(e.target.checked)}/> Επιβεβαιώνω ότι η υπάρχουσα πληρωμή διατηρείται αμετάβλητη και η διαφορά παραμένει για χωριστό έλεγχο.</label></div>}
    <label className="invoice-common-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Έλεγξα φωτογραφία POS και PDF: ίδιος προμηθευτής, ίδιο τιμολόγιο και MARK {preview.mark}.</label>
    <label>Αιτιολογία ενοποίησης<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} placeholder="π.χ. Τα δύο πρωτότυπα δείχνουν το ίδιο τιμολόγιο."/></label>
   </>}
  </>}</main><footer><button onClick={onClose} disabled={busy}>Επιστροφή</button>{preview?.commonDraft?.completed?<button onClick={()=>onComplete({orderId:preview.commonDraft.orderId,reused:true})}>Άνοιγμα κοινής αγοράς</button>:<button className="primary" onClick={merge} disabled={busy||candidate?.supplierReviewRequired||!selected||!confirmed||reason.trim().length<5||!preview?.originalAvailable||(Math.abs(difference)>.05&&!paymentConfirmed)||preview?.orders.filter(o=>o.lineCount>0).length>1}>{busy?"Ενοποίηση…":"Ενοποίηση σε ένα πρόχειρο"}</button>}</footer>
 </section></div>;
}

