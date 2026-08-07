import React,{useEffect,useState} from "react";
import {Eye,FilePlus2,Inbox,RefreshCw} from "lucide-react";
import "./invoice-inbox.css";

const labels={RECEIVED:"Παραλήφθηκε",IN_REVIEW:"Σε έλεγχο",PROCESSED:"Ολοκληρώθηκε"};
const when=value=>value?new Date(value).toLocaleString("el-GR"):"—";
const readFile=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({dataUrl:reader.result,filename:file.name});reader.onerror=()=>reject(new Error("Δεν διαβάστηκε το αρχείο."));reader.readAsDataURL(file)});

export default function InvoiceInboxPanel({api,stores=[]}){
  const [storeId,setStoreId]=useState(stores[0]?.id||"");
  const [suppliers,setSuppliers]=useState([]);
  const [items,setItems]=useState([]);
  const [file,setFile]=useState(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  useEffect(()=>{if(!storeId&&stores[0])setStoreId(stores[0].id)},[stores,storeId]);
  const load=async()=>{if(!storeId)return;setLoading(true);setError("");try{const [s,i]=await Promise.all([api("/api/commerce/suppliers"),api(`/api/commerce/documents/inbox?storeId=${encodeURIComponent(storeId)}`)]);setSuppliers(s);setItems(i)}catch(err){setError(err.message)}finally{setLoading(false)}};
  useEffect(()=>{load()},[storeId]);
  const choose=async event=>{setError("");const selected=event.target.files?.[0];if(!selected)return setFile(null);if(selected.size>3400000){event.target.value="";setFile(null);return setError("Το αρχείο πρέπει να είναι έως 3,4 MB.")}if(!["application/pdf","image/jpeg","image/png","image/webp"].includes(selected.type)){event.target.value="";setFile(null);return setError("Επίλεξε PDF, JPEG, PNG ή WEBP.")}try{setFile(await readFile(selected))}catch(err){setError(err.message)}};
  const create=async event=>{event.preventDefault();if(!file)return;setBusy(true);setError("");setMessage("");const f=new FormData(event.currentTarget);try{await api("/api/commerce/documents/inbox",{method:"POST",body:JSON.stringify({storeId,supplierId:f.get("supplierId")||null,responsibleName:f.get("responsibleName")||null,note:f.get("note")||null,file})});event.currentTarget.reset();setFile(null);setMessage("Το παραστατικό μπήκε στη θυρίδα.");await load()}catch(err){setError(err.message)}finally{setBusy(false)}};
  const update=async(item,status)=>{setError("");try{await api(`/api/commerce/documents/inbox/${item.id}`,{method:"PATCH",body:JSON.stringify({status,responsibleName:item.responsibleName||null})});setMessage(`Η κατάσταση άλλαξε σε «${labels[status]}».`);await load()}catch(err){setError(err.message)}};
  const view=async item=>{try{const result=await api(`/api/commerce/documents/inbox/${item.id}/file`);const popup=window.open();if(!popup)return;popup.document.write(result.mimeType==="application/pdf"?`<title>${result.filename}</title><iframe src="${result.dataUrl}" style="border:0;width:100vw;height:100vh"></iframe>`:`<title>${result.filename}</title><img src="${result.dataUrl}" style="max-width:100%;height:auto;display:block;margin:auto">`)}catch(err){setError(err.message)}};
  return <div className="invoice-inbox">
    <section className="invoice-inbox-head"><div><h2><Inbox/>Θυρίδα Τιμολογίων</h2><p>Παραστατικά ανά κατάστημα και προμηθευτή, με υπεύθυνο, κατάσταση και ιστορικό.</p></div><div><select value={storeId} onChange={e=>setStoreId(e.target.value)}>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><button onClick={load}><RefreshCw/>Ανανέωση</button></div></section>
    {error&&<div className="commerce-error">{error}</div>}{message&&<div className="commerce-success">{message}</div>}
    <div className="invoice-inbox-grid"><section className="commerce-box"><h3>Παραστατικά</h3>{loading?<div>Φόρτωση…</div>:items.length===0?<div className="invoice-empty">Η θυρίδα είναι κενή.</div>:<div className="invoice-list">{items.map(item=><article key={item.id}><div className="invoice-main"><b>{item.filename||"Παραστατικό"}</b><span>{item.supplierName||"Χωρίς αντιστοίχιση προμηθευτή"}</span><small>{when(item.receivedAt)} · Υπεύθυνος: {item.responsibleName||"Δεν ορίστηκε"}</small>{item.note&&<p>{item.note}</p>}</div><div className="invoice-actions"><em className={item.status}>{labels[item.status]||item.status}</em>{item.hasAttachment&&<button onClick={()=>view(item)}><Eye/>Προβολή</button>}{item.status==="RECEIVED"&&<button onClick={()=>update(item,"IN_REVIEW")}>Έναρξη ελέγχου</button>}{item.status!=="PROCESSED"&&<button className="done" onClick={()=>update(item,"PROCESSED")}>Ολοκλήρωση</button>}</div></article>)}</div>}</section><aside className="commerce-box"><h3>Νέο παραστατικό</h3><form className="commerce-form" onSubmit={create}><label>Προμηθευτής<select name="supplierId"><option value="">Χωρίς αντιστοίχιση</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Υπεύθυνος<input name="responsibleName" maxLength="180" placeholder="Όνομα υπευθύνου"/></label><label>Σημείωση<textarea name="note" rows="4" maxLength="1000" placeholder="Προαιρετική σημείωση"/></label><label>PDF ή φωτογραφία<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={choose} required/><small>{file?.filename||"Έως 3,4 MB"}</small></label><button disabled={busy||!file}><FilePlus2/>{busy?"Αποθήκευση…":"Εισαγωγή στη θυρίδα"}</button></form></aside></div>
  </div>;
}
