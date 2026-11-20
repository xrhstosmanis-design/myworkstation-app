import React,{useEffect,useRef,useState} from "react";
import {Camera,CheckCircle2,ClipboardCheck,Eye,RefreshCw} from "lucide-react";
import "./store-handover.css";

const when=value=>value?new Date(value).toLocaleString("el-GR",{...({day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}),timeZone:"Europe/Athens",hour12:false}):"—";

async function prepareImage(file){
  if(!file)return null;
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Επίλεξε εικόνα JPEG, PNG ή WEBP.");
  const source=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error("Δεν διαβάστηκε η εικόνα."));reader.readAsDataURL(file)});
  const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error("Η εικόνα δεν είναι έγκυρη."));img.src=source});
  const scale=Math.min(1,1600/Math.max(image.width,image.height));
  const canvas=document.createElement("canvas");canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
  return {dataUrl:canvas.toDataURL("image/jpeg",.78),filename:(file.name||"paradosi-vardias.jpg").replace(/\.[^.]+$/,".jpg")};
}

export default function StoreHandoverPanel({api,store,readOnly=false}){
  const [items,setItems]=useState([]);
  const [attachment,setAttachment]=useState(null);
  const [attachmentName,setAttachmentName]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  const listRequest=useRef(0),attachmentRequest=useRef(0),imageRequest=useRef(0),writing=useRef(false);
  const currentScope=useRef("");
  const scope=JSON.stringify([store?.id,readOnly]);
  currentScope.current=scope;
  const [loadedScope,setLoadedScope]=useState("");
  const visibleItems=loadedScope===scope?items:[];
  const load=async()=>{
    const current=++listRequest.current,own=scope;
    attachmentRequest.current++;
    setItems([]);setLoadedScope("");setLoading(true);setError("");
    if(!store?.id){setLoading(false);return;}
    try{
      const result=await api(`/api/commerce/handover?storeId=${encodeURIComponent(store.id)}`);
      if(current!==listRequest.current||own!==currentScope.current)return;
      if(!Array.isArray(result))throw Error("Μη έγκυρη απάντηση παραδόσεων βάρδιας.");
      setItems(result);setLoadedScope(own);
    }catch(err){if(current===listRequest.current&&own===currentScope.current)setError(err.message)}
    finally{if(current===listRequest.current&&own===currentScope.current)setLoading(false)}
  };
  useEffect(()=>{
    currentScope.current=scope;
    setAttachment(null);setAttachmentName("");setMessage("");setBusy(false);load();
    return()=>{currentScope.current="";listRequest.current++;attachmentRequest.current++;imageRequest.current++};
  },[store?.id,readOnly,api]);
  const create=async event=>{
    event.preventDefault();
    if(readOnly||writing.current||currentScope.current!==scope)return;
    const form=event.currentTarget,f=new FormData(form),own=scope;
    writing.current=true;setBusy(true);setError("");setMessage("");
    try{
      await api("/api/commerce/handover",{method:"POST",body:JSON.stringify({storeId:store.id,priority:f.get("priority"),message:f.get("message"),attachment})});
      if(own!==currentScope.current)return;
      form.reset();setAttachment(null);setAttachmentName("");setMessage("Η παράδοση στάλθηκε στην επόμενη βάρδια.");await load();
    }catch(err){if(own===currentScope.current)setError(err.message)}
    finally{writing.current=false;if(own===currentScope.current)setBusy(false)}
  };
  const acknowledge=async id=>{
    if(readOnly||writing.current||currentScope.current!==scope)return;
    const own=scope;
    writing.current=true;setBusy(true);setError("");setMessage("");
    try{
      await api(`/api/commerce/handover/${encodeURIComponent(id)}/ack`,{method:"POST",body:"{}"});
      if(own!==currentScope.current)return;
      setMessage("Η παραλαβή επιβεβαιώθηκε ονομαστικά.");await load();
    }catch(err){if(own===currentScope.current)setError(err.message)}
    finally{writing.current=false;if(own===currentScope.current)setBusy(false)}
  };
  const choose=async event=>{
    if(readOnly||currentScope.current!==scope)return;
    const current=++imageRequest.current,own=scope;
    setError("");
    try{
      const ready=await prepareImage(event.target.files?.[0]);
      if(current!==imageRequest.current||own!==currentScope.current)return;
      setAttachment(ready);setAttachmentName(ready?.filename||"");
    }catch(err){if(current===imageRequest.current&&own===currentScope.current){setAttachment(null);setAttachmentName("");setError(err.message)}}
  };
  const view=async item=>{
    const current=++attachmentRequest.current,own=scope;
    setError("");
    try{
      const result=await api(`/api/commerce/handover/${encodeURIComponent(item.id)}/attachment?storeId=${encodeURIComponent(store.id)}`);
      if(current!==attachmentRequest.current||own!==currentScope.current)return;
      if(!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(result?.dataUrl||""))throw Error("Μη έγκυρο συνημμένο παράδοσης.");
      const popup=window.open();
      if(popup){
        popup.document.title="Συνημμένο παράδοσης";
        const image=popup.document.createElement("img");
        image.src=result.dataUrl;image.alt=result.filename||"Συνημμένο παράδοσης";
        image.style.cssText="max-width:100%;height:auto;display:block;margin:auto";
        popup.document.body.replaceChildren(image);
      }
    }catch(err){if(current===attachmentRequest.current&&own===currentScope.current){setItems([]);setLoadedScope("");setError(err.message)}}
  };

  return <article className="cloud-panel store-handover">
    <div className="cloud-panel-head"><div><h3><ClipboardCheck/>Παράδοση Βάρδιας</h3><p>Εκκρεμότητες, συνημμένα και ονομαστική επιβεβαίωση από την επόμενη βάρδια.</p></div><button onClick={load} disabled={loading||busy}><RefreshCw/>Ανανέωση</button></div>
    {error&&<div role="alert" className="cloud-alert cloud-error">{error}</div>}{message&&<div className="cloud-alert cloud-success">{message}</div>}
    <div className={`handover-store-grid${readOnly?" handover-read-only":""}`}>
      <section><h4>Ανοιχτές και πρόσφατες παραδόσεις</h4>{loading?<div className="cloud-loading">Φόρτωση…</div>:visibleItems.length===0?<div className="cloud-empty">Δεν υπάρχουν παραδόσεις βάρδιας.</div>:<div className="handover-store-list">{visibleItems.map(item=><article className={`handover-store-item ${item.priority}`} key={item.id}><div className="handover-store-status"><b>{item.priority}</b><em>{item.status==="OPEN"?"ΑΝΟΙΧΤΗ":"ΠΑΡΑΛΗΦΘΗΚΕ"}</em></div><p>{item.message}</p><small>{when(item.createdAt)} · Από: {item.fromName||"Χρήστης"}</small>{item.acknowledgedByName&&<small><CheckCircle2/>Παρέλαβε: {item.acknowledgedByName} · {when(item.acknowledgedAt)}</small>}<div className="handover-store-actions">{item.hasAttachment&&<button onClick={()=>view(item)}><Eye/>Συνημμένο</button>}{!readOnly&&item.status==="OPEN"&&<button disabled={busy} className="primary" onClick={()=>acknowledge(item.id)}><CheckCircle2/>Επιβεβαίωση παραλαβής</button>}</div></article>)}</div>}</section>
      {!readOnly&&<form onSubmit={create}><h4>Νέα παράδοση</h4><label>Προτεραιότητα<select name="priority" defaultValue="NORMAL"><option value="LOW">Χαμηλή</option><option value="NORMAL">Κανονική</option><option value="HIGH">Υψηλή</option><option value="SOS">SOS</option></select></label><label>Μήνυμα<textarea name="message" rows="5" maxLength="1000" required placeholder="Τι πρέπει να γνωρίζει η επόμενη βάρδια;"/></label><label className="handover-photo"><span><Camera/>Προαιρετικό συνημμένο</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={choose}/><small>{attachmentName||"Κάμερα ή επιλογή εικόνας"}</small></label><button className="handover-submit" disabled={busy}>{busy?"Αποστολή…":"Παράδοση στην επόμενη βάρδια"}</button></form>}
    </div>
  </article>;
}
