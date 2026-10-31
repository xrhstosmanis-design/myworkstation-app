import React,{useEffect,useRef,useState} from "react";
const validId=value=>typeof value==="string"&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value);
function usePrivateTool(getToken,onClose){
 const mounted=useRef(true),session=useRef(getToken()),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{mounted.current=true;const hide=()=>{if(document.hidden)close.current()};document.addEventListener("visibilitychange",hide);return()=>{mounted.current=false;document.removeEventListener("visibilitychange",hide)}},[]);
 return ()=>mounted.current&&!document.hidden&&session.current===getToken();
}
function useToolDialog(){
 const ref=useRef(null);
 useEffect(()=>{const root=ref.current;if(!root)return;const previous=document.activeElement,siblings=[...root.parentElement.children].filter(n=>n!==root).map(n=>[n,n.inert]);for(const [node] of siblings)node.inert=true;
  (root.querySelector("input")||root.querySelector("select")||root.querySelector("button"))?.focus({preventScroll:true});
  return()=>{for(const [node,value] of siblings)node.inert=value;if(previous?.isConnected&&!document.hidden)previous.focus({preventScroll:true})};
 },[]);return ref;
}
function checked(data,store){if(data?.store?.id!==store.id||data.store.companyId!==store.companyId)throw Error("Δεν επιβεβαιώθηκε η συνομιλία.");return data}
const preview=row=>(row.body||row.attachmentName||"Μήνυμα").slice(0,280);
export function ChatHistorySearch({api,store,getToken,onClose,onReply,onForward,canForward,initialQuery=""}){
 const [q,setQ]=useState(initialQuery),[rows,setRows]=useState(null),[cursor,setCursor]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const dialog=useToolDialog();
 const active=usePrivateTool(getToken,onClose),sequence=useRef(0);
 const search=async(before=null)=>{const query=q.trim().normalize("NFC");if(!active()||[...query].length<2||[...query].length>120)return;
  const generation=++sequence.current;setBusy(true);setError("");try{
   const data=checked(await api("/api/store-chat/stores/"+encodeURIComponent(store.id)+"/messages/search?q="+encodeURIComponent(query)+(before?"&before="+encodeURIComponent(before):"")),store);
   if(!active()||sequence.current!==generation)return;
   if(data.q!==query||!Array.isArray(data.rows)||data.rows.length>20||data.rows.some(r=>!validId(r.id)||typeof r.body!=="string"||r.body.length>5000)||(data.nextCursor!==null&&data.nextCursor!==data.rows.at(-1)?.id))throw Error("Δεν επιβεβαιώθηκαν τα αποτελέσματα.");
   setRows(data.rows);setCursor(data.nextCursor);
  }catch(e){if(active()&&sequence.current===generation)setError(e.message)}finally{if(active()&&sequence.current===generation)setBusy(false)}
 };
 return <div ref={dialog} className="store-chat-tools-layer" role="dialog" aria-modal="true" aria-label="Αναζήτηση ιστορικού">
  <header><h3>Αναζήτηση ιστορικού · {store.name}</h3><button type="button" onClick={onClose}>Κλείσιμο αναζήτησης</button></header>
  <form onSubmit={e=>{e.preventDefault();search()}}><input aria-label="Κείμενο αναζήτησης ιστορικού" value={q} maxLength={120} onChange={e=>{sequence.current++;setQ(e.target.value);setRows(null);setCursor(null);setBusy(false)}} placeholder="Λέξεις μηνύματος ή όνομα αρχείου"/><button disabled={busy||[...q.trim()].length<2}>Αναζήτηση ιστορικού</button></form>
  {error&&<p role="alert">{error}</p>}<div className="store-chat-tools-results" aria-live="polite">
   {busy&&<p>Αναζήτηση…</p>}{rows?.length===0&&<p>Δεν βρέθηκαν μηνύματα.</p>}
   {rows?.map(row=><article key={row.id}><b>{row.senderName||"Χρήστης"}</b><small>{new Date(row.createdAt).toLocaleString("el-GR",{timeZone:"Europe/Athens"})}</small>{row.forwarded&&<small>Προωθημένο μήνυμα</small>}<p>{row.body}</p>{row.hasAttachment&&<small>Συνημμένο: {row.attachmentName}</small>}<div><button type="button" onClick={()=>{if(active()){onReply(row);onClose()}}}>Απάντηση</button>{canForward&&<button type="button" onClick={()=>{if(active())onForward(row)}}>Προώθηση</button>}</div></article>)}
  </div>{cursor&&<button type="button" disabled={busy} onClick={()=>search(cursor)}>Επόμενα αποτελέσματα</button>}
 </div>;
}
export function ChatForwardDialog({api,store,row,getToken,onClose,onSent,onUncertain}){
 const [targets,setTargets]=useState([]),[selected,setSelected]=useState(""),[review,setReview]=useState(false),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[error,setError]=useState("");
 const dialog=useToolDialog();
 const active=usePrivateTool(getToken,onClose),sending=useRef(false),key=useRef(window.crypto.randomUUID());
 useEffect(()=>{(async()=>{try{
  const data=checked(await api("/api/store-chat/stores/"+encodeURIComponent(store.id)+"/forward-targets"),store);if(!active())return;
  if(!Array.isArray(data.stores)||data.stores.some(s=>!validId(s.id)||s.id===store.id||typeof s.companyId!=="string"))throw Error("Δεν επιβεβαιώθηκαν οι προορισμοί.");
  setTargets(data.stores);
 }catch(e){if(active())setError(e.message)}})()},[]);
 const target=targets.find(s=>s.id===selected);
 const close=()=>{if(unknown&&!window.confirm("Η προώθηση δεν επιβεβαιώθηκε. Έλεγξε τη συνομιλία προορισμού πριν κάνεις νέα προώθηση. Κλείσιμο;"))return;onClose()};
 const send=async()=>{if(!active()||sending.current||!review||!target)return;sending.current=true;setBusy(true);setUnknown(true);onUncertain?.(true);setError("");
  try{const result=await api("/api/store-chat/stores/"+encodeURIComponent(store.id)+"/messages/"+encodeURIComponent(row.id)+"/forward",{method:"POST",body:JSON.stringify({targetStoreId:target.id,targetCompanyId:target.companyId,requestId:key.current})});
   if(!active())return;if(!result?.ok||!validId(result.id)||result.targetStoreId!==target.id)throw Error("Δεν επιβεβαιώθηκε η προώθηση.");
   setUnknown(false);onUncertain?.(false);onSent(target);onClose();
  }catch(e){if(active())setError(e.message+" Μπορείς να επαναλάβεις την επιβεβαίωση για τον ίδιο προορισμό.")}finally{sending.current=false;if(active())setBusy(false)}
 };
 return <div ref={dialog} className="store-chat-tools-layer" role="dialog" aria-modal="true" aria-label="Προώθηση μηνύματος">
  <header><h3>Προώθηση μηνύματος</h3><button type="button" disabled={busy} onClick={close}>Κλείσιμο προώθησης</button></header>
  <blockquote>{preview(row)}</blockquote>{row.hasAttachment&&<p>Θα συμπεριληφθεί το συνημμένο: {row.attachmentName}</p>}
  {!review?<><label>Συνομιλία προορισμού<select aria-label="Συνομιλία προορισμού" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Επίλεξε προορισμό</option>{targets.map(s=><option key={s.id} value={s.id}>{s.companyName? s.companyName+" · ":""}{s.name}</option>)}</select></label>{!targets.length&&!error&&<p>Δεν υπάρχουν άλλες διαθέσιμες εξουσιοδοτημένες συνομιλίες.</p>}<button type="button" disabled={!target} onClick={()=>{if(active())setReview(true)}}>Έλεγχος προώθησης</button></>:<><p>Προορισμός: <strong>{target?.companyName} · {target?.name}</strong></p><p>Θα σταλεί νέο μήνυμα με ένδειξη «Προωθημένο».</p><button type="button" disabled={busy} onClick={send}>{busy?"Προώθηση…":unknown?"Επανάληψη επιβεβαίωσης":"Επιβεβαίωση προώθησης"}</button>{!unknown&&<button type="button" onClick={()=>setReview(false)}>Αλλαγή προορισμού</button>}</>}
  {error&&<p role="alert">{error}</p>}
 </div>;
}
