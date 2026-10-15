import React,{useEffect,useRef,useState} from "react";
import {MessageCircle} from "lucide-react";
import "./chat-staff-invitation.css";

export default function ChatStaffInvitation({request,companyId,store,employee}){
  const [invite,setInvite]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[copied,setCopied]=useState(false);
  const generation=useRef(0),pending=useRef(false),dialog=useRef(null),trigger=useRef(null);
  useEffect(()=>{
    if(!invite)return;
    dialog.current?.querySelector("textarea")?.focus();
    return()=>trigger.current?.focus();
  },[invite]);
  function dialogKey(event){
    if(event.key==="Escape"){event.preventDefault();generation.current++;setInvite(null);setError("");return}
    if(event.key!=="Tab")return;
    const items=[...dialog.current.querySelectorAll("button:not([disabled]),a[href],textarea")];
    const first=items[0],last=items.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
  }
  useEffect(()=>{generation.current++;pending.current=false;setInvite(null);setBusy(false);setError("");return()=>{generation.current++;pending.current=false}},[companyId,store.id,employee.id,employee.active]);
  async function prepare(){
    if(pending.current)return;pending.current=true;
    const current=generation.current;setBusy(true);setError("");setCopied(false);
    try{
      const result=await request(`/api/platform/store-modules/companies/${encodeURIComponent(companyId)}/stores/${encodeURIComponent(store.id)}/workforce-v2/employees/${encodeURIComponent(employee.id)}/chat-invitation`);
      if(current!==generation.current)return;
      const expected=`/chat/${encodeURIComponent(store.id)}/`;
      if(result.chatPath!==expected||result.employee?.id!==employee.id||result.store?.id!==store.id)throw new Error("Η πρόσκληση δεν αντιστοιχεί στο επιλεγμένο κατάστημα και εργαζόμενο. Δοκίμασε ξανά.");
      const url=new URL(expected,window.location.origin).href;
      const message=`${result.employee.fullName}, πρόσκληση στο MyWorkStation Chat — ${result.store.name}.\n\n${url}\n\n1. Άνοιξε τον σύνδεσμο και πάτησε «Σύνδεση χειριστή με PIN».\n2. Επίλεξε «${result.operatorName}» και βάλε το προσωπικό σου PIN.\n3. Android: Chrome → Εγκατάσταση εφαρμογής. iPhone: Safari → Κοινοποίηση → Προσθήκη στην αρχική οθόνη.\n4. Άνοιξε το MW Chat από το εικονίδιο και ενεργοποίησε τις ειδοποιήσεις.\n\nΟ σύνδεσμος αφορά το Chat του καταστήματος. Το PIN δεν περιλαμβάνεται· μη στείλεις το PIN σου σε μήνυμα. Αν λήξει η σύνδεση, συνδέσου ξανά με το προσωπικό PIN.`;
      setInvite({url,message});
    }catch(e){if(current===generation.current)setError(e.message||"Δεν ετοιμάστηκε η πρόσκληση.")}
    finally{if(current===generation.current){pending.current=false;setBusy(false)}}
  }
  async function copy(){const current=generation.current;try{await navigator.clipboard.writeText(invite.message);if(current===generation.current)setCopied(true)}catch{if(current===generation.current)setError("Επίλεξε το κείμενο και αντέγραψέ το χειροκίνητα.")}}
  async function share(){const current=generation.current;try{await navigator.share({title:"Πρόσκληση στο MyWorkStation Chat",text:invite.message})}catch(e){if(current===generation.current&&e.name!=="AbortError")setError("Δεν ολοκληρώθηκε η κοινοποίηση. Μπορείς να αντιγράψεις την πρόσκληση.")}}
  const encoded=encodeURIComponent(invite?.message||"");
  const email=String(employee.email||"").trim();
  const recipient=/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email)?encodeURIComponent(email):"";
  return <>
    <button ref={trigger} type="button" className="secondary" disabled={busy||!employee.active} onClick={prepare}><MessageCircle/> {busy?"Προετοιμασία πρόσκλησης…":"Πρόσκληση στο Chat"}</button>
    {error&&!invite&&<p role="alert">{error}</p>}
    {invite&&<div className="platform-modal" role="dialog" aria-modal="true" aria-label="Πρόσκληση στο Chat" onKeyDown={dialogKey} style={{padding:16}}><section ref={dialog} className="platform-security-dialog" style={{width:"min(620px,100%)",boxSizing:"border-box",maxHeight:"90dvh",overflowY:"auto"}}>
      <h2>Πρόσκληση στο Chat</h2><p><b>{employee.fullName}</b> · {store.name}</p>
      <p>Έλεγξε την πρόσκληση και επίλεξε πώς θα τη στείλεις. Ο εργαζόμενος συνδέεται με το υπάρχον προσωπικό του PIN.</p>
      <label>Κείμενο πρόσκλησης<textarea readOnly rows={10} value={invite.message} onFocus={e=>e.currentTarget.select()} style={{width:"100%",boxSizing:"border-box"}}/></label>
      {error&&<p role="alert">{error}</p>}<p role="status">{copied?"Η πρόσκληση αντιγράφηκε. Επικόλλησέ την στο μήνυμα προς τον εργαζόμενο.":"Η πρόσκληση είναι έτοιμη. Δεν έχει σταλεί αυτόματα."}</p>
      <div className="chat-staff-invitation-actions" style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:16}}>
        <button type="button" onClick={copy}>{copied?"✓ Αντιγράφηκε":"Αντιγραφή πρόσκλησης"}</button>
        <a className="secondary" href={`https://wa.me/?text=${encoded}`} target="_blank" rel="noreferrer">WhatsApp</a>
        <a className="secondary" href={`viber://forward?text=${encoded}`}>Viber</a>
        <a className="secondary" href={`mailto:${recipient}?subject=${encodeURIComponent("Πρόσκληση στο MyWorkStation Chat")}&body=${encoded}`}>Email</a>
        {typeof navigator.share==="function"&&<button type="button" className="secondary" onClick={share}>Κοινοποίηση</button>}
        <button type="button" className="secondary" onClick={()=>{generation.current++;setInvite(null);setError("")}}>Κλείσιμο</button>
      </div>
    </section></div>}
  </>;
}
