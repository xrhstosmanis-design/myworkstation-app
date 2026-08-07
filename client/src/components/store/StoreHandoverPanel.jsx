import React,{useEffect,useState} from "react";
import {Camera,CheckCircle2,ClipboardCheck,Eye,RefreshCw} from "lucide-react";
import "./store-handover.css";

const when=value=>value?new Date(value).toLocaleString("el-GR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"—";

async function prepareImage(file){
  if(!file)return null;
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Επίλεξε εικόνα JPEG, PNG ή WEBP.");
  const source=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error("Δεν διαβάστηκε η εικόνα."));reader.readAsDataURL(file)});
  const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error("Η εικόνα δεν είναι έγκυρη."));img.src=source});
  const scale=Math.min(1,1600/Math.max(image.width,image.height));
  const canvas=document.createElement("canvas");canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
  return {dataUrl:canvas.toDataURL("image/jpeg",.78),filename:(file.name||"paradosi-vardias.jpg").replace(/\.[^.]+$/,".jpg")};
}

export default function StoreHandoverPanel({api,store}){
  const [items,setItems]=useState([]);
  const [attachment,setAttachment]=useState(null);
  const [attachmentName,setAttachmentName]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  const load=async()=>{setLoading(true);setError("");try{setItems(await api(`/api/commerce/handover?storeId=${encodeURIComponent(store.id)}`))}catch(err){setError(err.message)}finally{setLoading(false)}};
  useEffect(()=>{load()},[store.id]);
  const create=async event=>{event.preventDefault();setBusy(true);setError("");setMessage("");const f=new FormData(event.currentTarget);try{await api("/api/commerce/handover",{method:"POST",body:JSON.stringify({storeId:store.id,priority:f.get("priority"),message:f.get("message"),attachment})});event.currentTarget.reset();setAttachment(null);setAttachmentName("");setMessage("Η παράδοση στάλθηκε στην επόμενη βάρδια.");await load()}catch(err){setError(err.message)}finally{setBusy(false)}};
  const acknowledge=async id=>{setError("");try{await api(`/api/commerce/handover/${id}/ack`,{method:"POST",body:"{}"});setMessage("Η παραλαβή επιβεβαιώθηκε ονομαστικά.");await load()}catch(err){setError(err.message)}};
  const choose=async event=>{setError("");try{const ready=await prepareImage(event.target.files?.[0]);setAttachment(ready);setAttachmentName(ready?.filename||"")}catch(err){setAttachment(null);setAttachmentName("");setError(err.message)}};
  const view=async item=>{try{const result=await api(`/api/commerce/handover/${item.id}/attachment`);const popup=window.open();if(popup)popup.document.write(`<title>Συνημμένο παράδοσης</title><img src="${result.dataUrl}" style="max-width:100%;height:auto;display:block;margin:auto">`)}catch(err){setError(err.message)}};

  return <article className="cloud-panel store-handover">
    <div className="cloud-panel-head"><div><h3><ClipboardCheck/>Παράδοση Βάρδιας</h3><p>Εκκρεμότητες, συνημμένα και ονομαστική επιβεβαίωση από την επόμενη βάρδια.</p></div><button onClick={load} disabled={loading||busy}><RefreshCw/>Ανανέωση</button></div>
    {error&&<div className="cloud-alert cloud-error">{error}</div>}{message&&<div className="cloud-alert cloud-success">{message}</div>}
    <div className="handover-store-grid">
      <section><h4>Ανοιχτές και πρόσφατες παραδόσεις</h4>{loading?<div className="cloud-loading">Φόρτωση…</div>:items.length===0?<div className="cloud-empty">Δεν υπάρχουν παραδόσεις βάρδιας.</div>:<div className="handover-store-list">{items.map(item=><article className={`handover-store-item ${item.priority}`} key={item.id}><div className="handover-store-status"><b>{item.priority}</b><em>{item.status==="OPEN"?"ΑΝΟΙΧΤΗ":"ΠΑΡΑΛΗΦΘΗΚΕ"}</em></div><p>{item.message}</p><small>{when(item.createdAt)} · Από: {item.fromName||"Χρήστης"}</small>{item.acknowledgedByName&&<small><CheckCircle2/>Παρέλαβε: {item.acknowledgedByName} · {when(item.acknowledgedAt)}</small>}<div className="handover-store-actions">{item.hasAttachment&&<button onClick={()=>view(item)}><Eye/>Συνημμένο</button>}{item.status==="OPEN"&&<button className="primary" onClick={()=>acknowledge(item.id)}><CheckCircle2/>Επιβεβαίωση παραλαβής</button>}</div></article>)}</div>}</section>
      <form onSubmit={create}><h4>Νέα παράδοση</h4><label>Προτεραιότητα<select name="priority" defaultValue="NORMAL"><option value="LOW">Χαμηλή</option><option value="NORMAL">Κανονική</option><option value="HIGH">Υψηλή</option><option value="SOS">SOS</option></select></label><label>Μήνυμα<textarea name="message" rows="5" maxLength="1000" required placeholder="Τι πρέπει να γνωρίζει η επόμενη βάρδια;"/></label><label className="handover-photo"><span><Camera/>Προαιρετικό συνημμένο</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={choose}/><small>{attachmentName||"Κάμερα ή επιλογή εικόνας"}</small></label><button className="handover-submit" disabled={busy}>{busy?"Αποστολή…":"Παράδοση στην επόμενη βάρδια"}</button></form>
    </div>
  </article>;
}
