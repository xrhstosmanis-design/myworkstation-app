import React,{useEffect,useRef,useState} from "react";
import VoiceInputControls from "./VoiceInputControls.jsx";
import CashAssistantEvidence from "./CashAssistantEvidence.jsx";
import SalesAssistantEvidence from "./SalesAssistantEvidence.jsx";

export default function OwnerAssistantPanel({api,storeId="",storeName=""}){
  const [access,setAccess]=useState(null),[question,setQuestion]=useState(""),[answer,setAnswer]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[voiceActive,setVoiceActive]=useState(false),[channel,setChannel]=useState("text"),[generation,setGeneration]=useState(0);
  const sequence=useRef(0),pending=useRef(null),statusRequest=useRef(null);
  const invalidate=()=>{sequence.current++;pending.current?.abort();pending.current=null;setAnswer(null);setQuestion("");setBusy(false);setVoiceActive(false);setChannel("text");setGeneration(x=>x+1)};
  useEffect(()=>{
    let closed=false,checking=false,knownCompany=null,knownCapabilities=null,statusSequence=0;
    invalidate();setAccess(null);setError("");
    const check=async(force=false)=>{
      if((checking&&!force)||closed||!storeId)return;
      if(force)statusRequest.current?.abort();
      checking=true;const statusId=++statusSequence;
      const controller=new AbortController();statusRequest.current=controller;
      try{
        const next=await api(`/api/owner-assistant/stores/${encodeURIComponent(storeId)}/status`,{signal:controller.signal,cache:"no-store"});
        if(closed||controller.signal.aborted||statusId!==statusSequence)return;
        if(!next.available||next.scope?.storeId!==storeId)throw new Error("Η πρόσβαση δεν αντιστοιχεί στο επιλεγμένο κατάστημα.");
        if(knownCompany&&knownCompany!==next.scope.companyId)invalidate();
        const capabilities=JSON.stringify([...(next.supported||[])].sort());
        if(knownCapabilities!==null&&knownCapabilities!==capabilities)invalidate();
        knownCapabilities=capabilities;knownCompany=next.scope.companyId;setAccess(next);setError("");
      }catch(e){if(!closed&&!controller.signal.aborted&&statusId===statusSequence){invalidate();setAccess(null);setError(e.message||"Ο βοηθός δεν είναι διαθέσιμος για το κατάστημα.")}}
      finally{if(statusId===statusSequence)checking=false;if(statusRequest.current===controller)statusRequest.current=null}
    };
    // The existing license watcher broadcasts every five seconds even when
    // nothing changed. Recheck each time; clear only on an actual denial or
    // context change, never on an unchanged announcement.
    const modules=()=>check(true);
    check();const timer=window.setInterval(check,15000);
    window.addEventListener("myworkstation:modules-updated",modules);
    return()=>{closed=true;sequence.current++;pending.current?.abort();statusRequest.current?.abort();window.clearInterval(timer);window.removeEventListener("myworkstation:modules-updated",modules)};
  },[api,storeId]);
  const ask=async event=>{
    event.preventDefault();if(!access||!storeId||busy||voiceActive||question.trim().length<3)return;
    const id=++sequence.current,controller=new AbortController();pending.current?.abort();pending.current=controller;setBusy(true);setError("");setAnswer(null);
    try{
      const result=await api(`/api/owner-assistant/stores/${encodeURIComponent(storeId)}/ask`,{method:"POST",signal:controller.signal,body:JSON.stringify({question:question.trim(),inputChannel:channel})});
      if(id!==sequence.current||controller.signal.aborted)return;
      if(result.scope?.storeId!==storeId||result.scope?.companyId!==access.scope.companyId||(result.evidence||[]).some(r=>r.scope!=="OWNER_SELECTED_STORE"||r.storeId!==storeId||r.companyId!==access.scope.companyId))throw new Error("Η παλιά απάντηση απορρίφθηκε. Έλεγξε το επιλεγμένο κατάστημα.");
      setAnswer(result);
    }catch(e){if(id===sequence.current&&!controller.signal.aborted){setError(e.message||"Δεν παραλήφθηκε απάντηση.");setAnswer(null)}}
    finally{if(id===sequence.current){setBusy(false);pending.current=null}}
  };
  return <section className="mws-owner-assistant" aria-label="AI Βοηθός Ιδιοκτήτη">
    <h2>Βοηθός Ιδιοκτήτη</h2>
    <p>{storeId?`Μόνο για ${storeName||access?.scope?.storeName||"το επιλεγμένο κατάστημα"}.`:"Επίλεξε κατάστημα από τη λίστα για να ανοίξεις τον βοηθό."} Οι ερωτήσεις απαιτούν ενεργό module και τα δικαιώματά σου.</p>
    <p>Μπορείς να ρωτάς για μετρητά κλεισμένων βαρδιών ή πωλήσεις συγκεκριμένου είδους και ημερομηνίας. Απαιτείται η αντίστοιχη ενεργή αναφορά. Οι υπόλοιπες αναφορές προστίθενται σταδιακά.</p>
    {access?.scope.supportPreview&&<p role="status">Προβολή υποστήριξης Super Admin για αυτό το κατάστημα.</p>}
    {error&&<p role="alert">{error}</p>}
    <form onSubmit={ask}>
      <label>Ερώτηση για το κατάστημά μου<textarea aria-label="Ερώτηση για το κατάστημά μου" maxLength={600} value={question} disabled={!access||busy||voiceActive} onChange={e=>{setQuestion(e.target.value);setChannel("text")}} placeholder="π.χ. Πόσο TEST1 πουλήθηκε στις 10/10/2026;"/></label>
      <VoiceInputControls key={`${storeId}:${generation}`} value={question} onChange={text=>{setQuestion(text);setChannel("voice")}} onActiveChange={setVoiceActive} disabled={!access||busy} contextKey={`${access?.scope?.companyId||""}:${storeId}:${generation}`}/>
      <button type="submit" disabled={!access||busy||voiceActive||question.trim().length<3}>{busy?"Αναζήτηση…":"Ρώτα"}</button>
    </form>
    {answer&&<article aria-label="Απάντηση βοηθού ιδιοκτήτη"><h3>Απάντηση</h3><p style={{whiteSpace:"pre-wrap"}}>{answer.answer}</p>{answer.highlights?.length>0&&<ul>{answer.highlights.map((text,i)=><li key={i}>{text}</li>)}</ul>}{answer.limitations&&<p>{answer.limitations}</p>}<CashAssistantEvidence evidence={(answer.evidence||[]).filter(report=>report.kind!=="product_sales")}/><SalesAssistantEvidence evidence={answer.evidence}/></article>}
    <small>Μόνο ανάγνωση. Για διόρθωση ή αναλυτική διερεύνηση άνοιξε την αντίστοιχη κανονική αναφορά.</small>
    <style>{`.mws-owner-assistant{padding:20px;border:1px solid #cbd8e5;border-radius:16px;background:#fff}.mws-owner-assistant textarea{display:block;width:100%;min-height:100px;margin:8px 0;box-sizing:border-box}.mws-owner-assistant button{min-height:44px}.mws-owner-assistant [role=alert]{color:#b42318}.mws-owner-assistant article{margin-top:20px}`}</style>
  </section>;
}
