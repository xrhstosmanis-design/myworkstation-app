import React,{useEffect,useId,useRef,useState} from "react";
import "./automatic-report-settings.css";

const money=v=>Number(v).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const modeNames={FULL:"Πλήρης έλεγχος",DIFFERENCE_ONLY:"Μόνο διαφορά",POS_EFTPOS_ONLY:"Μόνο POS / EFTPOS"};
const holdNames={TERMINALS_NOT_CONFIGURED:"Δεν έχουν δηλωθεί ταμεία.",THIRD_SHIFT_NOT_CONFIGURED:"Δεν έχει δηλωθεί τρίτη βάρδια.",BUSINESS_DAY_NOT_FINISHED:"Δεν έχει ολοκληρωθεί η επιχειρησιακή ημέρα.",SOURCE_SCOPE_OR_ID_INVALID:"Υπάρχει ασαφής, επικαλυπτόμενη ή προηγούμενη ανολοκλήρωτη βάρδια.",UNCONFIGURED_TERMINAL:"Βρέθηκε ταμείο που δεν περιλαμβάνεται στη ρύθμιση.",SHIFT_NOT_CLOSED:"Η βάρδια δεν έχει έγκυρο κλείσιμο.",SHIFT_VARIANCE_UNKNOWN:"Δεν έχει καταγραφεί έγκυρη διαφορά βάρδιας.",MISSING_SHIFTS:"Λείπουν αναμενόμενες βάρδιες.",SHIFT_SLOT_MISSING:"Λείπει αναμενόμενη πρωινή ή απογευματινή βάρδια.",THIRD_SHIFT_MISSING:"Λείπει η τρίτη βάρδια.",THIRD_SHIFT_OPEN:"Η τρίτη βάρδια παραμένει ανοιχτή.",SOURCE_LIMIT_EXCEEDED:"Τα δεδομένα υπερβαίνουν το όριο ανάγνωσης· δεν εμφανίζονται μερικά σύνολα.",CASH_RULE_NOT_CONFIGURED:"Δεν έχει επιβεβαιωθεί ο κανόνας ταμείου.",CASH_MODE_UNSUPPORTED:"Η αναφορά διαφοράς μετρητών δεν υποστηρίζεται στη λειτουργία μόνο POS / EFTPOS.",DELIVERY_PATTERN_NOT_CONFIGURED:"Δεν έχει προσδιοριστεί η αλυσίδα delivery.",CASH_RULE_CHANGED:"Ο κανόνας ταμείου άλλαξε. Ανανέωσε και επιβεβαίωσε ξανά τις ρυθμίσεις.",REPORT_SETTINGS_CHANGED:"Οι ρυθμίσεις άλλαξαν. Πάτησε Ανανέωση."};

