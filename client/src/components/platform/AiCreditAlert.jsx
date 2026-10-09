import React,{useEffect,useRef,useState} from "react";
import {AlertTriangle,WalletCards} from "lucide-react";
import "./ai-credit-alert.css";

const labels={OK:"Υπόλοιπο AI",WARNING:"Χαμηλό υπόλοιπο AI — προγραμμάτισε ανανέωση",CRITICAL:"Κρίσιμο υπόλοιπο AI — χρειάζεται ανανέωση",EXHAUSTED:"Εκτιμώμενο υπόλοιπο AI εξαντλημένο — χρειάζεται ανανέωση",UNKNOWN:"Υπόλοιπο AI μη διαθέσιμο"};
const reasons={BILLING_NOT_CONFIGURED:"Η αυτόματη παρακολούθηση κόστους δεν έχει συνδεθεί.",BASELINE_REQUIRED:"Καταχώρισε το τρέχον υπόλοιπο του λογαριασμού χρέωσης.",BASELINE_STALE:"Χρειάζεται νέα επιβεβαίωση υπολοίπου (τουλάχιστον κάθε 7 ημέρες).",BILLING_ACCOUNT_CHANGED:"Άλλαξε η σύνδεση χρέωσης. Επιβεβαίωσε ξανά λογαριασμό και υπόλοιπο.",BILLING_ACCESS_DENIED:"Η σύνδεση κόστους δεν έχει τα απαιτούμενα δικαιώματα.",BILLING_REVISED:"Αναθεωρήθηκαν τα στοιχεία κόστους. Επιβεβαίωσε ξανά το υπόλοιπο.",BILLING_STALE:"Τα στοιχεία κόστους είναι παλιά. Το υπόλοιπο δεν επιβεβαιώνεται."};
const usd=value=>Number(value).toLocaleString("el-GR",{style:"currency",currency:"USD"});
const time=value=>value?new Date(value).toLocaleString("el-GR",{timeZone:"Europe/Athens"}):"—";

export default function AiCreditAlert({request,settings=false,onOpenSettings}){
  const [data,setData]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const [warning,setWarning]=useState("5"),[critical,setCritical]=useState("2"),[balance,setBalance]=useState(""),[confirmed,setConfirmed]=useState(false),[editing,setEditing]=useState(false);
  const editVersion=useRef(null);
  const sequence=useRef(0),mounted=useRef(false),saving=useRef(false),dirty=useRef(false);
  const accept=result=>{setData(result);if(!dirty.current){setWarning(String(result.warningUsd));setCritical(String(result.criticalUsd))}};
  const load=async()=>{
    if(saving.current)return;
    const id=++sequence.current;
    try{const result=await request("/api/platform/ai-credits");if(mounted.current&&id===sequence.current){accept(result);setError("")}}
    catch{if(mounted.current&&id===sequence.current){setError("Δεν ενημερώθηκε το υπόλοιπο AI.");setData(current=>current?{...current,state:"UNKNOWN",balanceUsd:null}:null)}}
  };
  useEffect(()=>{
    mounted.current=true;load();
    const timer=setInterval(load,60_000);
    window.addEventListener("ai-credit-monitor-updated",load);
    return()=>{mounted.current=false;sequence.current++;clearInterval(timer);window.removeEventListener("ai-credit-monitor-updated",load)};
  },[request]);
  const save=async event=>{
    event.preventDefault();saving.current=true;sequence.current++;setBusy(true);setError("");
    try{
      const values={warningUsd:Number(warning),criticalUsd:Number(critical),version:editVersion.current};
      if(balance.trim())Object.assign(values,{balanceUsd:Number(balance.replace(",",".")),accountConfirmed:confirmed});
      const result=await request("/api/platform/ai-credits",{method:"PUT",body:JSON.stringify(values)});
      if(mounted.current){dirty.current=false;accept(result);setBalance("");setConfirmed(false);setEditing(false);editVersion.current=null;window.dispatchEvent(new Event("ai-credit-monitor-updated"))}
    }catch(err){if(mounted.current)setError(err.message||"Δεν αποθηκεύτηκαν οι ρυθμίσεις.")}
    finally{saving.current=false;if(mounted.current)setBusy(false)}
  };
  const state=data?.state||"UNKNOWN",tone=state==="OK"?"ok":["CRITICAL","EXHAUSTED"].includes(state)?"danger":"warn";
  return <section className={`ai-credit-alert ${tone}`} aria-label="Ειδοποιήσεις υπολοίπου AI">
    <div className="ai-credit-summary" role={tone!=="ok"?"status":undefined}>
      {tone==="ok"?<WalletCards aria-hidden="true"/>:<AlertTriangle aria-hidden="true"/>}
      <div><b>{labels[state]||labels.UNKNOWN}</b><span>{data?.balanceUsd!=null?`Εκτιμώμενο υπόλοιπο ${usd(data.balanceUsd)}`:data?reasons[data.code]||"Η πηγή κόστους δεν είναι διαθέσιμη. Έλεγξε τον λογαριασμό χρέωσης.":"Φόρτωση υπολοίπου…"}</span></div>
      {settings?<button type="button" disabled={!data||busy} onClick={()=>{if(!editing){editVersion.current=data.version;dirty.current=false;setWarning(String(data.warningUsd));setCritical(String(data.criticalUsd))}setEditing(value=>!value)}}>Ρυθμίσεις ειδοποιήσεων</button>:<button type="button" onClick={onOpenSettings}>Έλεγχος AI</button>}
    </div>
    {error&&<p role="alert">{error}</p>}
    {settings&&<><p className="ai-credit-note">Εκτίμηση από επιβεβαιωμένο υπόλοιπο και κόστος όλου του λογαριασμού. Τα στοιχεία χρέωσης μπορεί να καθυστερούν. Νέα αγορά ή λήξη credits απαιτεί νέα επιβεβαίωση υπολοίπου. Έλεγχος: {time(data?.checkedAt)}.</p>
      {editing&&<form onSubmit={save}>
        <label>Προειδοποίηση κάτω από ($)<input type="number" min="0.01" max="100000" step="0.01" required value={warning} onChange={event=>{dirty.current=true;setWarning(event.target.value)}}/></label>
        <label>Κρίσιμο όριο ($)<input type="number" min="0" max="99999.99" step="0.01" required value={critical} onChange={event=>{dirty.current=true;setCritical(event.target.value)}}/></label>
        <label>Τρέχον υπόλοιπο ($)<input type="text" inputMode="decimal" placeholder="Προαιρετικά: νέο υπόλοιπο" value={balance} onChange={event=>setBalance(event.target.value)}/></label>
        <label className="ai-credit-confirm"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>Επιβεβαιώνω ότι το νέο υπόλοιπο αφορά τον ίδιο λογαριασμό AI που παρακολουθεί το MyWorkStation.</label>
        <small>Η αποθήκευση αλλάζει μόνο την παρακολούθηση. Δεν αγοράζει credits. Βάση υπολοίπου: {time(data?.baselineAt)}.</small>
        <button type="submit" disabled={busy||!data||!!balance.trim()&&!confirmed}>{busy?"Αποθήκευση…":"Αποθήκευση ειδοποιήσεων"}</button>
      </form>}
    </>}
  </section>;
}
