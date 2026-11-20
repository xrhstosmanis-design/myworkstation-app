import {greeceDateInput} from "../../../../shared/greece-time.mjs";
import React,{useEffect,useMemo,useRef,useState} from "react";
import {Banknote,CheckCircle2,LockKeyhole,RefreshCw,WalletCards} from "lucide-react";
import {formatWorkforceMoney} from "./workforce-v2-ui-utils.js";
import {loadPayrollWorkspace} from "./workforce-v2-payroll-load.js";

const currentMonth=()=>greeceDateInput().slice(0,7);
const monthRange=value=>{const [year,month]=value.split("-").map(Number);return {from:new Date(Date.UTC(year,month-1,1)).toISOString(),to:new Date(Date.UTC(year,month,1)).toISOString()}};
const minutes=value=>`${Math.floor(Number(value||0)/60)}ω ${Number(value||0)%60}λ`;
const periodLabel=row=>`${row.name} · ${new Date(row.periodStart).toLocaleDateString("el-GR",{timeZone:"Europe/Athens"})}–${new Date(new Date(row.periodEnd).getTime()-1).toLocaleDateString("el-GR",{timeZone:"Europe/Athens"})}`;

export default function WorkforceV2PayrollTab({company,store,request:sendRequest,readOnly=false}){
  const request=(path,options={})=>{
    if(readOnly&&String(options.method||"GET").toUpperCase()!=="GET")return Promise.reject(Error("Η πρόσβαση επιτρέπει μόνο προβολή."));
    return sendRequest(path,options);
  };
  const base=`/api/platform/store-modules/companies/${company.id}/stores/${store.id}/workforce-v2/payroll`;
  const [month,setMonth]=useState(currentMonth()),[storedPeriods,setPeriods]=useState([]),[selectedId,setSelectedId]=useState(""),[storedDetail,setDetail]=useState(null),[storedPreview,setPreview]=useState(null),[overview,setOverview]=useState(null),[overviewError,setOverviewError]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [employeeId,setEmployeeId]=useState(""),[amount,setAmount]=useState(""),[method,setMethod]=useState("BANK_TRANSFER"),[sessionId,setSessionId]=useState("");
  const sequence=useRef(0),currentScope=useRef(""),currentMonthRef=useRef(month);currentMonthRef.current=month;
  const scope=JSON.stringify([company.id,store.id,readOnly]);currentScope.current=scope;
  const [loadedScope,setLoadedScope]=useState(""),[previewMonth,setPreviewMonth]=useState("");
  const periods=loadedScope===scope?storedPeriods:[],detail=loadedScope===scope?storedDetail:null;
  const preview=loadedScope===scope&&previewMonth===month?storedPreview:null;
  const selectedLine=useMemo(()=>detail?.lines?.find(row=>row.employeeId===employeeId)||null,[detail,employeeId]);
  const openSessions=overview?.openSessions?.length?overview.openSessions:(overview?.openSession?[overview.openSession]:[]);
  const clearData=()=>{setPeriods([]);setSelectedId("");setDetail(null);setPreview(null);setPreviewMonth("");setOverview(null);setOverviewError("");setLoadedScope("")};
  const readDetail=async id=>{
    if(!id)return null;
    const value=await request(`${base}/periods/${encodeURIComponent(id)}`);
    if(readOnly&&(value?.companyId!==company.id||value.storeId!==store.id||value.id!==id||!Array.isArray(value.lines)||!Array.isArray(value.payments)))throw Error("Δεν επιβεβαιώθηκε η περίοδος μισθοδοσίας του καταστήματος.");
    return value;
  };
  const applyDetail=value=>{
    setDetail(value);
    const line=value?.lines?.find(row=>Number(row.balanceAmount)>0);
    setEmployeeId(line?.employeeId||"");setAmount(line?Number(line.balanceAmount).toFixed(2):"");
  };
  const loadDetail=async id=>{
    const current=++sequence.current,own=scope;
    setDetail(null);setPreview(null);setBusy(true);setError("");
    try{
      const value=await readDetail(id);
      if(current!==sequence.current||own!==currentScope.current)return;
      applyDetail(value);setLoadedScope(own);
    }catch(e){if(current===sequence.current&&own===currentScope.current){clearData();setError(e.message)}}
    finally{if(current===sequence.current&&own===currentScope.current)setBusy(false)}
  };
  const load=async({keepNotice=false,preferredId=""}={})=>{
    const current=++sequence.current,own=scope,wanted=preferredId||selectedId;
    clearData();setBusy(true);setError("");if(!keepNotice)setNotice("");
    try{
      let workspace;
      if(readOnly){
        const result=await request(`${base}/periods`);
        if(result?.companyId!==company.id||result.storeId!==store.id||!Array.isArray(result.items))throw Error("Δεν επιβεβαιώθηκε η μισθοδοσία του καταστήματος.");
        workspace={rows:result.items,overview:null,overviewError:""};
      }else workspace=await loadPayrollWorkspace(request,base);
      if(current!==sequence.current||own!==currentScope.current)return;
      const id=workspace.rows.some(row=>row.id===wanted)?wanted:(workspace.rows[0]?.id||"");
      const value=await readDetail(id);
      if(current!==sequence.current||own!==currentScope.current)return;
      setPeriods(workspace.rows);setOverview(workspace.overview);setOverviewError(workspace.overviewError);setSelectedId(id);applyDetail(value);setLoadedScope(own);
    }catch(e){if(current===sequence.current&&own===currentScope.current){clearData();setError(e.message)}}
    finally{if(current===sequence.current&&own===currentScope.current)setBusy(false)}
  };
  useEffect(()=>{load();return()=>{sequence.current++}},[company.id,store.id,readOnly,sendRequest]);
  const showPreview=async()=>{
    const current=++sequence.current,own=scope,ownMonth=month;
    setPreview(null);setBusy(true);setError("");setNotice("");
    try{
      const range=monthRange(month);
      const result=await request(`${base}/preview?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`);
      if(current!==sequence.current||own!==currentScope.current||ownMonth!==currentMonthRef.current)return;
      if(readOnly&&(result?.companyId!==company.id||result.storeId!==store.id||result.from!==range.from||result.to!==range.to||!Array.isArray(result.entries)))throw Error("Δεν επιβεβαιώθηκε η προεπισκόπηση μισθοδοσίας του καταστήματος.");
      setPreview(result);setPreviewMonth(ownMonth);setLoadedScope(own);
    }catch(e){if(current===sequence.current&&own===currentScope.current){clearData();setError(e.message)}}
    finally{if(current===sequence.current&&own===currentScope.current)setBusy(false)}
  };
  const createPeriod=async()=>{setBusy(true);setError("");try{const range=monthRange(month),name=`Μισθοδοσία ${month}`;const created=await request(`${base}/periods`,{method:"POST",body:JSON.stringify({...range,name})});setNotice(created.message);setPreview(null);await load({keepNotice:true,preferredId:created.id})}catch(e){setError(e.message);setBusy(false)}};
  const recalculate=async()=>{const reason=window.prompt("Αιτιολογία επανυπολογισμού προσχεδίου:","Ελέγχθηκαν και εγκρίθηκαν οι διορθωμένες παρουσίες.");if(!reason)return;setBusy(true);setError("");try{const result=await request(`${base}/periods/${detail.id}/recalculate`,{method:"POST",body:JSON.stringify({confirmed:true,reason})});setNotice(result.message);await loadDetail(detail.id);setPreview(null)}catch(e){setError(e.message)}finally{setBusy(false)}};
  const selectEmployee=id=>{setEmployeeId(id);const line=detail?.lines?.find(row=>row.employeeId===id);setAmount(line?Number(line.balanceAmount).toFixed(2):"")};
  const pay=async()=>{if(!employeeId)return setError("Επίλεξε εργαζόμενο.");if(method==="CASH_SHIFT"&&overviewError)return setError("Οι ενεργές βάρδιες ταμείου δεν φορτώθηκαν. Ανανέωσε πριν από πληρωμή με μετρητά.");if(method==="CASH_SHIFT"&&!sessionId)return setError("Επίλεξε ενεργή βάρδια ταμείου.");setBusy(true);setError("");try{const requestKey=globalThis.crypto?.randomUUID?.()||`pay-${Date.now()}-${Math.random()}`;const result=await request(`${base}/periods/${detail.id}/payments`,{method:"POST",body:JSON.stringify({employeeId,amount:Number(amount),paymentMethod:method,sessionId:method==="CASH_SHIFT"?sessionId:null,requestKey})});setNotice(result.message);await loadDetail(detail.id)}catch(e){setError(e.message)}finally{setBusy(false)}};
  const closePeriod=async()=>{const reason=window.prompt("Αιτιολογία οριστικοποίησης περιόδου:","Ολοκληρώθηκαν και ελέγχθηκαν όλες οι πληρωμές.");if(!reason)return;setBusy(true);setError("");try{const result=await request(`${base}/periods/${detail.id}/close`,{method:"POST",body:JSON.stringify({confirmed:true,reason})});setNotice(result.message);await load({keepNotice:true})}catch(e){setError(e.message);setBusy(false)}};
  const totals=(detail?.lines||[]).reduce((sum,row)=>({gross:sum.gross+Number(row.grossAmount||0),paid:sum.paid+Number(row.paidAmount||0),balance:sum.balance+Number(row.balanceAmount||0)}),{gross:0,paid:0,balance:0});
  const guide=<details className="workforce-payroll-guide"><summary>Αναλυτικός οδηγός μισθοδοσίας</summary><div className="workforce-payroll-guide-body"><p><b>Ποιος:</b> Ιδιοκτήτης ή Super Admin με πρόσβαση στο συγκεκριμένο κατάστημα και στη Μισθοδοσία. Το MYWORKSTATION LAB είναι εικονικό· τα πραγματικά καταστήματα έχουν χωριστά δεδομένα.</p><ol><li><b>Παρουσίες:</b> Στην καρτέλα «Παρουσίες» επίλεξε ημέρα και έλεγξε έναρξη, λήξη, πρόγραμμα, πραγματικές ώρες και προειδοποιήσεις. Για ξεχασμένο κλείσιμο διάλεξε «Διόρθωση ωρών», βάλε τις ώρες και τα λεπτά που αποφασίστηκαν και γράψε αιτιολογία. Η αρχική εγγραφή μένει στο Audit. Μετά κάνε ξεχωριστή «Έγκριση ελέγχου» ή «Έγκριση 8+ ωρών» με αιτιολογία. Μην εγκρίνεις εκκρεμή ή ανοικτή εγγραφή μόνο επειδή εμφανίζεται στη λίστα.</li><li><b>Προεπισκόπηση:</b> Στη «Μισθοδοσία» διάλεξε μήνα και πάτησε «Υπολογισμός». Σύγκρινε τις πραγματικές ώρες, την αξία ανά εργαζόμενο και το συνολικό ποσό με τις εγκεκριμένες παρουσίες.</li><li><b>Περίοδος:</b> Δημιούργησε DRAFT μόνο μία φορά για το διάστημα και επίλεξέ το από τη λίστα. Αν εγκρίθηκαν ή διορθώθηκαν παρουσίες αργότερα, πάτησε «Επανυπολογισμός περιόδου» με αιτιολογία. Οι υπάρχουσες πληρωμές διατηρούνται. Ο επανυπολογισμός απορρίπτεται όταν εκκρεμούν παρουσίες ή οι ήδη πληρωμένες αξίες υπερβαίνουν τη νέα οφειλή.</li><li><b>Πληρωμές:</b> Επίλεξε εργαζόμενο, ποσό έως το διαθέσιμο υπόλοιπό του και τρόπο. Μπορείς να βάλεις μερική πληρωμή και έπειτα το υπόλοιπο. Για «Μετρητά ενεργής βάρδιας» επίλεξε συγκεκριμένο ανοικτό ταμείο του ίδιου καταστήματος και έλεγξε την κίνησή του. Η «Τραπεζική μεταφορά» δημιουργεί εσωτερική κίνηση στο εικονικό Ταμείο Τράπεζας· δεν στέλνει χρήματα σε τράπεζα. Το αποδεικτικό και η συμφωνία της τραπεζικής κίνησης ελέγχονται χωριστά.</li><li><b>Κλείδωμα:</b> Όταν όλες οι παρουσίες έχουν εγκριθεί, το DRAFT συμφωνεί με την προεπισκόπηση και κάθε εργαζόμενος έχει μηδενικό υπόλοιπο, πάτησε «Οριστικό κλείδωμα» και γράψε αιτιολογία. Η κατάσταση γίνεται CLOSED και οι πληρωμές/αλλαγές στην περίοδο απενεργοποιούνται.</li></ol><p><b>Έλεγχος και όρια:</b> Επαλήθευσε μικτά = πληρωμένα και υπόλοιπο 0,00 €, τη σωστή βάρδια για μετρητά και τις τραπεζικές κινήσεις χωριστά. Οι εγκρίσεις, διορθώσεις, επανυπολογισμοί, πληρωμές και κλείδωμα γράφονται στο Audit. Το κλείδωμα απορρίπτεται για ανοικτές/ανεξέλεγκτες ή μεταγενέστερα αλλαγμένες παρουσίες. Η τραπεζική ένδειξη «Σε αναμονή» δεν αποτελεί επιβεβαίωση αποδεικτικού.</p><p><b>Αν κάτι δεν συμφωνεί:</b> Ανανέωσε την ενότητα, έλεγξε σωστό κατάστημα/μήνα, επίλεξε το υπάρχον DRAFT και ξανασύγκρινε προεπισκόπηση και γραμμές. Έλεγξε τις παρουσίες πριν επανυπολογίσεις. Αν η νέα οφειλή είναι μικρότερη από ήδη καταχωρισμένη πληρωμή, σταμάτα και κάνε χειροκίνητη συμφωνία· το σύστημα δεν διαγράφει την κίνηση. Αν δεν εμφανίζεται ταμείο, βεβαιώσου ότι υπάρχει ανοικτή βάρδια στο ίδιο κατάστημα.</p></div></details>;
  return <section className="workforce-payroll-workspace">
    {!readOnly&&guide}
    <div className="workforce-v2-section-title"><div><h3><Banknote/> Μισθοδοσία προσωπικού</h3><p>Ένας χώρος για υπολογισμό, πληρωμές από ταμείο ή τράπεζα και οριστικό κλείδωμα.</p></div><button className="secondary" onClick={()=>load()} disabled={busy}><RefreshCw/> Ανανέωση</button></div>
    {error&&<div className="platform-alert error" role="alert">{error}</div>}{overviewError&&<div className="platform-alert error">Οι ενεργές βάρδιες ταμείου δεν φορτώθηκαν: {overviewError}. Η πληρωμή με μετρητά δεν είναι διαθέσιμη.</div>}{notice&&<div className="platform-alert success">{notice}</div>}
    <div className="workforce-payroll-steps"><article><b>1</b><span>Διάστημα</span><label>Μήνας<input type="month" value={month} onChange={event=>setMonth(event.target.value)}/></label><button onClick={showPreview} disabled={busy}>Υπολογισμός</button></article>{!readOnly&&<><article><b>2</b><span>Έλεγχος</span><strong>{preview?formatWorkforceMoney(preview.totalAmount):"Δες πρώτα την προεπισκόπηση"}</strong><button onClick={createPeriod} disabled={busy||!preview||Boolean(preview.pendingRemunerationCount)}>Δημιουργία περιόδου</button></article><article><b>3</b><span>Πληρωμές</span><strong>{detail?`${detail.lines.length} εργαζόμενοι`:"Επίλεξε περίοδο"}</strong></article><article className={detail?.status==="CLOSED"?"done":""}><b>{detail?.status==="CLOSED"?<CheckCircle2/>:4}</b><span>Κλείδωμα</span><strong>{detail?.status==="CLOSED"?"Οριστικοποιήθηκε":"Μετά την εξόφληση"}</strong></article></>}</div>
    {preview&&<div className="workforce-payroll-preview"><div><b>Προεπισκόπηση {month}</b><span>{preview.entries.length} εργαζόμενοι · {formatWorkforceMoney(preview.totalAmount)}</span></div><small>{preview.note}</small></div>}
    <div className="workforce-payroll-period-select"><label>Περίοδος<select value={selectedId} disabled={busy} onChange={event=>{setSelectedId(event.target.value);loadDetail(event.target.value)}}><option value="">Δεν υπάρχει περίοδος</option>{periods.map(row=><option key={row.id} value={row.id}>{periodLabel(row)} · {row.status}</option>)}</select></label></div>
    {!readOnly&&detail?.status==="DRAFT"&&<div className="workforce-payroll-preview"><b>Συμφωνία προσχεδίου</b><small>Αν άλλαξαν οι παρουσίες, επανυπολόγισε την ίδια περίοδο. Οι υπάρχουσες πληρωμές διατηρούνται· υπερπληρωμή απορρίπτεται.</small><button onClick={recalculate} disabled={busy}>Επανυπολογισμός περιόδου</button></div>}
    {detail?<><div className="workforce-payroll-metrics"><article><span>Μικτά</span><b>{formatWorkforceMoney(totals.gross)}</b></article><article><span>Πληρωμένα</span><b>{formatWorkforceMoney(totals.paid)}</b></article><article className={totals.balance?"warn":"ok"}><span>Υπόλοιπο</span><b>{formatWorkforceMoney(totals.balance)}</b></article><article><span>Κατάσταση</span><b>{detail.status==="CLOSED"?"Κλειδωμένη":"Προσχέδιο"}</b></article></div><div className="workforce-payroll-table"><div className="head"><span>Εργαζόμενος</span><span>Πρόγραμμα</span><span>Πραγματικά</span><span>Απουσία</span><span>Μικτά</span><span>Πληρωμένα</span><span>Υπόλοιπο</span></div>{detail.lines.map(row=><button type="button" className={employeeId===row.employeeId?"selected":""} key={row.id} onClick={()=>selectEmployee(row.employeeId)} disabled={readOnly||detail.status==="CLOSED"}><span><b>{row.employeeName}</b><small>{row.calculationJson?.paymentType||""}</small></span><span>{minutes(row.plannedMinutes)}</span><span>{minutes(row.actualMinutes)}</span><span>{minutes(row.absenceMinutes)}</span><span>{formatWorkforceMoney(row.grossAmount)}</span><span>{formatWorkforceMoney(row.paidAmount)}</span><strong>{formatWorkforceMoney(row.balanceAmount)}</strong></button>)}</div>{!readOnly&&detail.status==="DRAFT"?<div className="workforce-payroll-payment"><div><h4><WalletCards/> Νέα πληρωμή</h4><p>{selectedLine?`${selectedLine.employeeName} · διαθέσιμο ${formatWorkforceMoney(selectedLine.balanceAmount)}`:"Επίλεξε εργαζόμενο από τον πίνακα."}</p></div><label>Ποσό<input type="number" min="0.01" step="0.01" value={amount} onChange={event=>setAmount(event.target.value)}/></label><label>Τρόπος<select value={method} onChange={event=>setMethod(event.target.value)}><option value="BANK_TRANSFER">Τραπεζική μεταφορά</option><option value="CORPORATE_CARD">Εταιρική κάρτα</option><option value="CASH_SHIFT">Μετρητά ενεργής βάρδιας</option></select></label>{method==="CASH_SHIFT"&&<label>Ενεργή βάρδια<select value={sessionId} onChange={event=>setSessionId(event.target.value)}><option value="">Επίλεξε ταμείο</option>{openSessions.map(row=><option key={row.id} value={row.id}>{row.terminalPos||"MAIN"} · {row.shiftLabel||"Βάρδια"}</option>)}</select></label>}<button onClick={pay} disabled={busy||!selectedLine||!(Number(amount)>0)}>Καταχώριση πληρωμής</button><button className="workforce-close-payroll" onClick={closePeriod} disabled={busy||totals.balance>0}><LockKeyhole/> Οριστικό κλείδωμα</button></div>:detail.status==="CLOSED"?<div className="workforce-payroll-locked"><LockKeyhole/><div><b>Η περίοδος έχει οριστικοποιηθεί</b><span>Δεν επιτρέπονται άλλες πληρωμές ή αλλαγές.</span></div></div>:null}</>:<div className="workforce-empty">{readOnly?"Επίλεξε μία διαθέσιμη περίοδο μισθοδοσίας.":"Δημιούργησε ή επίλεξε μία περίοδο μισθοδοσίας."}</div>}
  </section>;
}