export default function AutomaticReportSettingsManager({company,store,request,onClose}){
  const id=useId(),sequence=useRef(0);
  const [data,setData]=useState(null),[draft,setDraft]=useState(null),[day,setDay]=useState("");
  const [busy,setBusy]=useState("load"),[error,setError]=useState(""),[message,setMessage]=useState(""),[confirmed,setConfirmed]=useState(false),[dirty,setDirty]=useState(false),[report,setReport]=useState(null);
  const path=`/api/platform/companies/${encodeURIComponent(company.id)}/stores/${encodeURIComponent(store.id)}/report-settings`;
  const load=async()=>{
    const token=++sequence.current;setBusy("load");setError("");setMessage("");setReport(null);setData(null);setDraft(null);setConfirmed(false);setDirty(false);
    try{
      const result=await request(path);
      if(token!==sequence.current)return;
      setData(result);setDraft(result.settings?.configuration||{dayStartHour:7,secondShiftStartHour:15,thirdShiftStartHour:23,terminals:[],cashRule:result.cashRule});setDay(result.suggestedDay);
    }catch(e){if(token===sequence.current)setError(e.message)}finally{if(token===sequence.current)setBusy("")}
  };
  useEffect(()=>{load();return()=>{sequence.current++}},[path,request]);
  const change=next=>{setDraft(next);setDirty(true);setReport(null);setMessage("")};
  const save=async event=>{
    event.preventDefault();if(!confirmed||!data||!draft||busy)return;
    const token=++sequence.current;setBusy("save");setError("");setMessage("");setReport(null);
    try{
      const result=await request(path,{method:"PUT",body:JSON.stringify({expectedVersion:data.settings?.version||0,configuration:{...draft,cashRule:data.cashRule}})});
      if(token!==sequence.current)return;
      setData({...data,settings:result.settings});setDraft(result.settings.configuration);setDirty(false);setConfirmed(false);setMessage("Οι ρυθμίσεις αποθηκεύτηκαν. Δεν στάλθηκε email.");
    }catch(e){if(token===sequence.current)setError(e.message)}finally{if(token===sequence.current)setBusy("")}
  };
  const preview=async()=>{
    if(busy||dirty||!data?.settings||!day)return;
    const token=++sequence.current;setBusy("preview");setError("");setReport(null);
    try{const result=await request(path+"/preview",{method:"POST",body:JSON.stringify({day,expectedVersion:data.settings.version})});if(token===sequence.current)setReport(result)}
    catch(e){if(token===sequence.current)setError(e.message)}finally{if(token===sequence.current)setBusy("")}
  };
  return <div className="platform-modal"><section role="dialog" aria-modal="true" aria-labelledby={id} className="platform-report-settings">
    <button type="button" className="modal-close" aria-label="Κλείσιμο ρυθμίσεων αναφορών" onClick={onClose}>×</button>
    <h2 id={id}>Ρυθμίσεις αναφορών ταμείων</h2><p>{company.name} · <strong>{store.name}</strong></p>
    <p className="report-settings-note">Η αυτόματη αποστολή δεν έχει ενεργοποιηθεί. Εδώ αποθηκεύονται οι βάρδιες και ελέγχεται η προεπισκόπηση. Δεν αλλάζουν υπόλοιπα ή χρεώσεις υπαλλήλων.</p>
    <button type="button" className="secondary" disabled={Boolean(busy)} onClick={load}>Ανανέωση ρυθμίσεων</button>
    {busy==="load"&&<p role="status">Φόρτωση ρυθμίσεων…</p>}{error&&<p role="alert" className="store-pos-alert error">{error}</p>}{message&&<p role="status">{message}</p>}
    {draft&&data&&<><form onSubmit={save}><fieldset disabled={Boolean(busy)}><legend>Επιχειρησιακή ημέρα και βάρδιες · ώρα Ελλάδας</legend>
      <div className="report-settings-hours">{[["dayStartHour","Αλλαγή ημέρας / έναρξη 1ης",5,12],["secondShiftStartHour","Έναρξη 2ης βάρδιας",6,22],["thirdShiftStartHour","Έναρξη 3ης βάρδιας",7,23]].map(([key,label,min,max])=><label key={key}>{label}<input aria-label={label} type="number" required min={min} max={max} step="1" value={draft[key]} onChange={e=>change({...draft,[key]:e.target.value===""?"":Number(e.target.value)})}/></label>)}</div>
      <p>Ώρες 0–23, χωρίς λεπτά. Η τρίτη βάρδια ανήκει στην ημέρα που ξεκίνησε, ακόμη κι αν κλείσει την επόμενη. Οι βάρδιες αντιστοιχίζονται από την πραγματική ώρα ανοίγματος· πρώιμα ή έκτακτα ανοίγματα χρειάζονται έλεγχο.</p>
      <h3>Αναμενόμενα ταμεία</h3><p>Δήλωσε κάθε ταμείο με τον ακριβή κωδικό του και τις βάρδιες που πρέπει να λειτουργεί. Το delivery μπορεί να έχει μόνο πρωινή βάρδια.</p>
      <datalist id={id+"-terminals"}>{data.observedTerminals.map(value=><option key={value} value={value}/>)}</datalist>
      {draft.terminals.map((terminal,index)=><div className="report-settings-terminal" key={index}><label>Ταμείο {index+1}<input aria-label={`Κωδικός ταμείου ${index+1}`} required maxLength="120" list={id+"-terminals"} value={terminal.terminalPos} onChange={e=>change({...draft,terminals:draft.terminals.map((t,i)=>i===index?{...t,terminalPos:e.target.value}:t)})}/></label>
        <div role="group" aria-label={`Βάρδιες ταμείου ${index+1}`}>{[1,2,3].map(slot=><label key={slot}><input type="checkbox" checked={terminal.requiredSlots.includes(slot)} onChange={e=>change({...draft,terminals:draft.terminals.map((t,i)=>i===index?{...t,requiredSlots:e.target.checked?[...t.requiredSlots,slot].sort():t.requiredSlots.filter(s=>s!==slot)}:t)})}/>{slot}η</label>)}</div>
        <button type="button" className="secondary" aria-label={`Αφαίρεση ταμείου ${index+1}`} onClick={()=>change({...draft,terminals:draft.terminals.filter((_,i)=>i!==index)})}>Αφαίρεση</button></div>)}
      <button type="button" className="secondary" disabled={draft.terminals.length>=100} onClick={()=>change({...draft,terminals:[...draft.terminals,{terminalPos:"",requiredSlots:[1,2,3]}]})}>+ Προσθήκη ταμείου</button>
      <p>Τρέχων κανόνας: <strong>{modeNames[data.cashRule.mode]||data.cashRule.mode}</strong> · αναγνώριση delivery: <strong>{data.cashRule.deliveryTerminalPattern}</strong>. Η ρύθμιση αναφορών δεν αλλάζει τον κανόνα λειτουργίας του ταμείου.</p>
      <label className="report-settings-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Επιβεβαιώνω τον εμφανιζόμενο κανόνα και τις αναμενόμενες βάρδιες αυτού του καταστήματος.</label>
      <button type="submit" disabled={!confirmed||draft.terminals.length===0}>{busy==="save"?"Αποθήκευση…":"Αποθήκευση ρυθμίσεων αναφορών"}</button>
    </fieldset></form>
    <div className="report-settings-preview"><h3>Προεπισκόπηση αποθηκευμένων ρυθμίσεων</h3>{!data.settings&&<p>Αποθήκευσε πρώτα τις βάρδιες και τα ταμεία.</p>}{dirty&&<p>Υπάρχουν αλλαγές. Αποθήκευσέ τες πριν την προεπισκόπηση ή πάτησε Ανανέωση για απόρριψη.</p>}
      <label>Ημέρα αναφοράς<input aria-label="Ημέρα αναφοράς" type="date" value={day} disabled={Boolean(busy)} onChange={e=>{setDay(e.target.value);setReport(null)}}/></label><button type="button" disabled={Boolean(busy)||dirty||!data.settings||!day} onClick={preview}>{busy==="preview"?"Ανάγνωση βαρδιών…":"Προεπισκόπηση αναφοράς"}</button>
      {report&&<div aria-live="polite"><h3>{report.ready?"Ολοκληρωμένα δεδομένα βαρδιών — προεπισκόπηση":"Αναμονή ολοκλήρωσης / ελέγχου"}</h3><p>{report.sourceCount} καταγεγραμμένες βάρδιες · ρύθμιση {report.settingsVersion}. Πρόκειται για καταγεγραμμένες διαφορές, όχι τελική πιστοποίηση ελεγκτή.</p>
        {!!report.holds.length&&<ul>{report.holds.map((hold,i)=><li key={i}>{holdNames[hold.code]||"Απαιτείται έλεγχος της πηγής."}{hold.terminalPos?` · ${hold.terminalPos}`:""}{hold.slot?` · ${hold.slot}η βάρδια`:""}{hold.sessionId?` · βάρδια ${hold.sessionId}`:""}</li>)}</ul>}
        {report.groups?.map(group=><section key={group.terminalPos+group.cashChain+group.day}><h4>{group.terminalPos} · {group.cashChain==="DELIVERY"?"Delivery":"Κατάστημα"} · {group.day}</h4><p>Αρχικά ελλείμματα: {money(group.originalShortage)} · πλεονάσματα: {money(group.originalSurplus)} · πιθανός συμψηφισμός: {money(group.offset)} · καθαρή διαφορά: <strong>{money(group.netVariance)}</strong></p><div className="report-settings-table"><table><thead><tr><th>Υπάλληλος</th><th>Αρχική διαφορά</th></tr></thead><tbody>{group.rows.map(row=><tr key={row.sessionId}><td>{row.employeeName||row.employeeId||"Δεν καταγράφηκε όνομα"}</td><td>{money(row.variance)}</td></tr>)}</tbody></table></div></section>)}
      </div>}
    </div></>}
  </section></div>;
}
