import React,{useEffect,useRef,useState} from "react";
import {Send,X} from "lucide-react";

export default function CashEmailPreviewDialog({draft,selfEmail="",stale=false,busy=false,onCancel,onSend}){
  const [comment,setComment]=useState("");
  const dialogRef=useRef(null),actionsRef=useRef({onCancel,busy});
  actionsRef.current={onCancel,busy};
  useEffect(()=>{
    const dialog=dialogRef.current,previous=document.activeElement;
    dialog.focus();
    const keydown=event=>{
      if(event.key==="Escape"){
        event.preventDefault();event.stopPropagation();
        if(!actionsRef.current.busy)actionsRef.current.onCancel();
      }else if(event.key==="Tab"){
        const elements=[...dialog.querySelectorAll('button:not([disabled]),textarea:not([disabled]),[tabindex="0"]')],first=elements[0],last=elements.at(-1);
        if(!first){event.preventDefault();dialog.focus();return;}
        if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog)){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialog)){event.preventDefault();first.focus();}
      }
    };
    const containFocus=event=>{if(!dialog.contains(event.target))dialog.focus()};
    document.addEventListener("keydown",keydown);document.addEventListener("focusin",containFocus);
    return()=>{
      document.removeEventListener("keydown",keydown);document.removeEventListener("focusin",containFocus);
      if(previous?.isConnected)previous.focus();
    };
  },[]);
  const owners=draft.mode==="owners";
  const recipientText=owners?(draft.recipients||[]).join(", "):(selfEmail||"μόνο στο email του συνδεδεμένου λογαριασμού");
  const ownerHold=!owners?"":!draft.rows.length?"Δεν υπάρχουν κλεισμένες βάρδιες για αποστολή.":!draft.recipients.length?"Δεν έχουν οριστεί παραλήπτες ιδιοκτήτη ή υπευθύνου.":draft.readyToSend!==true?"Η αναφορά παραμένει προς έλεγχο, αλλά δεν πληροί ακόμη τους κανόνες αποστολής. Δεν μπορεί να σταλεί.":"";
  const maySend=!stale&&!busy&&!ownerHold;
  return <div className="platform-modal cash-email-preview-overlay">
    <section ref={dialogRef} className="platform-security-dialog cash-email-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="cash-email-preview-title" aria-describedby="cash-email-preview-recipients" aria-busy={busy} tabIndex={-1}>
      <button type="button" className="modal-close" aria-label="Κλείσιμο προεπισκόπησης" onClick={onCancel} disabled={busy}><X/></button>
      <h2 id="cash-email-preview-title">Πλήρης προεπισκόπηση αναφοράς ταμείων</h2>
      <p>{draft.storeName} · {draft.date} · {owners?"Αποστολή προς έλεγχο":"Προσωπική δοκιμή"}</p>
      <p id="cash-email-preview-recipients"><strong>Παραλήπτες:</strong> {recipientText||"Δεν έχουν οριστεί παραλήπτες"}</p>
      <p className="cash-email-preview-description">Η αναφορά δημιουργήθηκε από το MyWorkStation. Το κείμενο παρακάτω εμφανίζεται ολόκληρο ({draft.text.length.toLocaleString("el-GR")} χαρακτήρες) και έχει δική του κύλιση.</p>
      <pre className="cash-email-preview-content" data-testid="cash-email-full-body" tabIndex={0} aria-label="Πλήρες κείμενο αναφοράς προς αποστολή">{draft.text}</pre>
      <p className="cash-email-preview-end">Τέλος πλήρους αναφοράς</p>
      <label className="cash-email-preview-comment">Προαιρετικό σχόλιο (η αναφορά δεν χρειάζεται συμπλήρωση)
        <textarea value={comment} maxLength={2000} rows={2} onChange={event=>setComment(event.target.value)} placeholder="Αφήστε κενό για αποκλειστικά αυτόματη αναφορά." disabled={busy}/>
      </label>
      {stale&&<p role="alert">Τα φίλτρα άλλαξαν. Ακύρωσε και άνοιξε νέα προεπισκόπηση.</p>}
      {ownerHold&&<p role="alert">{ownerHold}</p>}
      <div className="platform-form-actions cash-email-preview-actions">
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>Άκυρο</button>
        <button type="button" onClick={()=>onSend(comment)} disabled={!maySend}><Send/>{busy?"Αποστολή…":owners?"Αποστολή αναφοράς":"Αποστολή δοκιμής"}</button>
      </div>
    </section>
  </div>;
}
