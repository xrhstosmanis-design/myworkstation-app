import React,{useState} from "react";
import {Send,X} from "lucide-react";

export default function CashEmailPreviewDialog({draft,selfEmail="",stale=false,busy=false,onCancel,onSend}){
  const [comment,setComment]=useState("");
  const owners=draft.mode==="owners";
  const recipientText=owners?(draft.recipients||[]).join(", "):(selfEmail||"το δικό σου email");
  const maySend=!stale&&!busy&&(!owners||draft.readyToSend===true);
  return <div className="platform-modal cash-email-preview-overlay">
    <section className="platform-security-dialog cash-email-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="cash-email-preview-title">
      <button type="button" className="modal-close" aria-label="Κλείσιμο προεπισκόπησης" onClick={onCancel} disabled={busy}><X/></button>
      <h2 id="cash-email-preview-title">Πλήρης προεπισκόπηση αναφοράς ταμείων</h2>
      <p>{draft.storeName} · {draft.date} · {owners?"Αποστολή προς έλεγχο":"Προσωπική δοκιμή"}</p>
      <p><strong>Παραλήπτες:</strong> {recipientText||"Δεν έχουν οριστεί παραλήπτες"}</p>
      <p className="cash-email-preview-description">Η αναφορά δημιουργήθηκε από το MyWorkStation. Το κείμενο παρακάτω εμφανίζεται ολόκληρο ({draft.text.length.toLocaleString("el-GR")} χαρακτήρες) και έχει δική του κύλιση.</p>
      <pre className="cash-email-preview-content" data-testid="cash-email-full-body" tabIndex={0} aria-label="Πλήρες κείμενο αναφοράς προς αποστολή">{draft.text}</pre>
      <p className="cash-email-preview-end">Τέλος πλήρους αναφοράς</p>
      <label className="cash-email-preview-comment">Προαιρετικό σχόλιο (η αναφορά δεν χρειάζεται συμπλήρωση)
        <textarea value={comment} maxLength={2000} rows={2} onChange={event=>setComment(event.target.value)} placeholder="Αφήστε κενό για αποκλειστικά αυτόματη αναφορά."/>
      </label>
      {stale&&<p role="alert">Τα φίλτρα άλλαξαν. Ακύρωσε και άνοιξε νέα προεπισκόπηση.</p>}
      {owners&&draft.readyToSend!==true&&<p role="alert">Η αναφορά παραμένει προς έλεγχο, αλλά δεν πληροί ακόμη τους κανόνες αποστολής. Δεν μπορεί να σταλεί.</p>}
      <div className="platform-form-actions cash-email-preview-actions">
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>Άκυρο</button>
        <button type="button" onClick={()=>onSend(comment)} disabled={!maySend}><Send/>{busy?"Αποστολή…":owners?"Αποστολή αναφοράς":"Αποστολή δοκιμής"}</button>
      </div>
    </section>
  </div>;
}
